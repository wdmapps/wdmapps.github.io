'use strict';
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function localDate(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function transitionLead(lead,status){
  if(!['Novo','Contato','Proposta','Ganho','Perdido'].includes(status))return;
  if(lead.status===status)return;
  const now=new Date().toISOString();
  lead.statusHistory=lead.statusHistory||[];
  lead.statusHistory.push({id:uid(),from:lead.status||'Novo',to:status,at:now});
  lead.status=status;lead.updatedAt=now;
  if(status==='Proposta')lead.proposalAt=lead.proposalAt||now;
  if(status==='Ganho'||status==='Perdido'){lead.closedAt=now;lead.nextFollowup='';}
  else lead.closedAt='';
}
function renderCommercial(){
  if(!state)return;
  const leads=state.leads,today=localDate(),open=leads.filter(l=>!['Ganho','Perdido'].includes(l.status));
  const contacted=leads.filter(l=>l.lastContactAt),responded=contacted.filter(l=>l.lastResponseAt),won=leads.filter(l=>l.status==='Ganho'),lost=leads.filter(l=>l.status==='Perdido');
  const metrics=[['Retornos vencidos',open.filter(l=>l.nextFollowup&&l.nextFollowup<today).length,'contatos com data anterior a hoje'],['Contatados',contacted.length,'com contato registrado'],['Responderam',responded.length,contacted.length?Math.round(responded.length/contacted.length*100)+'% dos contatados':'registre os primeiros contatos'],['Conversão',leads.length?Math.round(won.length/leads.length*100)+'%':'—',won.length+' ganhos / '+leads.length+' leads'],['Propostas abertas',money(open.filter(l=>l.status==='Proposta').reduce((s,l)=>s+(Number(l.proposalValue)||0),0)),'valor informado no cadastro'],['Vendas ganhas',money(won.reduce((s,l)=>s+(Number(l.proposalValue)||0),0)),won.length+' oportunidade(s) ganha(s)']];
  const host=document.getElementById('commercialMetrics');if(host)host.innerHTML=metrics.map(([title,value,note])=>'<div class="stat"><span>'+esc(title)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></div>').join('');
  const usage=state.apiUsage||[],tokens=usage.reduce((s,x)=>s+(x.usage?.totalTokens||0),0),known=usage.filter(x=>x.estimatedCostUsd!==null&&x.estimatedCostUsd!==undefined);
  const sources={};for(const lead of leads){const key=lead.origin||'Manual';sources[key]=(sources[key]||0)+1;}
  const reasons={};for(const lead of lost){const key=lead.lostReason||'Não informado (registro anterior)';reasons[key]=(reasons[key]||0)+1;}
  const detail=document.getElementById('commercialSummary');if(detail)detail.innerHTML='<div><b>Origem dos leads</b><p>'+esc(Object.entries(sources).map(([k,v])=>k+': '+v).join(' · ')||'Sem leads')+'</p><b>Motivos de perda</b><p>'+esc(Object.entries(reasons).map(([k,v])=>k+': '+v).join(' · ')||'Nenhuma perda registrada')+'</p></div><div><b>Consumo da IA</b><p>'+usage.length+' chamada(s) registrada(s) · '+tokens.toLocaleString('pt-BR')+' tokens · '+usage.reduce((s,x)=>s+(x.webSearchCalls||0),0)+' pesquisa(s) web</p><p>'+ (known.length?'Estimativa parcial: US$ '+known.reduce((s,x)=>s+x.estimatedCostUsd,0).toFixed(4)+' ('+known.length+'/'+usage.length+' chamadas com tarifa).':'Custo não configurado. Tokens e duração são registrados; chamadas antigas podem não ter telemetria.')+'</p></div>';
  const queue=document.getElementById('contactQueue');if(!queue)return;
  const items=SquadCore.followupQueue(leads,today);
  document.getElementById('contactQueueCount').textContent=items.length+' para revisar';
  queue.innerHTML=items.length?items.slice(0,20).map(l=>'<article class="queue-row"><div><strong>'+esc(l.company)+'</strong><p class="tiny muted">'+esc(l.owner||'Sem responsável')+' · '+esc(l.status)+' · '+(l.nextFollowup?(l.nextFollowup<today?'Atrasado: ':'Hoje: ')+fmtDate(l.nextFollowup):'Sem retorno agendado')+'</p><span class="tiny">Último contato: '+(l.lastContactAt?fmtDate(l.lastContactAt):'ainda não registrado')+'</span></div><div class="row-actions"><button class="btn primary" onclick="openContactModal(\''+l.id+'\')">Registrar contato</button><button class="btn" onclick="openLeadModal(\''+l.id+'\')">Detalhes</button></div></article>').join('')+(items.length>20?'<p class="tiny muted">Mostrando os primeiros 20. Os demais continuam no funil.</p>':''):'<p class="empty">Nenhum retorno pendente. Os próximos contatos aparecem na data agendada.</p>';
}
function openLeadModal(id,desiredStatus=''){
  const l=state.leads.find(x=>x.id===id)||{company:'',contact:'',city:'',website:'',need:'Site / presença digital',reason:'',status:'Novo'};
  document.getElementById('modalTitle').textContent=id?'Detalhes do lead':'Novo lead';
  const field=(label,id,value,type='text',extra='')=>'<label for="'+id+'">'+label+'<input id="'+id+'" type="'+type+'" value="'+esc(value||'')+'" '+extra+'></label>';
  document.getElementById('modalBody').innerHTML='<form id="leadForm" class="form-grid">'+field('Empresa','lfCompany',l.company,'text','required')+field('Contato / WhatsApp','lfContact',l.contact)+field('Cidade','lfCity',l.city)+'<label for="lfStatus">Status<select id="lfStatus">'+['Novo','Contato','Proposta','Ganho','Perdido'].map(s=>'<option '+(s===(desiredStatus||l.status)?'selected':'')+'>'+s+'</option>').join('')+'</select></label>'+field('Site','lfWebsite',l.website,'url')+field('Responsável','lfOwner',l.owner||'William')+field('Próximo retorno','lfFollowup',l.nextFollowup,'date')+field('Valor da proposta (R$)','lfValue',l.proposalValue,'number','min="0" step="0.01"')+'<label class="full">Motivo da perda (obrigatório ao marcar Perdido)<input id="lfLost" value="'+esc(l.lostReason||'')+'"></label><label class="full">Necessidade<textarea id="lfNeed">'+esc(l.need||'')+'</textarea></label><label class="full">Evidências e observações<textarea id="lfReason">'+esc(l.reason||'')+'</textarea></label>'+provenanceHtml(l)+'<div class="full row-actions"><button type="button" class="btn" onclick="closeModal(\'formModal\')">Cancelar</button><button class="btn primary">Salvar lead</button></div></form>'+
    (l.contactHistory?.length?'<h3>Histórico de contatos</h3>'+[...l.contactHistory].sort((a,b)=>String(b.at).localeCompare(String(a.at))).map(c=>'<article class="execution-plan"><b>'+esc(c.channel)+' · '+esc(c.outcome)+'</b><p>'+esc(c.note)+'</p><small>'+esc(new Date(c.at).toLocaleString('pt-BR'))+'</small></article>').join(''):'');
  const form=document.getElementById('leadForm');
  form.onsubmit=async e=>{
    e.preventDefault();const val=id=>document.getElementById(id).value.trim(),status=val('lfStatus');
    if(status==='Perdido'&&!val('lfLost'))return document.getElementById('lfLost').focus();
    const company=val('lfCompany'),city=val('lfCity');
    if(state.leads.some(x=>x.id!==id&&SquadCore.leadKey(x)===SquadCore.leadKey({company,city})))return alert('Essa empresa já está no funil.');
    const item={...l,id:id||uid(),company,city,contact:val('lfContact'),website:safePublicUrl(val('lfWebsite')),owner:val('lfOwner'),nextFollowup:val('lfFollowup'),proposalValue:Number(val('lfValue'))||0,lostReason:val('lfLost'),need:val('lfNeed'),reason:val('lfReason'),origin:l.origin||'Manual',createdAt:l.createdAt||new Date().toISOString()};
    transitionLead(item,status);if(['Ganho','Perdido'].includes(status))item.nextFollowup='';
    const at=state.leads.findIndex(x=>x.id===item.id);if(at>=0)Object.assign(state.leads[at],item);else state.leads.push(item);
    addActivity('🎯',id?'Lead atualizado':'Novo lead',item.company);closeModal('formModal');await saveState();
  };
  const statusInput=document.getElementById('lfStatus'),lostInput=document.getElementById('lfLost');statusInput.onchange=()=>{lostInput.required=statusInput.value==='Perdido';};statusInput.onchange();openModal('formModal');
}
async function changeLeadStatus(id,status){
  const l=state.leads.find(x=>x.id===id);if(!l)return;
  if(status==='Perdido'&&!l.lostReason){renderLeads();openLeadModal(id,status);return;}
  transitionLead(l,status);addActivity('🔁','Funil atualizado',l.company+' → '+status);await saveState();
}
function openContactModal(id){
  const l=state.leads.find(x=>x.id===id);if(!l)return;
  document.getElementById('modalTitle').textContent='Registrar contato · '+l.company;
  const next=new Date();next.setDate(next.getDate()+3);const nextDate=next.getFullYear()+'-'+String(next.getMonth()+1).padStart(2,'0')+'-'+String(next.getDate()).padStart(2,'0');
  document.getElementById('modalBody').innerHTML='<form id="contactForm" class="form-grid"><label for="contactChannel">Canal<select id="contactChannel"><option>WhatsApp</option><option>E-mail</option><option>Telefone</option><option>Instagram</option><option>Reunião</option><option>Outro</option></select></label><label for="contactOutcome">Resultado<select id="contactOutcome"><option>Sem resposta</option><option>Respondeu</option><option>Reunião agendada</option><option>Proposta solicitada</option><option>Sem interesse</option></select></label><label for="contactNext">Próximo retorno<input id="contactNext" type="date" value="'+nextDate+'"></label><label for="contactOwner">Responsável<input id="contactOwner" value="'+esc(l.owner||'William')+'" required></label><label class="full" for="contactNote">O que aconteceu?<textarea id="contactNote" required maxlength="3000"></textarea></label><p class="tiny muted full">Registre um contato que você já realizou. Este formulário não envia mensagens.</p><div class="full row-actions"><button class="btn" type="button" onclick="closeModal(\'formModal\')">Cancelar</button><button class="btn primary">Salvar contato</button></div></form>';
  document.getElementById('contactForm').onsubmit=async e=>{
    e.preventDefault();const val=id=>document.getElementById(id).value.trim(),now=new Date().toISOString();
    l.contactHistory=l.contactHistory||[];l.contactHistory.push({id:uid(),at:now,channel:val('contactChannel'),outcome:val('contactOutcome'),note:val('contactNote')});
    l.lastContactAt=now;l.firstContactAt=l.firstContactAt||now;if(val('contactOutcome')!=='Sem resposta')l.lastResponseAt=now;
    l.owner=val('contactOwner');l.nextFollowup=['Ganho','Perdido'].includes(l.status)?'':val('contactNext');
    if(l.status==='Novo')transitionLead(l,'Contato');
    addActivity('📞','Contato registrado',l.company+' · '+val('contactOutcome'));closeModal('formModal');await saveState();
  };openModal('formModal');
}
function provenanceHtml(record){
  const sources=record.sources||record.scoutTelemetry?.sources||[];
  const source=safePublicUrl(record.sourceUrl),checked=record.checkedAt||record.scoutAt;
  return '<div class="full execution-plan"><b>Origem e verificação</b><p>'+esc(record.origin||record.query||'Cadastro manual')+(checked?' · '+esc(new Date(checked).toLocaleString('pt-BR')):' · sem data de verificação')+'</p>'+(record.siteEvidence?'<p>'+esc(record.siteEvidence)+'</p>':'')+(source?'<a class="link" href="'+esc(source)+'" target="_blank" rel="noopener">Fonte da empresa</a>':'')+sources.map(s=>{const url=safePublicUrl(s.url);return url?' <a class="link" href="'+esc(url)+'" target="_blank" rel="noopener">'+esc(s.title||'Fonte consultada')+'</a>':'';}).join('')+'</div>';
}
function telemetryHtml(record){
  const sources=(record.sources||[]).map(s=>{const url=safePublicUrl(s.url);return url?'<li><a class="link" target="_blank" rel="noopener" href="'+esc(url)+'">'+esc(s.title||url)+'</a></li>':'';}).join('');
  return '<div class="tiny muted telemetry">'+esc(record.model||'Modelo não registrado')+' · '+(record.usedWeb?'Pesquisa web realizada':'Sem pesquisa web registrada')+(record.usage?' · '+Number(record.usage.totalTokens||0).toLocaleString('pt-BR')+' tokens':'')+(record.durationMs?' · '+Math.round(record.durationMs/1000)+'s':'')+(record.estimatedCostUsd!=null?' · estimativa US$ '+Number(record.estimatedCostUsd).toFixed(4):'')+(sources?'<ul>'+sources+'</ul>':'')+'</div>';
}

const LEAD_CLEANUP_KEY='wdm_squad_last_lead_cleanup';
let leadCleanupBusy=false;
function leadOperationsRunning(){
  return radarSearchInFlight||state.radarLeadSearch?.status==='running'&&remoteRun?.id?.startsWith('radar-')&&remoteRun.expiresAt>Date.now()||[...state.leads,...state.leadCandidates].some(record=>['scout','copy'].some(kind=>record[kind+'Status']==='running'&&Date.now()-(record[kind+'StartedAt']||0)<240000));
}
function readLeadCleanup(){
  const backup=safeParse(localStorage.getItem(LEAD_CLEANUP_KEY));
  return backup?.version===1&&Array.isArray(backup.leads)&&Array.isArray(backup.leadCandidates)?backup:null;
}
function renderLeadCleanup(){
  const button=document.getElementById('clearAllLeadsBtn'),busy=leadCleanupBusy||leadOperationsRunning();
  if(button){button.disabled=busy||!state.leads.length&&!state.leadCandidates.length;button.title=busy?'Aguarde a pesquisa ou análise terminar.':'Limpar todos os leads e sugestões, incluindo os que estão fora do filtro.';}
  const panel=document.getElementById('leadCleanupUndo'),backup=readLeadCleanup();
  if(!panel)return;
  panel.hidden=!backup;
  if(backup)panel.innerHTML='<div><strong>Última limpeza: '+backup.leads.length+' lead(s) e '+backup.leadCandidates.length+' sugestão(ões).</strong><p class="tiny muted">Você pode desfazer esta limpeza neste navegador, inclusive após recarregar a página.</p></div><button class="btn" onclick="undoLeadCleanup()" '+(busy?'disabled':'')+'>↶ Desfazer última limpeza</button>';
}
function openClearLeadsModal(){
  if(leadCleanupBusy)return;
  if(leadOperationsRunning())return alert('Aguarde a pesquisa ou análise terminar antes de limpar os leads.');
  const selection={leads:state.leads.map(x=>x.id),leadCandidates:state.leadCandidates.map(x=>x.id)};
  if(!selection.leads.length&&!selection.leadCandidates.length)return;
  document.getElementById('modalTitle').textContent='Limpar todos os leads';
  document.getElementById('modalBody').innerHTML='<p>Remover <strong>'+selection.leads.length+' lead(s) do funil</strong> e <strong>'+selection.leadCandidates.length+' sugestão(ões) do Radar</strong>?</p><p class="tiny muted">Inclui todos os status, mesmo com filtros ativos. A última limpeza poderá ser desfeita neste navegador. Uma nova limpeza substituirá essa cópia.</p><div class="row-actions" style="justify-content:flex-end"><button class="btn" onclick="closeModal(\'formModal\')">Cancelar</button><button class="btn danger" id="confirmClearAllLeads">Remover todos</button></div>';
  document.getElementById('confirmClearAllLeads').onclick=()=>clearAllLeads(selection);
  openModal('formModal');
}
async function clearAllLeads(selection){
  if(leadCleanupBusy)return;
  if(leadOperationsRunning())return alert('Aguarde a pesquisa ou análise terminar antes de limpar os leads.');
  const leadIds=new Set(selection.leads),candidateIds=new Set(selection.leadCandidates);
  const backup={version:1,id:uid(),removedAt:new Date().toISOString(),leads:SquadCore.clone(state.leads.filter(x=>leadIds.has(x.id))),leadCandidates:SquadCore.clone(state.leadCandidates.filter(x=>candidateIds.has(x.id)))};
  if(!backup.leads.length&&!backup.leadCandidates.length){closeModal('formModal');return;}
  // Write the recovery copy before changing either the cache or the cloud.
  try{localStorage.setItem(LEAD_CLEANUP_KEY,JSON.stringify(backup));}
  catch(e){alert('Não foi possível guardar a cópia para desfazer. Libere espaço neste navegador e tente novamente. Nenhum lead foi removido.');return;}
  leadCleanupBusy=true;
  try{
    state.leads=state.leads.filter(x=>!leadIds.has(x.id));
    state.leadCandidates=state.leadCandidates.filter(x=>!candidateIds.has(x.id));
    addActivity('🗑️','Leads e sugestões removidos',backup.leads.length+' lead(s) e '+backup.leadCandidates.length+' sugestão(ões). Cópia para desfazer neste navegador.');
    closeModal('formModal');await saveState();
  }finally{leadCleanupBusy=false;renderLeads();}
}
async function undoLeadCleanup(){
  if(leadCleanupBusy)return;
  if(leadOperationsRunning())return alert('Aguarde a pesquisa ou análise terminar antes de restaurar os leads.');
  const backup=readLeadCleanup();if(!backup)return;
  leadCleanupBusy=true;
  try{
    let restored=0;
    for(const key of ['leads','leadCandidates']){
      const ids=new Set(state[key].map(x=>x.id)),companies=new Set(state[key].map(SquadCore.leadKey));
      for(const item of backup[key]){
        const company=SquadCore.leadKey(item);
        if(ids.has(item.id)||companies.has(company))continue;
        state[key].push(SquadCore.clone(item));ids.add(item.id);companies.add(company);restored++;
      }
    }
    addActivity('↶','Limpeza de leads desfeita',restored+' registro(s) restaurado(s).');
    if(await saveState()&&readLeadCleanup()?.id===backup.id)localStorage.removeItem(LEAD_CLEANUP_KEY);
  }finally{leadCleanupBusy=false;renderLeads();}
}
