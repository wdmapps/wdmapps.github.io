let radarSearchInFlight=false;
const DB_DOC = 'squad';
let db = null;
let state = null;
const SQUAD_API_URL = 'https://wdmappsgithubio.wdmapps.deno.net/squad/agent';

const MORGAN = {
  id:'morgan',icon:'🧠',name:'Morgan',role:'Squad Commander',
  desc:'Recebe a missão, coordena especialistas, acompanha conflitos e mantém o objetivo da operação.',
  persona:'Calmo, estratégico e objetivo. Faz a Squad trabalhar como uma unidade.'
};
const AGENTS = [
  {id:'radar',icon:'📡',name:'Ray',role:'Radar · Prospecção',desc:'Pesquisa empresas e encontra oportunidades reais para a WDM Apps.',persona:'Caçador de oportunidades, rápido e guiado por evidências.',prompt:'Pesquise empresas e oportunidades comerciais relevantes para a WDM Apps na região do cliente. Priorize negócios reais sem site oficial; depois, negócios com site fraco ou presença digital limitada. Use apenas informações públicas verificáveis e não invente ausência de site.'},
  {id:'scout',icon:'🔎',name:'Scott',role:'Scout · Inteligência',desc:'Valida descobertas, audita presença digital e elimina falsos positivos.',persona:'Cético, minucioso e independente. Não aprova um lead sem evidência.',prompt:'Faça uma auditoria da presença digital do cliente. Analise site, posicionamento local, Google, redes sociais, clareza da oferta, confiança, conversão e oportunidades de melhoria. Entregue achados priorizados.'},
  {id:'copy',icon:'✍️',name:'Claire',role:'Copy · Comunicação',desc:'Transforma estratégia em mensagens, ofertas, anúncios e abordagens humanas.',persona:'Clara, empática e persuasiva sem parecer robótica.',prompt:'Crie conteúdo comercial para o cliente com foco em gerar contatos. Produza opções de texto para WhatsApp, Instagram/Facebook e chamada curta para anúncio, respeitando a identidade e os serviços do negócio.'},
  {id:'studio',icon:'🎨',name:'Vega',role:'Studio · Criativo',desc:'Cria conceitos visuais, campanhas e roteiros que dão identidade à missão.',persona:'Visual, inventiva e exigente com consistência de marca.',prompt:'Crie uma direção criativa para campanha do cliente: conceito visual, headline, elementos da arte, roteiro curto de vídeo e ideias de antes/depois. O material deve parecer profissional e local, não genérico.'},
  {id:'web',icon:'💻',name:'Dex',role:'Web · Desenvolvimento',desc:'Planeja sites, landing pages, automações e melhorias de conversão.',persona:'Prático, técnico e orientado a construir soluções utilizáveis.',prompt:'Analise o site do cliente e proponha melhorias de conversão e SEO local. Sugira estrutura, seções, CTAs, provas sociais, palavras-chave locais e ações técnicas com maior impacto.'},
  {id:'growth',icon:'🚀',name:'Mark',role:'Marketing · Growth',desc:'Define canais, campanhas, distribuição e formas de fazer a oferta ganhar alcance.',persona:'Criativo, comercial e obcecado por testar o que gera resultado.',prompt:'Monte um plano de divulgação para o cliente usando Google, WhatsApp, Instagram, Facebook e canais locais relevantes. Priorize ações de baixo custo e mensuráveis, com calendário de execução.'},
  {id:'analyst',icon:'📊',name:'Alex',role:'Analyst · Performance',desc:'Mede resultados, confronta hipóteses e aponta o próximo movimento.',persona:'Analítico, franco e orientado a números e aprendizado.',prompt:'Defina um painel simples de resultados para o cliente. Inclua métricas de tráfego, cliques, contatos, origem dos leads, campanhas e ações recomendadas a partir dos números.'}
];
const SQUAD_TEAM=[MORGAN,...AGENTS];
let commandResultMissionId='';
let selectedAgentHistoryId='morgan';
let activeMissionAbortController=null;
let activeMissionId='';

function uid(){return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2)}
function defaultState(){
  const now = new Date().toISOString();
  return {
    clients:[{id:'ferrari-gesso',name:'Ferrari Gesso',segment:'Gesso, Drywall e Forros',city:'Itu e região',site:'https://ferrarigesso.com.br',whatsapp:'5511940867283',instagram:'',notes:'Primeiro case oficial da WDM Squad.',status:'Ativo',createdAt:now}],
    leads:[],
    campaigns:[{id:'camp-ferrari-site',clientId:'ferrari-gesso',name:'Divulgação do site Ferrari Gesso',channel:'Google + Redes + WhatsApp',status:'Planejamento',progress:25,goal:'Gerar pedidos de orçamento e fortalecer presença local.',createdAt:now}],
    tasks:[
      {id:'task-google',clientId:'ferrari-gesso',title:'Otimizar Perfil da Empresa no Google',due:'',priority:'Alta',done:false,createdAt:now},
      {id:'task-fotos',clientId:'ferrari-gesso',title:'Separar fotos reais de obras para substituir imagens genéricas',due:'',priority:'Alta',done:false,createdAt:now},
      {id:'task-share',clientId:'ferrari-gesso',title:'Divulgar ferrarigesso.com.br no WhatsApp e redes sociais',due:'',priority:'Média',done:false,createdAt:now}
    ],
    activity:[{id:uid(),icon:'🏁',title:'WDM Squad criada',detail:'Ferrari Gesso adicionada como primeiro case.',at:now}]
  };
}
function safeParse(s){try{return JSON.parse(s)}catch(e){return null}}
function normalizeState(){
  if(!state || typeof state!=='object')state=defaultState();
  ['clients','leads','leadCandidates','campaigns','tasks','activity','missions','apiUsage','rejectedLeads'].forEach(k=>{if(!Array.isArray(state[k]))state[k]=[]});
  if(!state.radarLeadSearch || typeof state.radarLeadSearch!=='object')state.radarLeadSearch={status:'idle',message:'Nenhuma pesquisa executada.'};
  [...state.leads,...state.leadCandidates].forEach(c=>{for(const kind of ['scout','copy'])if(c[kind+'Status']==='running'&&Date.now()-(c[kind+'StartedAt']||0)>=240000){c[kind+'Status']='error';c[kind+'Error']='Execução anterior interrompida. Você pode tentar novamente.';}});
  state.tasks.forEach(t=>{
    if(!['Aberta','Em andamento','Concluída'].includes(t.status))t.status=t.done?'Concluída':'Aberta';
    t.done=t.status==='Concluída';
  });
}
function clientName(id){const c=state.clients.find(x=>x.id===id);return c?c.name:'Sem cliente'}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function fmtDate(s){if(!s)return '—';const d=new Date(/^\d{4}-\d{2}-\d{2}$/.test(s)?s+'T12:00:00':s);return isNaN(d)?s:d.toLocaleDateString('pt-BR')}
function waLink(p){const n=String(p||'').replace(/\D/g,'');return n?'https://wa.me/'+n:''}
function addActivity(icon,title,detail){state.activity.unshift({id:uid(),icon,title,detail,at:new Date().toISOString()});state.activity=state.activity.slice(0,30)}

function cloudStatus(text,kind){document.getElementById('sideStatus').textContent=text;const d=document.getElementById('sideDot');d.className='dot '+(kind||'')}

const pageNames={overview:'Central de Operações',command:'Squad Command',clients:'Clientes',leads:'Leads',agents:'Agentes da Squad','agent-history':'Histórico do agente',missions:'Missões IA',campaigns:'Campanhas',tasks:'Tarefas'};
function showView(v){
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  window.addEventListener('hashchange',()=>{const view=location.hash.slice(1);if(pageNames[view])showView(view)});
document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
  const target=document.getElementById('view-'+v);
  if(!target)return;
  target.classList.add('active');
  document.getElementById('pageTitle').textContent=v==='agent-history'?'Agente '+(SQUAD_TEAM.find(a=>a.id===selectedAgentHistoryId)?.name||'Squad'):(pageNames[v]||'WDM Squad');
  document.getElementById('sidebar').classList.remove('open');
  renderSidebarAgents();
  window.scrollTo?.(0,0);
  if(location.hash!=='#'+v)history.replaceState(null,'','#'+v);
}
document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>showView(b.dataset.view));
document.getElementById('menuBtn').onclick=()=>document.getElementById('sidebar').classList.toggle('open');

function renderAll(){
  renderSyncStatus();if(!state)return;renderOverview();renderCommand();renderSidebarAgents();renderAgentHistory();renderClients();renderLeads();renderAgents();renderMissions();renderCampaigns();renderTasks()}
function agentMissionCount(agentId){
  if(!state)return 0;
  if(agentId==='morgan')return (state.missions||[]).filter(m=>m.status==='Concluída').length;
  return (state.missions||[]).filter(m=>(m.results||[]).some(r=>r.agentId===agentId&&String(r.text||'').trim())).length;
}
function renderSidebarAgents(){
  const host=document.getElementById('sidebarAgents');
  if(!host)return;
  host.innerHTML=SQUAD_TEAM.map(a=>'<button type="button" class="sidebar-agent-btn '+(selectedAgentHistoryId===a.id&&document.getElementById('view-agent-history')?.classList.contains('active')?'active':'')+'" onclick="openAgentHistory(\''+a.id+'\')"><span>'+a.icon+'</span><span>'+esc(a.name)+'</span><span class="sidebar-agent-count">'+agentMissionCount(a.id)+'</span></button>').join('');
}
function openAgentHistory(agentId){
  if(!SQUAD_TEAM.some(a=>a.id===agentId))return;
  selectedAgentHistoryId=agentId;
  renderAgentHistory();
  showView('agent-history');
  renderSidebarAgents();
}
function renderAgentHistory(){
  const host=document.getElementById('agentHistoryList');
  if(!host||!state)return;
  const agent=SQUAD_TEAM.find(a=>a.id===selectedAgentHistoryId)||MORGAN;
  const avatar=document.getElementById('agentHistoryAvatar'),role=document.getElementById('agentHistoryRole'),title=document.getElementById('agentHistoryTitle'),desc=document.getElementById('agentHistoryDescription'),count=document.getElementById('agentHistoryCount');
  if(avatar)avatar.textContent=agent.icon;
  if(role)role.textContent=agent.role;
  if(title)title.textContent='Agente '+agent.name;
  if(desc)desc.textContent=agent.desc;
  const rows=[];
  (state.missions||[]).forEach(m=>{
    const client=state.clients.find(c=>c.id===m.clientId);
    if(agent.id==='morgan'){
      if(m.status!=='Concluída')return;
      const plan=m.executionPlan||{};
      const fallback='Morgan coordenou a missão e consolidou as entregas da Squad.';
      rows.push({mission:m,client,text:plan.summary||fallback,nextMove:plan.nextMove||'',completedAt:m.finishedAt||m.createdAt,label:'Coordenação concluída'});
      return;
    }
    const result=(m.results||[]).find(r=>r.agentId===agent.id&&String(r.text||'').trim());
    if(!result)return;
    rows.push({mission:m,client,text:result.text,nextMove:'',completedAt:result.completedAt||m.finishedAt||m.createdAt,label:'Entrega concluída'});
  });
  rows.sort((a,b)=>new Date(b.completedAt||0)-new Date(a.completedAt||0));
  if(count)count.textContent=rows.length+' missão(ões)';
  host.innerHTML=rows.length?rows.map((row,i)=>{
    const m=row.mission;
    const when=row.completedAt?new Date(row.completedAt).toLocaleString('pt-BR'):'';
    return '<details class="agent-history-item" '+(i===0?'open':'')+'><summary><div><h3>'+esc(row.client?.name||m.clientName||'Cliente')+'</h3><div class="mission-meta">'+esc(m.objective||'Missão da Squad')+(when?' · '+esc(when):'')+'</div></div><span class="history-status">'+esc(row.label)+'</span></summary><div class="agent-history-body"><div class="history-objective"><b>Missão:</b> '+esc(m.objective||'')+'</div><div class="history-text">'+esc(row.text||'').replace(/\n/g,'<br>')+'</div>'+(row.nextMove?'<div class="execution-plan"><strong>Próxima ação do Morgan</strong><p>'+esc(row.nextMove)+'</p></div>':'')+'<div class="row-actions" style="margin-top:12px"><button class="btn" onclick="event.preventDefault();event.stopPropagation();showMissionResult(\''+m.id+'\')">👁 Ver missão completa</button></div></div></details>';
  }).join(''):'<div class="agent-history-empty">'+agent.icon+' O Agente '+esc(agent.name)+' ainda não tem entregas salvas. Quando ele participar de uma missão, o trabalho aparecerá aqui.</div>';
}
function renderOverview(){
  renderCommercial();
  document.getElementById('stClients').textContent=state.clients.filter(x=>x.status!=='Inativo').length;
  document.getElementById('stLeads').textContent=state.leads.filter(x=>!['Ganho','Perdido'].includes(x.status)).length;
  document.getElementById('stCampaigns').textContent=state.campaigns.filter(x=>x.status!=='Concluída').length;
  document.getElementById('stTasks').textContent=state.tasks.filter(x=>x.status!=='Concluída').length;
  document.getElementById('agentsMini').innerHTML=SQUAD_TEAM.slice(0,4).map(a=>'<div class="agent-mini"><strong>'+a.icon+' Agente '+esc(a.name)+' · '+esc(a.role)+'</strong><span>'+esc(a.desc)+'</span></div>').join('');
  const acts=state.activity.slice(0,7);
  document.getElementById('activityList').innerHTML=acts.length?acts.map(a=>'<div class="activity"><i>'+esc(a.icon)+'</i><div><strong>'+esc(a.title)+'</strong><span>'+esc(a.detail)+' · '+new Date(a.at).toLocaleString('pt-BR')+'</span></div></div>').join(''):'<div class="empty">Nenhuma atividade ainda.</div>';
  const camps=state.campaigns.slice(0,3);
  document.getElementById('campaignFocus').innerHTML=camps.length?camps.map(c=>campaignCard(c,false)).join(''):'<div class="empty">Crie a primeira campanha.</div>';
}
function renderCommand(){
  const active=(state.missions||[]).find(m=>missionIsRunning(m));
  const latest=active||(state.missions||[])[0];
  const completed=new Set((latest?.results||[]).map(r=>r.agentId));
  document.getElementById('commandAgents').innerHTML=AGENTS.map(a=>{
    const current=active?.currentAgentId===a.id,done=completed.has(a.id);
    const cls=current?'current':done?'done':'';
    const selected=latest?missionAgents(latest).some(x=>x.id===a.id):true;
    const status=!selected?'FORA DESTA MISSÃO':current?'EM OPERAÇÃO':done?'CONCLUÍDO':active?'AGUARDANDO':'DISPONÍVEL';
    return '<div class="live-agent '+cls+'"><div class="live-name">'+a.icon+' Agente '+esc(a.name)+'</div><div class="live-role">'+esc(a.role)+'</div><div class="live-state">'+status+'</div></div>';
  }).join('');
  const stateEl=document.getElementById('commandOperationState'),now=document.getElementById('commandMissionNow'),startBtn=document.getElementById('commandStartBtn'),stopBtn=document.getElementById('commandStopBtn'),restartBtn=document.getElementById('commandRestartBtn');
  if(stopBtn)stopBtn.style.display=active?'inline-flex':'none';
  if(restartBtn){restartBtn.disabled=Boolean(active);restartBtn.textContent='↻ Nova execução';}
  if(active){
    if(stateEl)stateEl.textContent='Missão em andamento · '+Math.round(Number(active.progress)||0)+'%';
    if(now)now.innerHTML='<strong>🧠 Morgan coordenando: '+esc(active.currentLabel||'Operação em andamento')+'</strong><p>'+esc(active.objective||'')+'</p><div class="progress"><span style="width:'+Math.round(Number(active.progress)||0)+'%"></span></div>';
    if(startBtn){startBtn.disabled=true;startBtn.textContent='⏳ Squad em operação'}
  }else{
    if(stateEl)stateEl.textContent=latest?.status==='Concluída'?'Última missão concluída':latest&&['Erro','Parcial','Pausada','Interrompida'].includes(latest.status)?'Missão pendente · etapas salvas':'Squad disponível';
    if(now){
      if(latest?.status==='Concluída'){
        now.innerHTML='<strong>✅ Missão concluída — resultado pronto</strong><p>'+esc(latest.objective||'')+'</p><div class="row-actions" style="margin-top:10px"><button class="btn primary" onclick="showMissionResult(\''+latest.id+'\')">👁 Ver resultado da missão</button></div>';
      }else{
        now.innerHTML=latest?'<strong>🧠 Missão pendente</strong><p>'+esc(latest.objective||'')+'</p>'+(latest.error?'<p class="mission-error">'+esc(friendlySquadError(latest.error))+'</p>':'')+'<div class="row-actions"><button class="btn primary" onclick="resumeMission(\''+latest.id+'\')">▶ Retomar esta missão</button></div>':'<strong>🧠 Morgan aguardando.</strong><p>Dê uma missão por texto ou voz.</p>';
      }
    }
    if(startBtn){startBtn.disabled=false;startBtn.textContent='⚡ Iniciar missão'}
  }
  renderCommandResult();
  populateMorganVoices();
}
function renderCommandResult(){
  const panel=document.getElementById('commandResult'),body=document.getElementById('commandResultBody'),status=document.getElementById('commandResultStatus');
  if(!panel||!body)return;
  const active=(state.missions||[]).some(m=>missionIsRunning(m));
  if(active){panel.classList.remove('show');return}
  const mission=(commandResultMissionId&&state.missions.find(m=>m.id===commandResultMissionId))||(state.missions||[])[0];
  if(!mission||mission.status!=='Concluída'||!(mission.results||[]).length){panel.classList.remove('show');body.innerHTML='';return}
  const client=state.clients.find(c=>c.id===mission.clientId);
  const plan=mission.executionPlan||{};
  const linkedTasks=(state.tasks||[]).filter(t=>t.sourceMissionId===mission.id);
  const results=(mission.results||[]).map(r=>{
    const a=AGENTS.find(x=>x.id===r.agentId);
    return '<details><summary>'+(a?a.icon:'🤖')+' Agente '+esc(r.agentName||a?.name||r.agentId)+' · '+esc(r.role||a?.role||'')+'</summary><div class="mission-result-body">'+esc(r.text||'').replace(/\n/g,'<br>')+telemetryHtml(r)+'</div></details>';
  }).join('');
  const tasks=linkedTasks.length?'<div class="result-tasks">'+linkedTasks.map(t=>'<div class="result-task"><b>'+esc(t.priority||'Média')+'</b> · '+esc(t.title||'')+(t.due?' · '+new Date(t.due+'T12:00:00').toLocaleDateString('pt-BR'):'')+'</div>').join('')+'</div>':'<p>Nenhuma tarefa automática foi criada nesta missão.</p>';
  panel.classList.add('show');
  if(status)status.textContent=(mission.finishedAt?'concluída em '+new Date(mission.finishedAt).toLocaleString('pt-BR'):'resultado salvo');
  body.innerHTML=
    '<div class="result-hero"><div><div class="result-meta">Morgan · relatório final</div><h3>'+esc(client?.name||mission.clientName||'Missão da Squad')+'</h3><p>'+esc(mission.objective||'')+'</p></div><div class="result-actions"><button class="btn" onclick="showView(\'missions\')">🗂 Histórico</button>'+(linkedTasks.length?'<button class="btn" onclick="showView(\'tasks\')">📋 Ver tarefas</button>':'')+'<button class="btn primary" onclick="repeatMission(\''+mission.id+'\')">↻ Repetir missão</button></div></div>'+
    '<div class="result-summary"><div class="result-block"><strong>🧠 Resumo executivo do Morgan</strong><p>'+esc(plan.summary||'A Squad concluiu a análise. Abra as entregas dos agentes abaixo para ver os detalhes de cada especialidade.')+'</p>'+(plan.nextMove?'<p><b>Próxima ação:</b> '+esc(plan.nextMove)+'</p>':'')+'</div><div class="result-block"><strong>📋 Plano de ação</strong>'+tasks+'</div></div>'+
    '<div class="result-agents"><div class="tiny muted" style="margin-bottom:2px">ENTREGAS DA SQUAD — clique em cada agente para expandir</div>'+results+'</div>';
}
function showMissionResult(id,auto=false){
  const mission=(state.missions||[]).find(m=>m.id===id);
  if(!mission)return;
  commandResultMissionId=id;
  showView('command');
  renderCommand();
  requestAnimationFrame(()=>{
    const panel=document.getElementById('commandResult');
    if(!panel)return;
    panel.scrollIntoView({behavior:'smooth',block:'start'});
    if(auto){
      panel.classList.remove('just-finished');
      void panel.offsetWidth;
      panel.classList.add('just-finished');
      setTimeout(()=>panel.classList.remove('just-finished'),2800);
    }
  });
}
let squadRecognition=null;
const MORGAN_VOICE_KEY='wdm_squad_morgan_voice';
let morganVoices=[];
function scoreMorganVoice(v){
  const name=String(v?.name||'').toLowerCase(),lang=String(v?.lang||'').toLowerCase();
  let score=0;
  if(lang==='pt-br')score+=120;
  else if(lang.startsWith('pt'))score+=75;
  if(/natural/.test(name))score+=90;
  if(/google/.test(name))score+=65;
  if(/antonio|antônio/.test(name))score+=62;
  if(/francisca/.test(name))score+=58;
  if(/online/.test(name))score+=45;
  if(/microsoft/.test(name))score+=35;
  if(/desktop/.test(name))score-=70;
  if(/espeak|festival|mbrola/.test(name))score-=90;
  if(v?.localService===false)score+=8;
  return score;
}
function getPreferredMorganVoice(){
  const voices=morganVoices.length?morganVoices:(window.speechSynthesis?.getVoices?.()||[]);
  if(!voices.length)return null;
  const saved=localStorage.getItem(MORGAN_VOICE_KEY)||'';
  if(saved){
    const exact=voices.find(v=>(v.voiceURI||v.name)===saved);
    if(exact)return exact;
  }
  return [...voices].sort((a,b)=>scoreMorganVoice(b)-scoreMorganVoice(a))[0]||null;
}
function populateMorganVoices(){
  if(!('speechSynthesis' in window))return;
  const select=document.getElementById('commandVoice'),hint=document.getElementById('commandVoiceHint');
  morganVoices=window.speechSynthesis.getVoices()||[];
  if(!select)return;
  if(!morganVoices.length){
    select.innerHTML='<option value="">Carregando vozes do sistema...</option>';
    if(hint)hint.textContent='o navegador ainda está carregando as vozes';
    return;
  }
  const sorted=[...morganVoices].sort((a,b)=>scoreMorganVoice(b)-scoreMorganVoice(a));
  const preferred=getPreferredMorganVoice();
  select.innerHTML=sorted.map(v=>{
    const id=v.voiceURI||v.name;
    const natural=/natural|google|online/i.test(v.name||'')?' · natural':'';
    return '<option value="'+esc(id)+'">'+esc(v.name)+' · '+esc(v.lang||'')+natural+'</option>';
  }).join('');
  if(preferred)select.value=preferred.voiceURI||preferred.name;
  if(hint)hint.textContent=preferred?'Atual: '+preferred.name:'Escolha uma voz';
}
function saveMorganVoice(value){
  if(value)localStorage.setItem(MORGAN_VOICE_KEY,value);else localStorage.removeItem(MORGAN_VOICE_KEY);
  const voice=getPreferredMorganVoice(),hint=document.getElementById('commandVoiceHint');
  if(hint)hint.textContent=voice?'Atual: '+voice.name:'Escolha uma voz';
  squadSpeak('Olá, William. Esta é a nova voz do Morgan.');
}
function squadSpeak(text){
  if(!('speechSynthesis' in window))return;
  try{
    window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(String(text||''));
    u.lang='pt-BR';
    u.rate=1.03;
    u.pitch=1.04;
    u.volume=1;
    const voice=getPreferredMorganVoice();
    if(voice)u.voice=voice;
    window.speechSynthesis.speak(u);
  }catch(e){console.warn('Squad voice:',e)}
}
if('speechSynthesis' in window){
  window.speechSynthesis.onvoiceschanged=populateMorganVoices;
  setTimeout(populateMorganVoices,120);
  setTimeout(populateMorganVoices,900);
}
function startSquadVoice(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition,status=document.getElementById('voiceStatus'),btn=document.getElementById('commandMicBtn');
  if(!SR){if(status)status.textContent='Voz não suportada neste navegador';return alert('Este navegador não oferece reconhecimento de voz. No Chrome/Edge, permita o microfone e tente novamente.')}
  if(squadRecognition){try{squadRecognition.stop()}catch(_){}squadRecognition=null}
  const r=new SR();squadRecognition=r;r.lang='pt-BR';r.interimResults=true;r.continuous=false;
  r.onstart=()=>{if(status){status.textContent='Ouvindo você...';status.classList.add('voice-listening')}if(btn)btn.textContent='🔴 Ouvindo...'};
  r.onresult=e=>{let t='';for(let i=e.resultIndex;i<e.results.length;i++)t+=e.results[i][0].transcript;const box=document.getElementById('commandObjective');if(box&&t.trim())box.value=t.trim()};
  r.onerror=e=>{if(status)status.textContent='Microfone: '+(e.error||'erro')};
  r.onend=()=>{if(status){status.classList.remove('voice-listening');status.textContent='Missão capturada · revise ou inicie'}if(btn)btn.textContent='🎙️ Falar com Morgan';squadRecognition=null};
  r.start();
}
function startMorganMission(){
  const objective=document.getElementById('commandObjective')?.value.trim();
  if(!objective)return alert('Diga ao Morgan qual é a missão de prospecção.');
  if(activeMissionId)return alert('A Squad já está executando uma missão.');
  addActivity('🧠','Morgan recebeu uma missão de prospecção',objective.slice(0,120));
  squadSpeak('Entendido, William. Vou iniciar a prospecção da WDM Apps. Ray vai procurar empresas novas e Scott vai validar as melhores oportunidades.');
  runFullMission('',objective,{keepView:true,voice:true,commander:'Morgan',mode:'prospecting'});
}
async function stopMorganMission(options={}){
  const active=(state.missions||[]).find(m=>missionIsRunning(m));
  if(active&&active.id!==activeMissionId){if(!options.silent)alert('A execução está em outro aparelho ou aba. Pare por lá ou aguarde a reserva expirar.');return null;}
  if(!active){
    if(!options.silent)alert('Não há missão em andamento para parar.');
    return null;
  }
  if(activeMissionAbortController&&activeMissionId===active.id){
    try{activeMissionAbortController.abort()}catch(_){}
  }
  active.status='Interrompida';
  active.currentAgentId='';
  active.currentLabel='Missão interrompida por William';
  active.error='';
  active.finishedAt=new Date().toISOString();
  addActivity('⏹','Missão interrompida',active.objective||'Prospecção WDM Apps');
  await saveState();
  if(!options.silent)squadSpeak('Missão interrompida, William. A Squad está disponível novamente.');
  return active;
}
async function restartMorganMission(){
  const active=(state.missions||[]).find(m=>missionIsRunning(m));
  const latestProspecting=(state.missions||[]).find(m=>m.mode==='prospecting');
  const objective=(active?.objective||document.getElementById('commandObjective')?.value.trim()||latestProspecting?.objective||'Procurar novos clientes no Brasil para a WDM Apps, priorizando empresas sem site ou com presença digital fraca.').trim();
  if(active){await stopMorganMission({silent:true});return;}
  if(activeMissionId)return;
  const box=document.getElementById('commandObjective');
  if(box)box.value=objective;
  addActivity('↻','Missão reiniciada',objective.slice(0,120));
  squadSpeak('Certo, William. Vou reiniciar a missão do zero e liberar a Squad novamente.');
  runFullMission('',objective,{keepView:true,voice:true,commander:'Morgan',mode:'prospecting'});
}

function renderClients(){
  if(!state)return;const q=(document.getElementById('clientSearch')?.value||'').toLowerCase();
  const list=state.clients.filter(c=>[c.name,c.segment,c.city,c.site].join(' ').toLowerCase().includes(q));
  document.getElementById('clientCount').textContent=list.length+' cliente(s)';
  document.getElementById('clientsTable').innerHTML=list.length?'<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Segmento</th><th>Região</th><th>Status</th><th>Canais</th><th>Ações</th></tr></thead><tbody>'+list.map(c=>'<tr><td><strong>'+esc(c.name)+'</strong><div class="tiny muted">'+esc(c.notes||'')+'</div></td><td>'+esc(c.segment||'—')+'</td><td>'+esc(c.city||'—')+'</td><td><span class="badge">'+esc(c.status||'Ativo')+'</span></td><td>'+(c.site?'<a class="link" target="_blank" href="'+esc(c.site)+'">Site</a> ':'')+(c.whatsapp?'<a class="link" target="_blank" href="'+waLink(c.whatsapp)+'">WhatsApp</a>':'')+'</td><td><div class="row-actions"><button class="btn" onclick="openClientModal(\''+c.id+'\')">Editar</button><button class="btn" onclick="runAgent(\'scout\',\''+c.id+'\')">Diagnóstico</button></div></td></tr>').join('')+'</tbody></table></div>':'<div class="empty">Nenhum cliente encontrado.</div>';
}
function safePublicUrl(value){
  let raw=String(value||'').trim();
  const markdown=raw.match(/^\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/i);
  if(markdown)raw=markdown[1];
  raw=raw.split(/\s+(?:\(|\[|【)|【|\s+/)[0];
  if(!raw||/^(não|nenhum|n\/a|—|-)/i.test(raw))return '';
  const normalized=/^www\./i.test(raw)||/^[\w.-]+\.[a-z]{2,}(?:\/|$)/i.test(raw)?'https://'+raw:raw;
  try{const u=new URL(normalized);return ['http:','https:'].includes(u.protocol)?u.href:''}catch(_){return ''}
}
function numberFromRadar(value){
  const raw=String(value==null?'':value).trim().replace(',','.');
  const n=parseFloat(raw.replace(/[^0-9.]/g,''));
  return Number.isFinite(n)?n:0;
}
function calculateLeadScore(lead){
  let score=0;
  const siteStatus=String(lead?.siteStatus||(!safePublicUrl(lead?.site||lead?.website)?'NAO_CONFIRMADO':'COM_SITE')).toUpperCase();
  if(siteStatus==='SEM_SITE')score+=40;
  else if(siteStatus==='SITE_FRACO')score+=25;
  if(String(lead?.contact||'').trim())score+=15;
  if(safePublicUrl(lead?.sourceUrl))score+=5;
  if(String(lead?.siteEvidence||'').trim())score+=5;
  const rating=numberFromRadar(lead?.googleRating);
  const reviews=Math.round(numberFromRadar(lead?.googleReviews));
  if(rating>=4.5)score+=10;
  else if(rating>=4)score+=8;
  else if(rating>=3.5)score+=5;
  if(reviews>=100)score+=10;
  else if(reviews>=30)score+=7;
  else if(reviews>=10)score+=4;
  if(String(lead?.socialActive||'').toUpperCase()==='SIM')score+=10;
  if(String(lead?.reason||'').trim())score+=5;
  return Math.max(0,Math.min(100,score));
}
function leadScoreLabel(score){
  if(score>=80)return {text:'🔥 Quente',cls:'red'};
  if(score>=60)return {text:'⭐ Bom lead',cls:'yellow'};
  return {text:'🔎 Avaliar',cls:'blue'};
}
let radarLoadingTimer=null;
function radarLoadingHtml(search){
  if(search?.status!=='running')return '';
  const attempt=Math.max(1,Number(search.attempt)||1);
  return '<div class="radar-search-loading">'+
    '<div class="radar-spinner"></div>'+
    '<div class="radar-loading-copy"><strong>📡 Radar trabalhando...</strong>'+
    '<p id="radarLoadingPhase">Buscando empresas públicas na região</p>'+
    '<div class="radar-loading-meta"><span id="radarElapsed">0s em andamento</span><span>Tentativa '+attempt+' de 3</span><span>Não feche esta tela</span></div>'+
    '<div class="radar-loading-track"></div></div></div>';
}
function syncRadarLoadingTimer(search){
  if(radarLoadingTimer){clearInterval(radarLoadingTimer);radarLoadingTimer=null}
  if(search?.status!=='running')return;
  const tick=()=>{
    const elapsed=document.getElementById('radarElapsed');
    const phase=document.getElementById('radarLoadingPhase');
    const started=new Date(search.startedAt||Date.now()).getTime();
    const seconds=Math.max(0,Math.floor((Date.now()-started)/1000));
    if(elapsed)elapsed.textContent=seconds+'s em andamento';
    if(phase){
      const phases=['Buscando empresas públicas na região','Verificando quem possui site próprio','Cruzando contatos, avaliações e redes sociais','Calculando as melhores oportunidades comerciais'];
      phase.textContent=phases[Math.floor(seconds/6)%phases.length];
    }
  };
  tick();
  radarLoadingTimer=setInterval(tick,1000);
}
function renderLeadCandidates(){renderLeadWorkspace()}
function renderLeads(){
  if(!state)return;
  renderLeadCleanup();renderCommercial();renderLeadWorkspace();
}
function renderAgents(){
  if(!state)return;
  document.getElementById('agentsGrid').innerHTML=SQUAD_TEAM.map(a=>{
    const commander=a.id==='morgan';
    return '<article class="agent-card"><div class="agent-top"><div><div class="agent-icon">'+a.icon+'</div><div class="agent-call">'+(commander?'Comando da unidade':'Agente especializado')+'</div><strong>Agente '+esc(a.name)+' · '+esc(a.role)+'</strong></div><span class="badge '+(commander?'yellow':'blue')+'">'+(commander?'Commander':'Operacional')+'</span></div><p>'+esc(a.desc)+'</p><p class="agent-persona">'+esc(a.persona||'')+'</p><button class="btn primary" onclick="'+(commander?"showView('command')":"runAgent('"+a.id+"')")+'">'+(commander?'🧠 Abrir Command':'Executar missão')+'</button></article>';
  }).join('');
}
function campaignCard(c,actions=true){
  const pct=Math.max(0,Math.min(100,Number(c.progress||0)));
  return '<div class="campaign"><div style="display:flex;justify-content:space-between;gap:8px"><div><h3>'+esc(c.name)+'</h3><span class="tiny muted">'+esc(clientName(c.clientId))+' · '+esc(c.channel||'')+'</span></div><span class="badge '+(c.status==='Concluída'?'':'blue')+'">'+esc(c.status||'Planejamento')+'</span></div><p>'+esc(c.goal||'')+'</p><div class="progress"><span style="width:'+pct+'%"></span></div><div class="tiny muted" style="margin-top:6px">'+pct+'% concluído</div>'+(actions?'<div class="row-actions" style="margin-top:12px"><button class="btn" onclick="openCampaignModal(\''+c.id+'\')">Editar</button><button class="btn" onclick="runAgent(\'growth\',\''+c.clientId+'\')">Growth</button></div>':'')+'</div>';
}

function missionStatusClass(status){
  if(status==='Concluída')return '';
  if(status==='Erro')return 'red';
  if(status==='Executando')return 'blue';
  return 'yellow';
}

function missionResultsMap(mission){
  const map={};
  (mission.results||[]).forEach(r=>{if(r?.agentId&&r?.text)map[r.agentId]=r.text});
  return map;
}
function parsePlannerJson(text){
  let raw=String(text||'').trim();
  raw=raw.replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'').trim();
  try{return JSON.parse(raw)}catch(_){}
  const a=raw.indexOf('{'),b=raw.lastIndexOf('}');
  if(a>=0&&b>a){try{return JSON.parse(raw.slice(a,b+1))}catch(_){}}
  throw new Error('O Planner não retornou um plano estruturado válido.');
}
function priorityValue(v){
  return ['Alta','Média','Baixa'].includes(v)?v:'Média';
}
function dueAfterDays(value){
  const days=Math.max(0,Math.min(30,Math.round(Number(value)||0)));
  const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+days);
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}
function friendlySquadError(message){
  const text=String(message||'Falha ao executar a busca.');
  if(/OPENAI_INCOMPLETE:max_output_tokens/.test(text))return 'A IA atingiu o limite de resposta mesmo após uma tentativa de recuperação. As etapas já concluídas continuam salvas. Retome a missão ou reduza a região/quantidade pesquisada.';
  if(/OPENAI_INCOMPLETE/.test(text))return 'A IA interrompeu esta etapa antes de concluir. As entregas já salvas foram preservadas; retome a missão.';
  return text;
}
async function squadApiCall(idToken,payload,signal=null){
  if(leaseLost)throw Error("Reserva expirada. Retome a operação após sincronizar.");
  const response=await fetch(SQUAD_API_URL,{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+idToken},
    body:JSON.stringify(payload),
    signal:signal||undefined
  });
  let data={};try{data=await response.json()}catch(_){}
  if(!response.ok||data.ok===false){if(data.telemetry)state.apiUsage.push({id:data.telemetry.responseId||uid(),agentId:payload.agentId,status:'error',error:data.error,...telemetryFrom(data.telemetry)});throw new Error(friendlySquadError(data.error||('Backend respondeu '+response.status)));}
  if(!String(data.text||'').trim())throw Error('O agente retornou uma resposta vazia.');
  state.apiUsage.push({id:data.responseId||uid(),agentId:payload.agentId,status:'completed',...telemetryFrom(data)});
  return data;
}
async function radarApiCallWithRetry(idToken,payload,label='Radar pesquisando empresas...'){
  let lastError=null;
  for(let attempt=1;attempt<=3;attempt++){
    state.radarLeadSearch.attempt=attempt;
    state.radarLeadSearch.message=attempt===1
      ?label
      :label+' · resposta vazia, nova tentativa ('+attempt+'/3)...';
    await saveState();
    try{
      const data=await squadApiCall(idToken,{...payload,outputFormat:'leads',excludedCompanies:[...state.clients,...state.leads].map(x=>x.name||x.company)});
      if(!String(data?.text||'').trim())throw new Error('OPENAI_EMPTY');
      return data;
    }catch(e){
      lastError=e;
      const msg=String(e?.message||e);
      if(!/OPENAI_EMPTY/i.test(msg)||attempt===3)break;
      await new Promise(resolve=>setTimeout(resolve,900));
    }
  }
  if(/OPENAI_EMPTY/i.test(String(lastError?.message||lastError))){
    throw new Error('A IA não retornou conteúdo após 3 tentativas. Tente pesquisar novamente ou escolha uma região/segmento mais específico.');
  }
  throw lastError||new Error('Não foi possível concluir a pesquisa.');
}
async function generateExecutionPlan(missionId,silent=false,existingToken='',signal=null){
  const mission=state.missions.find(x=>x.id===missionId);
  if(!mission)return false;
  const client=state.clients.find(c=>c.id===mission.clientId)||mission.clientSnapshot;
  if(!client)return false;
  if(!(mission.results||[]).length){if(!silent)alert('Esta missão ainda não tem resultados.');return false}

  mission.planStatus='Gerando plano e tarefas...';
  mission.planError='';
  await saveState();

  try{
    let idToken=existingToken;
    if(!idToken){
      const user=await firebaseUser();
      if(!user)throw new Error('Sua sessão expirou. Entre novamente no painel.');
      idToken=await user.getIdToken(true);
    }
    const previousResults=missionResultsMap(mission);
    const data=await squadApiCall(idToken,{
      agentId:'planner',
      client:{
        name:client.name,segment:client.segment||'',city:client.city||'',site:client.site||'',
        instagram:client.instagram||'',notes:client.notes||''
      },
      objective:mission.objective||'Transformar a missão em plano operacional.',
      previousResults,
      missionMode:mission.mode||'client'
    },signal);
    signal?.throwIfAborted();
    const plan=SquadCore.validPlan(data.structured||parsePlannerJson(data.text));
    const plannedTasks=Array.isArray(plan.tasks)?plan.tasks.slice(0,8):[];
    const createdIds=[];

    for(const item of plannedTasks){
      const title=String(item?.title||'').trim().slice(0,220);
      if(!title)continue;
      const duplicate=state.tasks.some(t=>t.sourceMissionId===mission.id&&String(t.title||'').trim().toLowerCase()===title.toLowerCase());
      if(duplicate)continue;
      const task={
        id:uid(),clientId:mission.mode==='prospecting'?'':mission.clientId,title,
        due:dueAfterDays(item?.daysFromNow),
        priority:priorityValue(item?.priority),
        status:'Aberta',done:false,createdAt:new Date().toISOString(),
        sourceMissionId:mission.id,source:'WDM Squad',
        why:String(item?.why||'').trim().slice(0,250)
      };
      state.tasks.push(task);
      createdIds.push(task.id);
    }

    mission.plannerTelemetry=telemetryFrom(data);
    mission.executionPlan={
      summary:String(plan.summary||'Plano de execução gerado pela Squad.').trim().slice(0,700),
      nextMove:String(plan.nextMove||'').trim().slice(0,400),
      taskIds:[...(mission.executionPlan?.taskIds||[]),...createdIds],
      generatedAt:new Date().toISOString()
    };
    mission.planStatus=createdIds.length?createdIds.length+' nova(s) tarefa(s) criada(s)':'Plano atualizado; nenhuma tarefa nova necessária.';
    mission.planError='';
    addActivity('📋','Plano de execução criado',client.name+' · '+createdIds.length+' tarefa(s) nova(s)');
    await saveState();
    if(!silent)showView('tasks');
    return true;
  }catch(e){
    if(e?.name==='AbortError'||signal?.aborted){
      mission.planStatus='Plano interrompido.';
      mission.planError='';
      await saveState();
      return false;
    }
    console.error('WDM Squad planner failed',e);
    mission.planStatus='Não foi possível gerar o plano.';
    mission.planError=(e?.message||'Falha no Planner.').slice(0,500);
    await saveState();
    if(!silent)alert(mission.planError);
    return false;
  }
}
function renderMissions(){
  if(!state)return;
  const host=document.getElementById('missionsList');
  if(!host)return;
  const missions=[...(state.missions||[])].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  if(!missions.length){host.innerHTML='<div class="empty">Nenhuma missão automática executada ainda.</div>';return}
  host.innerHTML=missions.map(m=>{
    const client=state.clients.find(c=>c.id===m.clientId);
    const completed=new Set((m.results||[]).map(r=>r.agentId));
    const steps=missionAgents(m).map(a=>{
      const cls=completed.has(a.id)?'done':(m.currentAgentId===a.id&&m.status==='Executando'?'current':'');
      return '<div class="mission-step '+cls+'" title="'+esc(a.role)+'">'+a.icon+' '+esc(a.name)+'</div>';
    }).join('');
    const results=(m.results||[]).map(r=>{
      const a=AGENTS.find(x=>x.id===r.agentId);
      return '<details class="mission-result"><summary>'+(a?a.icon:'🤖')+' '+esc(r.agentName||a?.name||r.agentId)+' · '+esc(r.role||a?.role||'')+'</summary><div class="mission-result-body">'+esc(r.text||'').replace(/\n/g,'<br>')+telemetryHtml(r)+'</div></details>';
    }).join('');
    const pct=Number(m.progress||0);
    const plan=m.executionPlan;
    const planHtml=plan?'<div class="execution-plan"><strong>📋 Plano de execução</strong><p>'+esc(plan.summary||'')+'</p>'+(plan.nextMove?'<p><b>Próxima ação:</b> '+esc(plan.nextMove)+'</p>':'')+'<small>'+Number((plan.taskIds||[]).length)+' tarefa(s) vinculada(s) à missão.</small></div>':(m.planStatus?'<div class="execution-plan"><strong>📋 Planner</strong><p>'+esc(m.planStatus)+'</p>'+(m.planError?'<small style="color:#ffb1ba">'+esc(m.planError)+'</small>':'')+'</div>':'');
    const resultButton=m.status==='Concluída'?'<button class="btn primary" onclick="showMissionResult(\''+m.id+'\')">👁 Abrir resultado no Command</button>':'';
    const planButton=(m.status==='Concluída'&&!activeMissionId)?'<button class="btn" onclick="createExecutionPlan(\''+m.id+'\')">'+(plan?'♻ Refazer plano':'✅ Gerar plano e tarefas')+'</button>':'';
    const taskButton=plan?'<button class="btn" onclick="showView(\'tasks\')">📋 Ver tarefas</button>':'';
    return '<div class="mission-card" id="mission-'+esc(m.id)+'"><div class="mission-top"><div><h3>'+esc(client?.name||m.clientName||'Cliente')+'</h3><div class="mission-meta">'+esc(m.objective||'Missão automática')+' · '+(m.createdAt?new Date(m.createdAt).toLocaleString('pt-BR'):'')+'</div></div><span class="badge '+missionStatusClass(m.status)+'">'+esc(['Preparando','Executando'].includes(m.status)&&!missionIsRunning(m)?'Pausada':m.status||'Preparando')+'</span></div><div class="mission-steps">'+steps+'</div><div class="progress"><span style="width:'+pct+'%"></span></div><div class="tiny muted" style="margin-top:6px">'+pct+'% · '+esc(m.currentLabel||'')+'</div>'+(m.error?'<div class="mission-error">⚠ '+esc(friendlySquadError(m.error))+'</div>':'')+planHtml+results+'<div class="mission-actions">'+resultButton+(!['Concluída'].includes(m.status)&&!activeMissionId?'<button class="btn primary" onclick="resumeMission(\''+m.id+'\')">▶ Retomar etapas pendentes</button>':'')+planButton+taskButton+'<button class="btn" onclick="repeatMission(\''+m.id+'\')">↻ Repetir</button><button class="btn danger" onclick="deleteMission(\''+m.id+'\')">Excluir</button></div></div>';
  }).join('');
}
function openMissionModal(){
  if(activeMissionId)return alert('A Squad já está executando uma missão.');
  if(!state.clients.length)return alert('Cadastre um cliente primeiro.');
  document.getElementById('modalTitle').textContent='🧠 Morgan · Nova missão';
  const defaultObjective='Analisar a presença digital, encontrar oportunidades comerciais e preparar um plano completo de conteúdo, site e divulgação para gerar mais contatos.';
  document.getElementById('modalBody').innerHTML='<form id="missionForm" class="form-grid"><select id="mfClient">'+clientOptions(state.clients[0]?.id||'')+'</select><div></div><textarea class="full" id="mfObjective" required placeholder="Qual é o objetivo desta missão?">'+esc(defaultObjective)+'</textarea><div class="full tiny muted" id="mfTeam"></div><div class="full tiny muted">Morgan selecionará os especialistas conforme o objetivo. As etapas salvas podem ser retomadas. Mantenha esta aba aberta durante a execução. Ray e Scott podem pesquisar informações públicas atuais. Nada será enviado ou publicado automaticamente.</div><div class="full" style="display:flex;justify-content:flex-end;gap:8px"><button type="button" class="btn" onclick="closeModal(\'formModal\')">Cancelar</button><button class="btn primary">⚡ Iniciar Squad</button></div></form>';
  const objectiveInput=document.getElementById('mfObjective');
  const preview=()=>{document.getElementById('mfTeam').textContent='Equipe selecionada: '+SquadCore.selectAgents(objectiveInput.value).map(id=>AGENTS.find(a=>a.id===id)?.name).join(' · ')+' · Planner ao final';};
  objectiveInput.oninput=preview;preview();
  document.getElementById('missionForm').onsubmit=e=>{e.preventDefault();const clientId=mfClient.value;const objective=mfObjective.value.trim();closeModal('formModal');runFullMission(clientId,objective)};
  openModal('formModal');
}
function missionIsRunning(m){return ['Preparando','Executando'].includes(m.status)&&(activeMissionId===m.id||remoteRun?.id===m.id&&remoteRun.expiresAt>Date.now())}
function missionAgents(m){return (m.agentIds||AGENTS.map(a=>a.id)).map(id=>AGENTS.find(a=>a.id===id)).filter(Boolean)}
function telemetryFrom(data){return {attempts:data.attempts||[],responseId:data.responseId||'',model:data.model||'',usedWeb:Boolean(data.usedWeb),webSearchCalls:data.webSearchCalls||0,sources:data.sources||[],usage:data.usage||null,durationMs:data.durationMs||0,estimatedCostUsd:data.estimatedCostUsd??null,completedAt:new Date().toISOString()}}
async function createExecutionPlan(id){return runFullMission('','',{resumeId:id,redoPlan:true})}
async function resumeMission(id){return runFullMission('','',{resumeId:id})}
async function runFullMission(clientId,objective,options={}){
  if(activeMissionId||radarSearchInFlight)return alert('A Squad já está executando uma operação nesta aba.');
  let mission=options.resumeId?state.missions.find(x=>x.id===options.resumeId):null;
  if(options.resumeId&&!mission)return;
  const mode=mission?.mode||(options.mode==='prospecting'?'prospecting':'client');
  const client=mission?.clientSnapshot||(mode==='prospecting'?{
    id:'wdm-apps-prospecting',name:'WDM Apps',segment:'Sites, aplicativos, sistemas e automações',city:'Brasil',site:'https://wdmapps.com.br',notes:'Prospecção de empresas novas para a WDM Apps.'
  }:state.clients.find(c=>c.id===clientId));
  if(!client)return alert('Cliente não encontrado.');
  if(options.resumeId&&mission.status==='Concluída'&&!options.redoPlan)return showMissionResult(mission.id);
  const runId=mission?.id||uid(),controller=new AbortController();
  activeMissionId=runId;activeMissionAbortController=controller;commandResultMissionId='';
  let claimed=false;
  try{
    await claimRun(runId);claimed=true;
    // Once the previous reservation expires, unfinished missions remain resumable.
    for(const old of state.missions)if(old.id!==runId&&['Preparando','Executando'].includes(old.status)){old.status='Pausada';old.currentLabel='Execução anterior pausada; retome as etapas pendentes.';old.currentAgentId='';}
    if(!mission){
      mission={id:runId,clientId:mode==='prospecting'?'':client.id,clientName:mode==='prospecting'?'WDM Apps · Prospecção':client.name,
        clientSnapshot:{...client},mode,objective:objective.trim(),agentIds:SquadCore.selectAgents(objective,mode),
        status:'Preparando',progress:0,currentAgentId:'',currentLabel:'Morgan selecionando especialistas...',results:[],error:'',createdAt:new Date().toISOString(),finishedAt:''};
      state.missions.unshift(mission);
    }
    mission.agentIds=mission.agentIds||AGENTS.map(a=>a.id);
    mission.status='Preparando';mission.error='';mission.finishedAt='';
    if(!await saveState())throw Error('Não foi possível salvar o ponto de retomada na nuvem. Confira a conexão antes de continuar.');
    if(options.keepView)showView('command');else showView('missions');
    const user=await firebaseUser();if(!user)throw Error('Sua sessão expirou. Entre novamente no painel.');
    const agents=missionAgents(mission),previousResults=missionResultsMap(mission);
    for(let i=0;i<agents.length;i++){
      const a=agents[i];
      if(mission.results.some(r=>r.agentId===a.id&&r.text))continue;
      controller.signal.throwIfAborted();
      mission.status='Executando';mission.currentAgentId=a.id;mission.currentLabel='Agente '+a.name+' trabalhando...';mission.progress=Math.round(i/(agents.length+1)*100);
      if(!await saveState())throw Error('Falha ao salvar a etapa. Retome após sincronizar.');
      const idToken=await user.getIdToken();
      const data=await squadApiCall(idToken,{agentId:a.id,client,objective:mission.objective,previousResults,missionMode:mode,excludedCompanies:state.clients.map(c=>c.name)},controller.signal);
      controller.signal.throwIfAborted();
      const result={agentId:a.id,agentName:a.name,role:a.role,text:data.text,...telemetryFrom(data)};
      mission.results.push(result);previousResults[a.id]=result.text;
      mission.progress=Math.round((i+1)/(agents.length+1)*100);mission.currentLabel=a.name+' concluiu; resultado salvo.';
      addActivity(a.icon,'Agente '+a.name+' concluiu',mission.clientName);
      if(!await saveState())throw Error('Resultado preservado neste aparelho. Sincronize antes de retomar a próxima etapa.');
    }
    controller.signal.throwIfAborted();
    mission.currentAgentId='';mission.currentLabel='Montando plano de execução...';
    if(!await saveState())throw Error('Sincronize os resultados antes de gerar o plano.');
    const planned=mission.executionPlan&&!options.redoPlan?true:await generateExecutionPlan(mission.id,true,await user.getIdToken(),controller.signal);
    controller.signal.throwIfAborted();
    if(!planned){mission.status='Parcial';mission.currentLabel='Entregas salvas. O plano precisa ser retomado.';mission.error=mission.planError||'Não foi possível concluir o plano.';await saveState();return;}
    mission.status='Concluída';mission.progress=100;mission.currentLabel='Missão e plano concluídos';mission.finishedAt=new Date().toISOString();
    addActivity('🏁','Morgan concluiu a missão',mission.clientName);await saveState();showMissionResult(mission.id,true);
    if(options.voice)squadSpeak('Missão concluída. Os resultados e o plano estão salvos.');
  }catch(e){
    if(mission&&claimed){
      mission.status=controller.signal.aborted?'Interrompida':'Erro';mission.currentAgentId='';mission.currentLabel='Resultados salvos; retome as etapas pendentes.';mission.error=controller.signal.aborted?'':String(e.message||e).slice(0,600);await saveState();
    }else alert(e.message||'Não foi possível iniciar a missão.');
  }finally{
    if(claimed)await releaseRun();
    activeMissionId='';activeMissionAbortController=null;renderAll();
  }
}
function repeatMission(id){
  const m=state.missions.find(x=>x.id===id);if(!m)return;
  runFullMission(m.clientId,m.objective,{mode:m.mode||'client'});
}
async function deleteMission(id){
  const m=state.missions.find(x=>x.id===id);if(!m)return;
  if(activeMissionId===id||['Preparando','Executando'].includes(m.status)&&remoteRun?.expiresAt>Date.now())return alert('Pare a missão antes de excluir.');
  if(!confirm('Excluir esta missão e seus resultados?'))return;
  state.missions=state.missions.filter(x=>x.id!==id);
  await saveState();
}

function renderCampaigns(){
  if(!state)return;document.getElementById('campaignGrid').innerHTML=state.campaigns.length?state.campaigns.map(c=>campaignCard(c,true)).join(''):'<div class="empty">Nenhuma campanha ainda.</div>';
}
function taskPriorityRank(p){return p==='Alta'?0:p==='Média'?1:2}
function taskSort(a,b){
  const pa=taskPriorityRank(a.priority),pb=taskPriorityRank(b.priority);
  if(pa!==pb)return pa-pb;
  const da=a.due?new Date(a.due+'T12:00:00').getTime():Number.MAX_SAFE_INTEGER;
  const dbb=b.due?new Date(b.due+'T12:00:00').getTime():Number.MAX_SAFE_INTEGER;
  if(da!==dbb)return da-dbb;
  return new Date(a.createdAt||0)-new Date(b.createdAt||0);
}
function renderTasks(){
  if(!state)return;
  const clientFilter=document.getElementById('taskClientFilter');
  if(clientFilter){
    const keep=clientFilter.value||'all';
    clientFilter.innerHTML='<option value="all">Todos os clientes</option>'+state.clients.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('');
    clientFilter.value=[...clientFilter.options].some(o=>o.value===keep)?keep:'all';
  }
  const q=(document.getElementById('taskSearch')?.value||'').trim().toLowerCase();
  const clientId=document.getElementById('taskClientFilter')?.value||'all';
  const priority=document.getElementById('taskPriorityFilter')?.value||'all';
  const source=document.getElementById('taskSourceFilter')?.value||'all';

  const list=state.tasks.filter(t=>{
    const sourceType=t.sourceMissionId?'squad':'manual';
    const matchesText=!q||[t.title,t.why,clientName(t.clientId),t.priority,t.source].join(' ').toLowerCase().includes(q);
    return matchesText&&(clientId==='all'||t.clientId===clientId)&&(priority==='all'||t.priority===priority)&&(source==='all'||source===sourceType);
  }).sort(taskSort);

  const open=list.filter(t=>t.status==='Aberta');
  const doing=list.filter(t=>t.status==='Em andamento');
  const done=list.filter(t=>t.status==='Concluída');

  document.getElementById('openTaskCount').textContent=open.length+' tarefa(s)';
  document.getElementById('doingTaskCount').textContent=doing.length+' tarefa(s)';
  document.getElementById('doneTaskCount').textContent=done.length+' tarefa(s)';
  document.getElementById('taskFilterSummary').textContent=list.length+' de '+state.tasks.length+' tarefa(s)';

  document.getElementById('openTasks').innerHTML=open.length?open.map(taskRow).join(''):'<div class="empty">Nenhuma tarefa aberta.</div>';
  document.getElementById('doingTasks').innerHTML=doing.length?doing.map(taskRow).join(''):'<div class="empty">Nada em andamento.</div>';
  document.getElementById('doneTasks').innerHTML=done.length?done.map(taskRow).join(''):'<div class="empty">Nenhuma concluída.</div>';
}
function taskRow(t){
  const source=t.sourceMissionId?'🤖 Squad':'✍️ Manual';
  const status=t.status||'Aberta';
  return '<div class="task '+(status==='Concluída'?'done':'')+'"><input type="checkbox" '+(status==='Concluída'?'checked':'')+' title="Marcar como concluída" onchange="toggleTask(\''+t.id+'\')"><div class="grow"><strong>'+esc(t.title)+'</strong><span style="display:block">'+esc(clientName(t.clientId))+' · '+esc(t.priority||'Média')+(t.due?' · '+fmtDate(t.due):'')+'</span>'+(t.why?'<span style="display:block;margin-top:3px">'+esc(t.why)+'</span>':'')+'<span class="task-source">'+source+'</span></div><div class="task-actions"><select title="Status" onchange="setTaskStatus(\''+t.id+'\',this.value)">'+['Aberta','Em andamento','Concluída'].map(s=>'<option '+(s===status?'selected':'')+'>'+s+'</option>').join('')+'</select><button class="btn" onclick="openTaskDetail(\''+t.id+'\')">Detalhes</button></div></div>';
}
function openTaskDetail(id){
  const t=state.tasks.find(x=>x.id===id);if(!t)return;
  const mission=t.sourceMissionId?state.missions.find(m=>m.id===t.sourceMissionId):null;
  document.getElementById('modalTitle').textContent='Detalhes da tarefa';
  document.getElementById('modalBody').innerHTML=
    '<h3 style="margin-bottom:6px">'+esc(t.title)+'</h3>'+
    '<div class="tiny muted">'+(t.sourceMissionId?'🤖 Criada automaticamente pela WDM Squad':'✍️ Criada manualmente')+'</div>'+
    '<div class="task-detail-grid">'+
      '<div class="task-detail-box"><small>Cliente</small><strong>'+esc(clientName(t.clientId))+'</strong></div>'+
      '<div class="task-detail-box"><small>Status</small><strong>'+esc(t.status||'Aberta')+'</strong></div>'+
      '<div class="task-detail-box"><small>Prioridade</small><strong>'+esc(t.priority||'Média')+'</strong></div>'+
      '<div class="task-detail-box"><small>Prazo</small><strong>'+(t.due?fmtDate(t.due):'Sem prazo')+'</strong></div>'+
    '</div>'+
    (t.why?'<div class="task-note"><b>Por que fazer:</b><br>'+esc(t.why)+'</div>':'')+
    (mission?'<div class="task-note" style="margin-top:10px"><b>Missão de origem:</b><br>'+esc(mission.objective||'Missão automática')+'<br><span class="tiny muted">'+(mission.createdAt?new Date(mission.createdAt).toLocaleString('pt-BR'):'')+'</span></div>':'')+
    '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px">'+
      (mission?'<button class="btn" onclick="openMissionFromTask(\''+mission.id+'\')">⚡ Abrir missão</button>':'')+
      '<button class="btn" onclick="closeModal(\'formModal\');openTaskModal(\''+t.id+'\')">Editar</button>'+
      '<button class="btn danger" onclick="deleteTaskFromDetail(\''+t.id+'\')">Excluir</button>'+
      '<button class="btn primary" onclick="closeModal(\'formModal\')">Fechar</button>'+
    '</div>';
  openModal('formModal');
}
function openMissionFromTask(missionId){
  closeModal('formModal');showView('missions');
  setTimeout(()=>document.getElementById('mission-'+missionId)?.scrollIntoView({behavior:'smooth',block:'center'}),80);
}

function openModal(id){document.getElementById(id).classList.add('open')}
function closeModal(id){document.getElementById(id).classList.remove('open')}
window.closeModal=closeModal;
function clientOptions(selected){return state.clients.map(c=>'<option value="'+c.id+'" '+(c.id===selected?'selected':'')+'>'+esc(c.name)+'</option>').join('')}

function openClientModal(id){
  const c=state.clients.find(x=>x.id===id)||{id:'',name:'',segment:'',city:'',site:'',whatsapp:'',instagram:'',notes:'',status:'Ativo'};
  document.getElementById('modalTitle').textContent=id?'Editar cliente':'Novo cliente';
  document.getElementById('modalBody').innerHTML='<form id="clientForm" class="form-grid"><input id="cfName" required placeholder="Nome da empresa" value="'+esc(c.name)+'"><input id="cfSegment" placeholder="Segmento" value="'+esc(c.segment)+'"><input id="cfCity" placeholder="Cidade/região" value="'+esc(c.city)+'"><select id="cfStatus"><option '+(c.status==='Ativo'?'selected':'')+'>Ativo</option><option '+(c.status==='Pausa'?'selected':'')+'>Pausa</option><option '+(c.status==='Inativo'?'selected':'')+'>Inativo</option></select><input class="full" id="cfSite" placeholder="https://site.com.br" value="'+esc(c.site)+'"><input id="cfWhatsapp" placeholder="WhatsApp com DDD" value="'+esc(c.whatsapp)+'"><input id="cfInstagram" placeholder="Instagram" value="'+esc(c.instagram||'')+'"><textarea class="full" id="cfNotes" placeholder="Observações">'+esc(c.notes)+'</textarea><div class="full" style="display:flex;justify-content:flex-end;gap:8px"><button type="button" class="btn" onclick="closeModal(\'formModal\')">Cancelar</button><button class="btn primary">Salvar</button></div></form>';
  document.getElementById('clientForm').onsubmit=async e=>{e.preventDefault();const item={id:id||uid(),name:cfName.value.trim(),segment:cfSegment.value.trim(),city:cfCity.value.trim(),site:cfSite.value.trim(),whatsapp:cfWhatsapp.value.trim(),instagram:cfInstagram.value.trim(),notes:cfNotes.value.trim(),status:cfStatus.value,createdAt:c.createdAt||new Date().toISOString()};const i=state.clients.findIndex(x=>x.id===item.id);if(i>=0)state.clients[i]=item;else state.clients.push(item);addActivity('🏢',id?'Cliente atualizado':'Novo cliente',item.name);closeModal('formModal');await saveState()};
  openModal('formModal');
}
function parseRadarLeadBlocks(text,query){
  const raw=String(text||'');
  const list=[];
  const structured=safeParse(raw);
  const leadText=Array.isArray(structured?.leads)?structured.leads.map(item=>'LEAD_START\n'+Object.entries(item).map(([k,v])=>k+': '+String(v).replace(/[\r\n]+/g,' ')).join('\n')+'\nLEAD_END').join('\n'):raw;
  const re=/LEAD_START([\s\S]*?)LEAD_END/gi;
  let match;
  while((match=re.exec(leadText))){
    const data={};
    String(match[1]||'').split(/\r?\n/).forEach(line=>{
      const m=line.match(/^([A-Z_]+):\s*(.*)$/);
      if(m)data[m[1]]=m[2].trim();
    });
    const company=String(data.EMPRESA||'').trim();
    if(!company)continue;
    const item={
      id:uid(),company:company.slice(0,180),city:String(data.CIDADE||'').slice(0,120),
      site:safePublicUrl(data.SITE),contact:String(data.CONTATO||'').replace(/^(não encontrado|não informado|—|-)$/i,'').slice(0,180),
      siteStatus:String(data.STATUS_SITE||(!safePublicUrl(data.SITE)?'NAO_CONFIRMADO':'COM_SITE')).trim().toUpperCase().slice(0,40),
      siteEvidence:String(data.EVIDENCIA_SITE||'').trim().slice(0,420),
      googleRating:String(data.GOOGLE_NOTA||'').trim().slice(0,20),
      googleReviews:String(data.GOOGLE_AVALIACOES||'').trim().slice(0,30),
      socialActive:String(data.REDES_ATIVAS||'NAO_CONFIRMADO').trim().toUpperCase().slice(0,30),
      socialUrl:safePublicUrl(data.REDE_SOCIAL),
      need:String(data.NECESSIDADE||'Avaliar presença digital').slice(0,260),
      reason:String(data.MOTIVO||'').slice(0,420),sourceUrl:safePublicUrl(data.FONTE),
      query:query||'',createdAt:new Date().toISOString()
    };
    list.push(item);
  }
  const seen=new Set();
  return list.filter(x=>{const k=(x.company+'|'+x.city).toLowerCase();if(seen.has(k))return false;seen.add(k);return true}).slice(0,10);
}
function openRadarLeadModal(){
  document.getElementById('modalTitle').textContent='📡 Radar Nacional · Buscar novos leads';
  document.getElementById('modalBody').innerHTML='<form id="radarLeadForm" class="form-grid">'+
    '<input id="rlRegion" required placeholder="Brasil, estado, cidade ou região" value="Brasil">'+
    '<input id="rlSegment" placeholder="Segmento (opcional)" value="">'+
    '<select id="rlQty"><option value="5">5 empresas</option><option value="8">8 empresas</option><option value="10" selected>10 empresas</option></select>'+
    '<select id="rlSiteMode"><option value="no-site" selected>🔥 Somente empresas sem site</option><option value="weak">⚠ Sem site ou com site fraco</option><option value="any">🌐 Qualquer oportunidade digital</option></select>'+
    '<div class="full tiny muted">Use “Brasil” para busca nacional ou informe um estado/cidade quando quiser restringir. Radar descobre os candidatos e Scout faz uma segunda validação antes de eles aparecerem aqui.</div>'+
    '<textarea class="full" id="rlNotes" placeholder="Algum foco? Ex.: oficinas, clínicas, construção, comércio...">Priorize empresas ativas com potencial real para contratar site, sistema web, automação ou melhoria de presença digital. Evite grandes redes e franquias quando houver opção local.</textarea>'+
    '<div class="full" style="display:flex;justify-content:flex-end;gap:8px"><button type="button" class="btn" onclick="closeModal(\'formModal\')">Cancelar</button><button class="btn primary">📡 Iniciar varredura</button></div></form>';
  document.getElementById('radarLeadForm').onsubmit=e=>{
    e.preventDefault();
    const region=rlRegion.value.trim(),segment=rlSegment.value.trim(),qty=Number(rlQty.value)||10,siteMode=rlSiteMode.value,notes=rlNotes.value.trim();
    closeModal('formModal');runRadarLeadSearch(region,segment,qty,notes,siteMode);
  };
  openModal('formModal');
}
function radarLeadKey(x){
  return SquadCore.leadKey(x);
}
function mergeRadarCandidates(base,items){
  const map=new Map((base||[]).map(x=>[radarLeadKey(x),x]));
  for(const item of (items||[])){
    const key=radarLeadKey(item);
    if(!key)continue;
    const prev=map.get(key);
    map.set(key,prev?{...prev,...item,id:prev.id||item.id,createdAt:prev.createdAt||item.createdAt}:item);
  }
  return [...map.values()];
}
function radarOutputFormat(){
  return [
    'Para CADA empresa, retorne exatamente este bloco:',
    'LEAD_START',
    'EMPRESA: nome real da empresa',
    'CIDADE: cidade/UF',
    'SITE: URL do site oficial próprio ou -',
    'STATUS_SITE: SEM_SITE, SITE_FRACO, COM_SITE ou NAO_CONFIRMADO',
    'EVIDENCIA_SITE: evidência curta de como a situação do site foi verificada',
    'GOOGLE_NOTA: nota pública atual no Google, como 4.7, ou -',
    'GOOGLE_AVALIACOES: quantidade de avaliações, apenas número, ou -',
    'REDES_ATIVAS: SIM, NAO ou NAO_CONFIRMADO',
    'REDE_SOCIAL: URL pública de Instagram/Facebook/TikTok ou -',
    'CONTATO: telefone/WhatsApp comercial público ou -',
    'NECESSIDADE: serviço que a WDM poderia oferecer',
    'MOTIVO: evidência curta e específica da oportunidade',
    'FONTE: URL pública que comprova a empresa ou oportunidade',
    'LEAD_END',
    'Não use esse formato para empresas fictícias. Depois dos blocos, não escreva mais nada.'
  ];
}
function radarDiscoveryRounds(region,segment){
  const national=/^brasil$|brasil inteiro|todo o brasil|nacional/i.test(String(region||'').trim());
  if(national){
    return [
      {label:'Sudeste',focus:'Varra principalmente SP, RJ, MG e ES, misturando capitais, cidades médias e interior. Não concentre tudo numa única cidade.'},
      {label:'Sul',focus:'Varra PR, SC e RS, misturando capitais, cidades médias e interior.'},
      {label:'Nordeste',focus:'Varra BA, PE, CE, RN, PB, AL, SE, MA e PI, priorizando negócios locais ativos.'},
      {label:'Centro-Oeste e Norte',focus:'Varra GO, DF, MT, MS e estados da Região Norte. Procure negócios locais com presença pública verificável.'},
      {label:'varredura nacional complementar',focus:'Procure oportunidades adicionais em qualquer estado brasileiro, evitando repetir empresas e priorizando cidades/segmentos ainda pouco representados.'}
    ];
  }
  return [
    {label:'busca principal',focus:'Explore profundamente a região informada, variando termos e tipos de negócio.'},
    {label:'Google e redes sociais',focus:'Procure negócios que apareçam no Google, Instagram ou Facebook e possam depender só desses canais, sem domínio próprio.'},
    {label:'serviços e comércio',focus:'Varie entre serviços locais, oficinas, construção, estética, alimentação, lojas especializadas, manutenção, clínicas independentes e pequenas empresas B2B.'}
  ];
}
function radarFilterByMode(items,siteMode){
  return (items||[]).filter(x=>{
    const status=String(x.siteStatus||'NAO_CONFIRMADO').toUpperCase();
    const site=safePublicUrl(x.site);
    const evidence=String(x.siteEvidence||'').trim();
    const source=safePublicUrl(x.sourceUrl)||safePublicUrl(x.socialUrl);
    if(siteMode==='no-site')return status==='SEM_SITE'&&!site&&!!evidence&&!!source;
    if(siteMode==='weak')return ['SEM_SITE','SITE_FRACO'].includes(status)&&!!evidence&&!!source;
    return ['SEM_SITE','SITE_FRACO','COM_SITE'].includes(status)&&!!source;
  });
}
async function validateRadarCandidates(idToken,pool,siteMode,region,segment,qty){
  const accepted=[];
  const maxPool=Math.min(pool.length,24);
  for(let offset=0;offset<maxPool&&accepted.length<qty;offset+=8){
    const batch=pool.slice(offset,offset+8);
    const list=batch.map((x,i)=>(i+1)+'. '+x.company+' | '+(x.city||region)+' | site informado: '+(x.site||'-')+' | fonte: '+(x.sourceUrl||x.socialUrl||'-')).join('\n');
    const rule=siteMode==='any'?'Confirme a empresa, a fonte e uma oportunidade digital real; descarte incertezas e não invente defeitos.':siteMode==='no-site'
      ?'Aprove SOMENTE empresas em que você confirmou, após nova pesquisa, que NÃO existe site oficial próprio. Se encontrar site oficial ou houver dúvida, descarte.'
      :'Aprove somente SEM_SITE ou SITE_FRACO. SITE_FRACO exige problema público concreto e verificável; se o site estiver bom/atual e não houver lacuna clara, descarte.';
    const objective=[
      'Você é o Scout, revisor independente do Radar. Reavalie apenas as empresas abaixo; não introduza novas empresas.',
      'REGIÃO DA BUSCA: '+region+'.',
      segment?'SEGMENTO: '+segment+'.':'',
      rule,
      'Pesquise novamente nome + cidade e também nome + site, website e www. Confira resultados de busca, Perfil da Empresa no Google e links/bio das redes sociais.',
      'Instagram, Facebook, Linktree, catálogo, marketplace e Perfil da Empresa no Google NÃO contam como site oficial próprio.',
      'Não marque SITE_FRACO por gosto visual. Exija algo observável: site quebrado, sem HTTPS, problema mobile evidente, páginas essenciais com erro, conteúdo claramente abandonado ou contato/conversão seriamente deficientes.',
      'EMPRESAS PARA VALIDAR:\n'+list,
      ...radarOutputFormat()
    ].filter(Boolean).join('\n');
    const data=await radarApiCallWithRetry(idToken,{
      agentId:'scout',
      client:{name:'WDM Apps',segment:'Validação de leads para prospecção',city:region,site:'https://wdmapps.com.br',instagram:'',notes:'Scout independente validando resultados do Radar.'},
      objective,
      previousResults:{}
    },'🔎 Scout validando candidatos '+(offset+1)+'-'+Math.min(offset+8,maxPool)+' de '+maxPool);
    const parsed=parseRadarLeadBlocks(data.text,'Scout · '+region).map(x=>({...x,sources:data.sources||[],checkedAt:new Date().toISOString(),scoutTelemetry:telemetryFrom(data)}));
    const allowed=new Set(batch.map(radarLeadKey));
    const valid=radarFilterByMode(parsed.filter(x=>allowed.has(radarLeadKey(x))),siteMode);
    const merged=mergeRadarCandidates(accepted,valid);
    accepted.splice(0,accepted.length,...merged);
  }
  return accepted.sort((a,b)=>calculateLeadScore(b)-calculateLeadScore(a)).slice(0,qty);
}
async function runRadarLeadSearch(region,segment,qty,notes,siteMode='no-site'){
  if(radarSearchInFlight||activeMissionId)return alert('O Radar já está pesquisando nesta aba.');
  radarSearchInFlight=true;
  try{await claimRun('radar-'+uid());}catch(e){radarSearchInFlight=false;alert(e.message);return;}
  state.radarLeadSearch={status:'running',message:'📡 Radar iniciando varredura em '+region+'...',region,segment,siteMode,attempt:1,startedAt:new Date().toISOString()};
  await saveState();setLeadTab('found');showView('leads');
  try{
    const user=await firebaseUser();
    if(!user)throw new Error('Sua sessão expirou. Entre novamente no painel.');
    const idToken=await user.getIdToken(true);
    const rounds=radarDiscoveryRounds(region,segment);
    let pool=[];
    for(let i=0;i<rounds.length;i++){
      const round=rounds[i];
      const objective=[
        'Você é o Radar da WDM Squad. FASE DE DESCOBERTA.',
        'Encontre até 10 empresas reais, ativas e verificáveis que possam ser potenciais clientes da WDM Apps.',
        'ÁREA: '+region+'. Rodada: '+round.label+'.',
        round.focus,
        segment?'SEGMENTO PREFERENCIAL: '+segment+'.':'Varie os segmentos para aumentar a cobertura.',
        notes||'Priorize sinais públicos de oportunidade digital.',
        siteMode==='no-site'
          ?'Dê prioridade máxima a negócios que aparentem não ter site próprio. Se ainda não puder comprovar a ausência, use NAO_CONFIRMADO; não invente SEM_SITE.'
          :siteMode==='weak'
            ?'Priorize negócios sem site e depois sites com problemas públicos concretos. Se não puder confirmar, use NAO_CONFIRMADO.'
            :'Busque oportunidades digitais reais e classifique a situação do site sem forçar um problema.',
        'Evite grandes redes e franquias quando houver empresas locais com potencial comercial mais realista.',
        'Pesquise informações públicas atuais. Não entre em contato com ninguém.',
        ...radarOutputFormat()
      ].join('\n');
      const data=await radarApiCallWithRetry(idToken,{
        agentId:'radar',
        client:{name:'WDM Apps',segment:'Desenvolvimento de aplicativos, sistemas web, automações e soluções digitais',city:region,site:'https://wdmapps.com.br',instagram:'',notes:'Prospecção comercial nacional/regional da WDM Apps.'},
        objective,
        previousResults:{}
      },'📡 Radar · '+round.label+' · rodada '+(i+1)+'/'+rounds.length);
      const found=parseRadarLeadBlocks(data.text,[region,segment,round.label].filter(Boolean).join(' · '));
      pool=mergeRadarCandidates(pool,found).slice(0,40);
      state.radarLeadSearch.message='📡 Radar: '+pool.length+' candidata(s) únicas encontradas. '+(i<rounds.length-1?'Continuando a varredura...':'Passando para o Scout validar...');
      await saveState();
    }
    if(!pool.length)throw new Error('O Radar não encontrou empresas candidatas verificáveis. Tente outro segmento ou outra área.');
    pool=pool.sort((a,b)=>calculateLeadScore(b)-calculateLeadScore(a));

    const candidates=await validateRadarCandidates(idToken,pool,siteMode,region,segment,qty);
    if(!candidates.length){
      throw new Error(siteMode==='no-site'
        ?'O Radar encontrou candidatas, mas o Scout não confirmou nenhuma empresa sem site com segurança.'
        :'O Radar encontrou candidatas, mas nenhuma passou pela validação do Scout.');
    }

    const existingKeys=new Set(state.leads.map(radarLeadKey));
    const fresh=candidates.filter(x=>!existingKeys.has(radarLeadKey(x)));
    const blocked=new Set([...state.leads,...state.clients,...state.rejectedLeads].map(radarLeadKey));
    state.leadCandidates=mergeRadarCandidates(state.leadCandidates,fresh.filter(x=>!blocked.has(radarLeadKey(x)))).sort((a,b)=>calculateLeadScore(b)-calculateLeadScore(a));
    state.radarLeadSearch={
      status:'done',
      message:'✅ Radar analisou '+pool.length+' candidata(s); Scout validou '+candidates.length+'; '+fresh.length+' oportunidade(s) nova(s) prontas para sua avaliação.',
      region,segment,siteMode,attempt:state.radarLeadSearch.attempt||1,finishedAt:new Date().toISOString()
    };
    addActivity('📡','Radar + Scout concluíram a prospecção',region+' · '+fresh.length+' oportunidade(s) validada(s)');
    await saveState();
  }catch(e){
    state.radarLeadSearch={status:'error',message:'Falha na pesquisa: '+String(e?.message||e).slice(0,300),region,segment,siteMode,attempt:state.radarLeadSearch.attempt||1,finishedAt:new Date().toISOString()};
    await saveState();
  }
  finally{radarSearchInFlight=false;await releaseRun();}
}
async function analyzeLeadCandidate(id){return analyzeLeadRecord(id,'candidate')}
async function analyzeLeadRecord(id,kind='candidate'){
  const c=(kind==='candidate'?state.leadCandidates:state.leads).find(x=>x.id===id);if(!c)return;
  if(c.scoutStatus==='running'&&Date.now()-(c.scoutStartedAt||0)<240000)return;
  c.scoutStartedAt=Date.now();
  c.scoutStatus='running';c.scoutError='';
  if(!await saveState()){c.scoutStatus='error';c.scoutError='Não foi possível salvar o início da análise. Confira a sincronização e tente novamente.';renderLeads();return;}
  try{
    const user=await firebaseUser();
    if(!user)throw new Error('Sua sessão expirou. Entre novamente no painel.');
    const idToken=await user.getIdToken(true);
    const objective=[
      'Faça uma análise comercial curta desta empresa como potencial lead da WDM Apps.',
      'Pesquise informações públicas atuais antes de concluir.',
      'Valide o que for possível sobre site, presença digital e operação.',
      'Considere a oportunidade sugerida pelo Radar, mas NÃO assuma que ela é verdadeira sem evidência.',
      'OPORTUNIDADE SUGERIDA: '+(c.need||'Avaliar presença digital')+'.',
      'MOTIVO DO RADAR: '+(c.reason||'não informado')+'.',
      c.sourceUrl?'FONTE INICIAL: '+c.sourceUrl+'.':'',
      'Entregue até 5 blocos curtos, com títulos: SITE ANALISADO (URL oficial ou não encontrado e fontes consultadas); PROBLEMAS OBSERVADOS (cada problema com URL da página e evidência pública; diferencie hipótese de fato); O QUE A WDM APPS PODE MELHORAR (ligue cada problema confirmado a uma entrega concreta, prioridade e benefício plausível); SOLUÇÃO INICIAL (escopo enxuto para esta empresa); ANTES DE ABORDAR (incertezas e o que conferir).',
      'Se não encontrar site, diga site não encontrado nas fontes consultadas, sem garantir inexistência. Sugira uma presença digital inicial adequada ao negócio.',
      'Não afirme problema de velocidade, segurança ou responsividade sem evidência ou medição disponível. Não classifique um site como ruim apenas por estética.',
      'Não invente sistema ausente, problema interno, faturamento, equipe ou necessidade que não possa ser observada publicamente.',
      'Não entre em contato com a empresa.'
    ].filter(Boolean).join('\n');
    const data=await squadApiCall(idToken,{
      agentId:'scout',
      client:{
        name:c.company,
        segment:c.need||'Potencial cliente da WDM Apps',
        city:c.city||'',
        site:c.site||c.website||'',
        instagram:'',
        notes:[
          c.contact?'Contato comercial público: '+c.contact:'',
          c.reason?'Radar: '+c.reason:'',
          c.sourceUrl?'Fonte pública: '+c.sourceUrl:''
        ].filter(Boolean).join(' | ')
      },
      objective,
      previousResults:{radar:(c.reason||'')+'\n'+(c.need||'')}
    });
    c.scoutAnalysis=String(data.text||'').trim().slice(0,5000);
    if(!c.scoutAnalysis)throw new Error('O Scout não retornou uma análise.');
    c.scoutAt=new Date().toISOString();c.scoutTelemetry=telemetryFrom(data);
    c.scoutStatus='done';c.scoutError='';
    addActivity('🔎','Scout analisou lead',c.company);
    await saveState();
  }catch(e){
    c.scoutStatus='error';
    c.scoutError=String(e?.message||e).slice(0,400);
    await saveState();
  }
}
function openLeadScoutAnalysis(id){
  const l=state.leads.find(x=>x.id===id);if(!l||!l.scoutAnalysis)return;
  document.getElementById('modalTitle').textContent='🔎 Scout · '+l.company;
  document.getElementById('modalBody').innerHTML=
    '<div class="tiny muted" style="margin-bottom:10px">Análise pública feita antes da prospecção. Confirme informações importantes antes de apresentar uma proposta.</div>'+
    '<div class="mission-result-body" style="padding:14px;border:1px solid var(--border);border-radius:12px;background:#091124">'+esc(l.scoutAnalysis).replace(/\n/g,'<br>')+'</div>'+
    (l.scoutAt?'<div class="tiny muted" style="margin-top:8px">Analisado em '+new Date(l.scoutAt).toLocaleString('pt-BR')+'</div>':'')+
    '<div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn primary" onclick="closeModal(\'formModal\')">Fechar</button></div>';
  openModal('formModal');
}
async function generateLeadApproach(record,kind){
  if(!record||record.copyStatus==='running'&&Date.now()-(record.copyStartedAt||0)<240000)return;
  record.copyStartedAt=Date.now();
  if(!record.scoutAnalysis){alert('Analise a empresa com o Scout antes de preparar a abordagem.');return}
  record.copyStatus='running';record.copyError='';
  if(!await saveState()){record.copyStatus='error';record.copyError='Não foi possível salvar o início da abordagem. Confira a sincronização e tente novamente.';renderLeads();return;}
  try{
    const user=await firebaseUser();
    if(!user)throw new Error('Sua sessão expirou. Entre novamente no painel.');
    const idToken=await user.getIdToken(true);
    const site=record.site||record.website||'';
    const objective=[
      'Prepare uma primeira abordagem comercial personalizada da WDM Apps para esta empresa.',
      'Use o diagnóstico do Scout e os dados públicos como contexto, mas não invente problemas nem afirme que a empresa precisa de algo que não foi confirmado.',
      'A mensagem deve parecer humana, curta e consultiva, sem exagero de marketing.',
      'O remetente é William Moraes, da WDM Apps. Use sempre o nome William Moraes na apresentação e assinatura quando fizer sentido.',
      'Nunca use placeholders como [nome], [seu nome], [empresa] ou similares para identificar o remetente.',
      'Não diga que uma IA pesquisou a empresa.',
      'Use estes títulos em linhas separadas, sem markdown: WHATSAPP INICIAL: (até 550 caracteres, apenas a mensagem pronta para enviar); FOLLOW-UP: (mensagem curta para usar alguns dias depois); PONTOS PARA CONVERSAR: (3 pontos). Mencione no WhatsApp uma melhoria concreta sustentada pelo diagnóstico, de forma respeitosa.',
      'Apresente a WDM Apps como empresa de soluções digitais. Foque no benefício plausível indicado pelo diagnóstico.',
      'Não prometa resultado, não invente case e não ofereça preço.',
      'NÃO envie a mensagem. Apenas prepare o texto para aprovação humana.'
    ].join('\n');
    const data=await squadApiCall(idToken,{
      agentId:'copy',
      client:{
        name:record.company,
        segment:record.need||'Potencial cliente da WDM Apps',
        city:record.city||'',
        site,
        instagram:'',
        notes:[
          record.contact?'Contato comercial público: '+record.contact:'',
          record.reason?'Oportunidade do Radar: '+record.reason:'',
          record.sourceUrl?'Fonte pública: '+record.sourceUrl:''
        ].filter(Boolean).join(' | ')
      },
      objective,
      previousResults:{
        radar:(record.reason||'')+'\n'+(record.need||''),
        scout:record.scoutAnalysis||''
      }
    });
    record.approachText=String(data.text||'').trim().slice(0,6000);
    if(!record.approachText)throw new Error('O Copy não retornou uma abordagem.');
    if(!record.whatsappEditedAt)record.whatsappDraft=firstWhatsapp(record.approachText);
    record.approachAt=new Date().toISOString();
    record.copyStatus='done';record.copyError='';
    addActivity('✍️','Copy preparou abordagem',record.company);
    await saveState();
  }catch(e){
    record.copyStatus='error';
    record.copyError=String(e?.message||e).slice(0,400);
    await saveState();
  }
}
async function prepareCandidateApproach(id){
  const c=state.leadCandidates.find(x=>x.id===id);if(!c)return;
  await generateLeadApproach(c,'candidate');
}
async function prepareApprovedLeadApproach(id){
  const l=state.leads.find(x=>x.id===id);if(!l)return;
  await generateLeadApproach(l,'lead');
  if(l.approachText)openLeadApproach(id);
}
async function copyTextValue(textValue){
  const value=String(textValue||'');
  if(!value)return;
  try{await navigator.clipboard.writeText(value);alert('Abordagem copiada!')}
  catch(e){
    const ta=document.createElement('textarea');ta.value=value;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();alert('Abordagem copiada!');
  }
}
async function copyCandidateApproach(id){
  const c=state.leadCandidates.find(x=>x.id===id);if(!c)return;
  await copyTextValue(c.approachText);
}
function openLeadApproach(id){
  const l=state.leads.find(x=>x.id===id);if(!l||!l.approachText)return;
  document.getElementById('modalTitle').textContent='✍️ Abordagem · '+l.company;
  document.getElementById('modalBody').innerHTML=
    '<div class="tiny muted" style="margin-bottom:10px">Texto preparado pelo Copy com base no Radar e no Scout. Revise antes de enviar.</div>'+
    '<div class="mission-result-body" style="padding:14px;border:1px solid var(--border);border-radius:12px;background:#091124">'+esc(l.approachText).replace(/\n/g,'<br>')+'</div>'+
    (l.approachAt?'<div class="tiny muted" style="margin-top:8px">Preparada em '+new Date(l.approachAt).toLocaleString('pt-BR')+'</div>':'')+
    '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px">'+
      '<button class="btn" onclick="copyApprovedLeadApproach(\''+l.id+'\')">📋 Copiar</button>'+
      '<button class="btn" onclick="closeModal(\'formModal\');prepareApprovedLeadApproach(\''+l.id+'\')">↻ Refazer</button>'+
      '<button class="btn primary" onclick="closeModal(\'formModal\')">Fechar</button>'+
    '</div>';
  openModal('formModal');
}
async function copyApprovedLeadApproach(id){
  const l=state.leads.find(x=>x.id===id);if(!l)return;
  await copyTextValue(l.approachText);
}
async function approveLeadCandidate(id){
  const c=state.leadCandidates.find(x=>x.id===id);if(!c)return;
  const duplicate=state.leads.some(l=>radarLeadKey(l)===radarLeadKey(c))||state.clients.some(l=>radarLeadKey(l)===radarLeadKey(c));
  if(!duplicate){
    state.leads.unshift({id:uid(),company:c.company,contact:c.contact||'',city:c.city||'',need:c.need||'',website:c.site||c.website||'',siteStatus:c.siteStatus||'',siteEvidence:c.siteEvidence||'',googleRating:c.googleRating||'',googleReviews:c.googleReviews||'',socialActive:c.socialActive||'',socialUrl:c.socialUrl||'',leadScore:calculateLeadScore(c),reason:c.reason||'',sourceUrl:c.sourceUrl||'',scoutAnalysis:c.scoutAnalysis||'',scoutAt:c.scoutAt||'',approachText:c.approachText||'',approachAt:c.approachAt||'',whatsappDraft:c.whatsappDraft??firstWhatsapp(c.approachText),whatsappEditedAt:c.whatsappEditedAt||'',status:'Novo',origin:'Radar',sources:c.sources||[],checkedAt:c.checkedAt||'',scoutTelemetry:c.scoutTelemetry||null,owner:'William',nextFollowup:localDate(),createdAt:new Date().toISOString()});
    addActivity('🎯','Lead aprovado pelo Radar',c.company);
  }
  state.leadCandidates=state.leadCandidates.filter(x=>x.id!==id);
  await saveState();
}
async function approveAllLeadCandidates(){
  if(!state.leadCandidates.length||!confirm('Adicionar todas as sugestões atuais ao funil como leads Novos?'))return;
  const items=[...state.leadCandidates];
  let added=0;
  for(const c of items){
    const duplicate=state.leads.some(l=>radarLeadKey(l)===radarLeadKey(c))||state.clients.some(l=>radarLeadKey(l)===radarLeadKey(c));
    if(!duplicate){state.leads.unshift({id:uid(),company:c.company,contact:c.contact||'',city:c.city||'',need:c.need||'',website:c.site||c.website||'',siteStatus:c.siteStatus||'',siteEvidence:c.siteEvidence||'',googleRating:c.googleRating||'',googleReviews:c.googleReviews||'',socialActive:c.socialActive||'',socialUrl:c.socialUrl||'',leadScore:calculateLeadScore(c),reason:c.reason||'',sourceUrl:c.sourceUrl||'',scoutAnalysis:c.scoutAnalysis||'',scoutAt:c.scoutAt||'',approachText:c.approachText||'',approachAt:c.approachAt||'',whatsappDraft:c.whatsappDraft??firstWhatsapp(c.approachText),whatsappEditedAt:c.whatsappEditedAt||'',status:'Novo',origin:'Radar',sources:c.sources||[],checkedAt:c.checkedAt||'',scoutTelemetry:c.scoutTelemetry||null,owner:'William',nextFollowup:localDate(),createdAt:new Date().toISOString()});added++}
  }
  state.leadCandidates=[];
  addActivity('🎯','Sugestões do Radar aprovadas',added+' lead(s) adicionados ao funil');
  await saveState();
}
async function rejectLeadCandidate(id){
  const c=state.leadCandidates.find(x=>x.id===id);if(!c)return;
  state.rejectedLeads.push({id:radarLeadKey(c),company:c.company,city:c.city,at:new Date().toISOString()});
  state.leadCandidates=state.leadCandidates.filter(x=>x.id!==id);
  addActivity('🗑️','Sugestão do Radar descartada',c.company);
  await saveState();
}
async function clearLeadCandidates(){
  if(!state.leadCandidates.length||!confirm('Limpar todas as sugestões pendentes do Radar?'))return;
  state.leadCandidates=[];
  await saveState();
}

async function convertLead(id){const l=state.leads.find(x=>x.id===id);if(!l)return;if(state.clients.some(c=>c.name.toLowerCase()===l.company.toLowerCase()))return alert('Esse cliente já existe.');state.clients.push({id:uid(),name:l.company,segment:l.need,city:l.city,site:l.website||'',whatsapp:l.contact,instagram:'',notes:['Convertido do funil de leads.',l.reason||'',l.scoutAnalysis?'Scout: '+l.scoutAnalysis:'',l.sourceUrl?'Fonte: '+l.sourceUrl:''].filter(Boolean).join(' '),status:'Ativo',createdAt:new Date().toISOString()});transitionLead(l,'Ganho');addActivity('🏆','Lead convertido em cliente',l.company);await saveState();showView('clients')}

function openCampaignModal(id){
  const c=state.campaigns.find(x=>x.id===id)||{clientId:state.clients[0]?.id||'',name:'',channel:'WhatsApp + Instagram',status:'Planejamento',progress:0,goal:''};
  document.getElementById('modalTitle').textContent=id?'Editar campanha':'Nova campanha';
  document.getElementById('modalBody').innerHTML='<form id="campaignForm" class="form-grid"><select id="cafClient">'+clientOptions(c.clientId)+'</select><input id="cafName" required placeholder="Nome da campanha" value="'+esc(c.name)+'"><input id="cafChannel" placeholder="Canais" value="'+esc(c.channel)+'"><select id="cafStatus">'+['Planejamento','Em andamento','Pausada','Concluída'].map(s=>'<option '+(s===c.status?'selected':'')+'>'+s+'</option>').join('')+'</select><input class="full" id="cafProgress" type="range" min="0" max="100" value="'+Number(c.progress||0)+'"><textarea class="full" id="cafGoal" placeholder="Objetivo da campanha">'+esc(c.goal)+'</textarea><div class="full" style="display:flex;justify-content:flex-end;gap:8px"><button type="button" class="btn" onclick="closeModal(\'formModal\')">Cancelar</button><button class="btn primary">Salvar</button></div></form>';
  document.getElementById('campaignForm').onsubmit=async e=>{e.preventDefault();const item={id:id||uid(),clientId:cafClient.value,name:cafName.value.trim(),channel:cafChannel.value.trim(),status:cafStatus.value,progress:Number(cafProgress.value),goal:cafGoal.value.trim(),createdAt:c.createdAt||new Date().toISOString()};const i=state.campaigns.findIndex(x=>x.id===item.id);if(i>=0)state.campaigns[i]=item;else state.campaigns.push(item);addActivity('🚀',id?'Campanha atualizada':'Nova campanha',item.name);closeModal('formModal');await saveState()};
  openModal('formModal');
}
function openTaskModal(id){
  const current=id?state.tasks.find(x=>x.id===id):null;
  const t=current||{clientId:state.clients[0]?.id||'',title:'',due:'',priority:'Média',status:'Aberta'};
  document.getElementById('modalTitle').textContent=current?'Editar tarefa':'Nova tarefa';
  document.getElementById('modalBody').innerHTML='<form id="taskForm" class="form-grid"><select id="tfClient">'+clientOptions(t.clientId)+'</select><select id="tfPriority">'+['Alta','Média','Baixa'].map(p=>'<option '+(p===t.priority?'selected':'')+'>'+p+'</option>').join('')+'</select><input class="full" id="tfTitle" required placeholder="O que precisa ser feito?" value="'+esc(t.title)+'"><input id="tfDue" type="date" value="'+esc(t.due||'')+'"><select id="tfStatus">'+['Aberta','Em andamento','Concluída'].map(s=>'<option '+(s===(t.status||'Aberta')?'selected':'')+'>'+s+'</option>').join('')+'</select><div class="full" style="display:flex;justify-content:flex-end;gap:8px"><button type="button" class="btn" onclick="closeModal(\'formModal\')">Cancelar</button><button class="btn primary">'+(current?'Salvar alterações':'Adicionar')+'</button></div></form>';
  document.getElementById('taskForm').onsubmit=async e=>{
    e.preventDefault();
    const status=tfStatus.value;
    const item={
      ...(current||{}),id:current?.id||uid(),clientId:tfClient.value,title:tfTitle.value.trim(),
      due:tfDue.value,priority:tfPriority.value,status,done:status==='Concluída',
      createdAt:current?.createdAt||new Date().toISOString()
    };
    if(current)Object.assign(current,item);else state.tasks.push(item);
    addActivity(current?'✏️':'✅',current?'Tarefa atualizada':'Tarefa criada',item.title);
    closeModal('formModal');await saveState();
  };
  openModal('formModal');
}
async function setTaskStatus(id,status){
  const t=state.tasks.find(x=>x.id===id);if(!t)return;
  if(!['Aberta','Em andamento','Concluída'].includes(status))return;
  const before=t.status||'Aberta';
  t.status=status;t.done=status==='Concluída';
  if(before!==status)addActivity(status==='Concluída'?'✅':status==='Em andamento'?'⚙️':'↩️','Status da tarefa',t.title+' → '+status);
  await saveState();
}
async function toggleTask(id){
  const t=state.tasks.find(x=>x.id===id);if(!t)return;
  await setTaskStatus(id,(t.status||'Aberta')==='Concluída'?'Aberta':'Concluída');
}
async function deleteTask(id){
  const t=state.tasks.find(x=>x.id===id);if(!t||!confirm('Excluir esta tarefa?'))return;
  state.tasks=state.tasks.filter(x=>x.id!==id);
  addActivity('🗑️','Tarefa excluída',t.title);
  await saveState();
}
async function deleteTaskFromDetail(id){
  const t=state.tasks.find(x=>x.id===id);if(!t||!confirm('Excluir esta tarefa?'))return;
  closeModal('formModal');
  await deleteTaskDirect(id,t);
}
async function deleteTaskDirect(id,t){
  state.tasks=state.tasks.filter(x=>x.id!==id);
  addActivity('🗑️','Tarefa excluída',t.title);
  await saveState();
}

function runAgent(agentId,clientId){
  const a=AGENTS.find(x=>x.id===agentId);if(!a)return;
  const cid=clientId||state.clients[0]?.id;if(!cid)return alert('Cadastre um cliente primeiro.');
  const c=state.clients.find(x=>x.id===cid)||state.clients[0];
  document.getElementById('agentModalTitle').textContent=a.icon+' Agente '+a.name+' · '+a.role;
  const context='CLIENTE: '+c.name+'\nSEGMENTO: '+(c.segment||'não informado')+'\nREGIÃO: '+(c.city||'não informada')+'\nSITE: '+(c.site||'não informado')+'\nWHATSAPP: '+(c.whatsapp||'não informado')+'\nOBSERVAÇÕES: '+(c.notes||'nenhuma');
  document.getElementById('agentPrompt').value='Você é o Agente '+a.name+' da WDM Squad, especializado em '+a.role+'. Sua personalidade operacional é: '+(a.persona||'objetivo e profissional')+'.\n\n'+context+'\n\nMISSÃO:\n'+a.prompt+'\n\nEntregue uma resposta prática, priorizada e pronta para execução pela WDM Apps. Não invente dados do cliente; quando precisar de informação pública atual, pesquise e cite as fontes.';
  addActivity(a.icon,'Missão preparada: '+a.name,c.name);
  saveState();
  openModal('agentModal');
}
async function copyPrompt(){const el=document.getElementById('agentPrompt');try{await navigator.clipboard.writeText(el.value);alert('Briefing copiado!')}catch(e){el.select();document.execCommand('copy');alert('Briefing copiado!')}}
function openQuickAction(){
  document.getElementById('modalTitle').textContent='Ação rápida';
  document.getElementById('modalBody').innerHTML='<div class="section-grid"><button class="btn primary" onclick="closeModal(\'formModal\');openClientModal()">🏢 Novo cliente</button><button class="btn primary" onclick="closeModal(\'formModal\');openLeadModal()">🎯 Novo lead</button><button class="btn primary" onclick="closeModal(\'formModal\');openCampaignModal()">🚀 Nova campanha</button><button class="btn primary" onclick="closeModal(\'formModal\');openTaskModal()">✅ Nova tarefa</button><button class="btn primary" onclick="closeModal(\'formModal\');openMissionModal()">⚡ Missão automática</button><button class="btn primary" onclick="closeModal(\'formModal\');runAgent(\'scout\')">🔎 Diagnóstico assistido</button></div>';
  openModal('formModal');
}

(async function init(){
  try{
    await requireAuth();
    const currentUser=await firebaseUser();
    if(!isAllowedAdmin(currentUser))return;
    const sdk=await window.WDM_FIREBASE_READY;
    db=sdk.firestore();
    await loadState();
    const commandInput=document.getElementById('commandObjective'),teamPreview=document.getElementById('commandTeamPreview');
    const updateTeam=()=>{teamPreview.textContent='Equipe: '+SquadCore.selectAgents(commandInput.value,'prospecting').map(id=>AGENTS.find(a=>a.id===id)?.name).join(' · ')+' · Planner';};
    commandInput.addEventListener('input',updateTeam);updateTeam();
    const hash=location.hash.replace('#','');if(pageNames[hash])showView(hash);
  }catch(e){console.error(e);cloudStatus('Erro de acesso','err')}
})();
