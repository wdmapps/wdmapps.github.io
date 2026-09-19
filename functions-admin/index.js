const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const META_WHATSAPP_TOKEN = defineSecret('META_WHATSAPP_TOKEN');
const META_PHONE_NUMBER_ID = defineSecret('META_PHONE_NUMBER_ID');
const META_GRAPH_VERSION = defineString('META_GRAPH_VERSION');
const WHATSAPP_TEMPLATE_NAME = defineString('WHATSAPP_TEMPLATE_NAME', { default: 'lembrete_renovacao' });
const WHATSAPP_TEMPLATE_LANG = defineString('WHATSAPP_TEMPLATE_LANG', { default: 'pt_BR' });

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
const OPENAI_MODEL = defineString('OPENAI_MODEL', { default: 'gpt-5.6-luna' });
const SQUAD_ADMIN_EMAIL = 'williamwdm@gmail.com';

const SQUAD_AGENTS = {
  radar: {
    name: 'Radar',
    role: 'Prospecção',
    web: true,
    prompt: 'Pesquise oportunidades comerciais e sinais de demanda para a WDM Apps. Considere o segmento e a região do cliente, presença digital dos concorrentes, lacunas locais e serviços que podem gerar valor. Entregue oportunidades priorizadas e fontes quando usar a web.'
  },
  scout: {
    name: 'Scout',
    role: 'Diagnóstico',
    web: true,
    prompt: 'Faça uma auditoria prática da presença digital do cliente. Analise site, posicionamento local, Google, redes sociais, clareza da oferta, confiança, conversão, SEO local e gargalos. Entregue achados priorizados, evidências e ações recomendadas.'
  },
  copy: {
    name: 'Copy',
    role: 'Conteúdo',
    web: false,
    prompt: 'Crie conteúdo comercial pronto para revisão da WDM Apps. Produza mensagens de WhatsApp, textos para Instagram/Facebook, headline, oferta e chamadas para ação coerentes com o diagnóstico e sem inventar fatos.'
  },
  studio: {
    name: 'Studio',
    role: 'Criativo',
    web: false,
    prompt: 'Crie direção criativa para o cliente: conceito visual, headline, composição da arte, ideias de imagens, roteiro curto de vídeo e variações de campanha. Evite aparência genérica e mantenha foco local e comercial.'
  },
  web: {
    name: 'Web',
    role: 'Sites',
    web: false,
    prompt: 'Proponha a estrutura do site ou landing page com foco em conversão e SEO local. Defina seções, CTAs, provas sociais, conteúdo, melhorias técnicas e prioridades de implementação para a WDM Apps.'
  },
  growth: {
    name: 'Growth',
    role: 'Divulgação',
    web: false,
    prompt: 'Monte um plano de divulgação de baixo custo e mensurável usando os achados anteriores. Defina canais, calendário, ações, orçamento inicial opcional, testes e métricas. Não publique nem envie nada: deixe tudo pronto para aprovação humana.'
  },
  analyst: {
    name: 'Analyst',
    role: 'Resultados',
    web: false,
    prompt: 'Consolide toda a missão em um resumo executivo. Liste diagnóstico, oportunidades, materiais produzidos, próximos passos, métricas a acompanhar e uma ordem prática de execução. Separe fatos de hipóteses.'
  }
};

function cleanText(value, max = 5000) {
  return String(value == null ? '' : value).slice(0, max);
}

function assertSquadAdmin(request) {
  const email = cleanText(request.auth?.token?.email, 320).toLowerCase();
  if (!request.auth || email !== SQUAD_ADMIN_EMAIL.toLowerCase()) {
    throw new HttpsError('permission-denied', 'Acesso restrito ao administrador da WDM Squad.');
  }
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const chunks = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (part?.type === 'output_text' && typeof part.text === 'string') chunks.push(part.text);
    }
  }
  return chunks.join('\n').trim();
}

async function callOpenAIForSquad(agentId, client, objective, previousResults) {
  const agent = SQUAD_AGENTS[agentId];
  if (!agent) throw new HttpsError('invalid-argument', 'Agente desconhecido.');

  const prior = Object.entries(previousResults || {})
    .slice(-6)
    .map(([key, value]) => `${key.toUpperCase()}:\n${cleanText(value, 3500)}`)
    .join('\n\n');

  const input = [
    'Você faz parte da WDM Squad, agência de IA da WDM Apps.',
    `AGENTE: ${agent.name} · ${agent.role}`,
    '',
    'CLIENTE:',
    `Nome: ${cleanText(client?.name, 220) || 'não informado'}`,
    `Segmento: ${cleanText(client?.segment, 300) || 'não informado'}`,
    `Região: ${cleanText(client?.city, 220) || 'não informada'}`,
    `Site: ${cleanText(client?.site, 500) || 'não informado'}`,
    `Instagram: ${cleanText(client?.instagram, 220) || 'não informado'}`,
    `Observações: ${cleanText(client?.notes, 1500) || 'nenhuma'}`,
    '',
    `OBJETIVO DA MISSÃO: ${cleanText(objective, 1800) || 'Encontrar oportunidades e preparar um plano comercial e digital acionável.'}`,
    prior ? `\nRESULTADOS DOS AGENTES ANTERIORES:\n${prior}` : '',
    '',
    'MISSÃO DESTE AGENTE:',
    agent.prompt,
    '',
    'REGRAS:',
    '- Responda em português do Brasil.',
    '- Seja prático, organizado e específico.',
    '- Não invente informações sobre o cliente.',
    '- Quando houver incerteza, sinalize como hipótese.',
    '- Não envie mensagens, não publique, não compre mídia e não execute ações externas. Prepare tudo para aprovação do administrador.',
    '- Termine com uma seção "Próxima passagem" explicando o que o próximo agente deve aproveitar.'
  ].filter(Boolean).join('\n');

  const body = {
    model: OPENAI_MODEL.value(),
    input,
    max_output_tokens: 1800
  };
  if (agent.web) body.tools = [{ type: 'web_search' }];

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY.value()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const raw = await response.text();
  let payload;
  try { payload = JSON.parse(raw); } catch (_) { payload = null; }

  if (!response.ok) {
    const apiMessage = cleanText(payload?.error?.message || raw || `HTTP ${response.status}`, 900);
    throw new Error(`OpenAI ${response.status}: ${apiMessage}`);
  }

  const text = extractResponseText(payload);
  if (!text) throw new Error('A IA não retornou texto utilizável.');
  return text;
}

exports.runSquadAgent = onCall({
  region: 'us-central1',
  timeoutSeconds: 240,
  memory: '512MiB',
  secrets: [OPENAI_API_KEY]
}, async (request) => {
  assertSquadAdmin(request);

  const data = request.data || {};
  const agentId = cleanText(data.agentId, 40).toLowerCase();
  const client = data.client && typeof data.client === 'object' ? data.client : {};
  const objective = cleanText(data.objective, 1800);
  const previousResults = data.previousResults && typeof data.previousResults === 'object'
    ? data.previousResults
    : {};

  if (!SQUAD_AGENTS[agentId]) {
    throw new HttpsError('invalid-argument', 'Escolha um agente válido.');
  }
  if (!cleanText(client.name, 220)) {
    throw new HttpsError('invalid-argument', 'O cliente precisa ter um nome.');
  }

  try {
    const text = await callOpenAIForSquad(agentId, client, objective, previousResults);
    return {
      agentId,
      agentName: SQUAD_AGENTS[agentId].name,
      role: SQUAD_AGENTS[agentId].role,
      model: OPENAI_MODEL.value(),
      usedWeb: SQUAD_AGENTS[agentId].web,
      text
    };
  } catch (error) {
    console.error('WDM Squad agent failed', agentId, error);
    throw new HttpsError('internal', cleanText(error?.message || error, 900));
  }
});


function saoPauloYmd(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function addDays(ymd, offset) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + offset);
  return dt.toISOString().slice(0, 10);
}

function brDate(ymd) {
  return ymd.split('-').reverse().join('/');
}

async function sendTemplate(to, clientName, renewalDate) {
  const graphVersion = META_GRAPH_VERSION.value();
  const phoneNumberId = META_PHONE_NUMBER_ID.value();
  const token = META_WHATSAPP_TOKEN.value();

  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: String(to || '').replace(/\D/g, ''),
      type: 'template',
      template: {
        name: WHATSAPP_TEMPLATE_NAME.value(),
        language: { code: WHATSAPP_TEMPLATE_LANG.value() },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: clientName },
            { type: 'text', text: brDate(renewalDate) },
          ],
        }],
      },
    }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`WhatsApp ${response.status}: ${text}`);
  return JSON.parse(text);
}

exports.sendIptvRenewalReminders = onSchedule({
  schedule: '0 9 * * *',
  timeZone: 'America/Sao_Paulo',
  secrets: [META_WHATSAPP_TOKEN, META_PHONE_NUMBER_ID],
}, async () => {
  const snap = await db.collection('wdmAdmin').doc('iptv').get();
  if (!snap.exists) return;

  const data = snap.data() || {};
  const clients = Array.isArray(data.clients) ? data.clients : [];
  const today = saoPauloYmd();
  const targetIn3Days = addDays(today, 3);

  const due = clients.filter((c) =>
    c && c.autoNotify === true && c.renewalDate === targetIn3Days && c.whatsapp
  );

  for (const client of due) {
    const logId = `${client.id}_${client.renewalDate}_D3`;
    const logRef = db.collection('iptvNotificationLogs').doc(logId);
    const existing = await logRef.get();
    if (existing.exists) continue;

    try {
      const result = await sendTemplate(client.whatsapp, client.name || 'cliente', client.renewalDate);
      await logRef.set({
        clientId: client.id,
        renewalDate: client.renewalDate,
        type: '3_days_before',
        sentAt: FieldValue.serverTimestamp(),
        messageId: result?.messages?.[0]?.id || null,
      });
    } catch (error) {
      console.error('Falha ao enviar lembrete IPTV', client.id, error);
      await logRef.set({
        clientId: client.id,
        renewalDate: client.renewalDate,
        type: '3_days_before',
        failedAt: FieldValue.serverTimestamp(),
        error: String(error?.message || error).slice(0, 1000),
      });
    }
  }
});
