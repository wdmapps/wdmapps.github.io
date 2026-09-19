const { onSchedule } = require('firebase-functions/v2/scheduler');
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
