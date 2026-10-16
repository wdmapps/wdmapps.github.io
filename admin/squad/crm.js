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
