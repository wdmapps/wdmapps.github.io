'use strict';
// View preferences and unsaved text stay separate from synchronized business records.
const leadWorkspace={tab:'found',selected:'',drafts:new Map()};
function leadRecord(kind,id){return (kind==='candidate'?state.leadCandidates:state.leads).find(x=>x.id===id)}
function leadToken(kind,record){return kind+':'+record.id}
function leadSiteLabel(record){
  return ({SEM_SITE:'Site não encontrado',SITE_FRACO:'Site com sinais de melhoria',COM_SITE:'Com site'})[record.siteStatus]||'Site a confirmar';
}
function firstWhatsapp(text){
  const value=String(text||'').trim();
  const start=value.match(/(?:^|\n)\s*(?:#{1,4}\s*)?(?:\d+[).:]\s*)?\**WHATSAPP(?:\s+INICIAL)?\**\s*[:–—-]?\s*/i);
  if(!start)return ''; // Older free-form output must be reviewed, never copy the whole sales kit by accident.
  return value.slice(start.index+start[0].length).split(/\n\s*(?:#{1,4}\s*)?(?:\d+[).:]\s*)?\**(?:FOLLOW[ -]?UP|ASSUNTO|E[ -]?MAIL|PONTOS|3 PONTOS)/i)[0].trim().replace(/^\*\*\s*|\s*\*\*$/g,'');
}
function businessWhatsapp(contact){
  const raw=String(contact||'').trim();
  const link=raw.match(/^https:\/\/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)(\d{10,15})(?:[?&].*)?$/i);
  if(link)return 'https://wa.me/'+link[1];
  if(!/^(?:(?:whats?app|tel(?:efone)?|contato)\s*:?\s*)?\+?[\d\s().-]+$/i.test(raw))return '';
  let number=raw.replace(/\D/g,'');
  if(number.length===10||number.length===11)number='55'+number;
  return /^55\d{10,11}$/.test(number)?'https://wa.me/'+number:'';
}
function leadDraft(kind,record){
  const key=leadToken(kind,record);
  return leadWorkspace.drafts.has(key)?leadWorkspace.drafts.get(key):record.whatsappDraft??firstWhatsapp(record.approachText);
}
function filterLeadRecords(items,query,site,status,sort){
  const fold=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const q=fold(query);
  return items.filter(r=>(site==='all'||(r.siteStatus||'NAO_CONFIRMADO')===site)&&(status==='all'||r.status===status)&&fold([r.company,r.city,r.contact,r.need,r.reason].join(' ')).includes(q))
    .sort((a,b)=>sort==='company'?String(a.company).localeCompare(String(b.company),'pt-BR'):sort==='recent'?String(b.createdAt||'').localeCompare(String(a.createdAt||'')):(Number(b.leadScore)||calculateLeadScore(b))-(Number(a.leadScore)||calculateLeadScore(a)));
}
function setLeadTab(tab){
  if(!['found','funnel','returns'].includes(tab))return;
  leadWorkspace.tab=tab;leadWorkspace.selected='';renderLeads();
}
function renderLeadWorkspace(){
  const host=document.getElementById('leadWorkspace');if(!host)return;
  const queue=SquadCore.followupQueue(state.leads,localDate());
  const counts={found:state.leadCandidates.length,funnel:state.leads.length,returns:queue.length};
  const ready=state.leads.filter(x=>x.approachText||x.whatsappDraft).length;
  document.getElementById('leadOverview').innerHTML=[['Encontradas',counts.found,'aguardando sua revisão'],['No funil',counts.funnel,'empresas aprovadas'],['Com abordagem',ready,'no seu funil'],['Retornos',counts.returns,'vencidos, hoje ou sem data']].map(([label,count,note])=>'<div class="lead-stat"><span>'+label+'</span><strong>'+count+'</strong><small>'+note+'</small></div>').join('');
  document.querySelectorAll('[data-lead-tab]').forEach(button=>{const key=button.dataset.leadTab;button.setAttribute('aria-pressed',String(key===leadWorkspace.tab));button.querySelector('span').textContent=counts[key];});
  const found=leadWorkspace.tab==='found',kind=found?'candidate':'lead';
  const status=document.getElementById('leadFilter');status.disabled=found;
  const source=found?state.leadCandidates:leadWorkspace.tab==='returns'?queue:state.leads;
  const list=filterLeadRecords(source,document.getElementById('leadSearch').value,document.getElementById('leadSiteFilter').value,found?'all':status.value,document.getElementById('leadSort').value);
  document.getElementById('leadCount').textContent=list.length+' de '+source.length+' empresa(s)';
  const stored=state.radarLeadSearch||{},running=stored.status==='running'&&(radarSearchInFlight||remoteRun?.id?.startsWith('radar-')&&remoteRun.expiresAt>Date.now());
  const search=stored.status==='running'&&!running?{...stored,status:'paused',message:'Pesquisa anterior pausada. As sugestões salvas foram preservadas.'}:stored;
  const searchBtn=document.getElementById('radarSearchBtn');searchBtn.disabled=!!running;searchBtn.textContent=running?'⏳ Radar pesquisando...':'📡 Buscar empresas';
  document.getElementById('radarLeadStatus').textContent=search.message||'Busque empresas sem site ou com problemas observáveis no site. Revise as fontes antes de abordar.';
  if(!list.some(r=>leadToken(kind,r)===leadWorkspace.selected))leadWorkspace.selected=list[0]?leadToken(kind,list[0]):'';
  const focus=document.activeElement,editing=focus?.id==='leadWhatsappText',selection=editing?[focus.selectionStart,focus.selectionEnd]:null;
  host.innerHTML=(running?radarLoadingHtml(search):'')+(list.length?'<div class="lead-work-grid"><div class="lead-list" aria-label="Empresas">'+list.map((r,i)=>{
    const selected=leadToken(kind,r)===leadWorkspace.selected,score=Number(r.leadScore)||calculateLeadScore(r);
    return '<button class="lead-list-item" data-lead-index="'+i+'" aria-pressed="'+selected+'"><span class="lead-list-heading"><strong>'+esc(r.company)+'</strong><span class="badge">'+score+'/100</span></span><span>'+esc(r.city||'Cidade a confirmar')+'</span><span class="tiny">'+esc(leadSiteLabel(r))+' · '+esc(found?'Para revisar':r.status||'Novo')+'</span><span class="tiny lead-progress">'+(r.scoutAnalysis?'✓ Diagnóstico':'○ Diagnóstico')+' · '+(r.approachText||r.whatsappDraft?'✓ Abordagem':'○ Abordagem')+'</span></button>';
  }).join('')+'</div><article class="lead-detail" id="leadDetail" tabindex="-1"></article></div>':'<div class="empty">'+(source.length?'Nenhuma empresa corresponde aos filtros.':'Nenhuma empresa nesta etapa.')+'<br><button class="btn" id="resetLeadFilters">Limpar filtros</button></div>');
  host.querySelectorAll('[data-lead-index]').forEach(button=>button.onclick=()=>{leadWorkspace.selected=leadToken(kind,list[Number(button.dataset.leadIndex)]);renderLeadWorkspace();document.getElementById('leadDetail')?.scrollIntoView({block:'start',behavior:'smooth'});document.getElementById('leadDetail')?.focus({preventScroll:true});});
  const reset=document.getElementById('resetLeadFilters');if(reset)reset.onclick=()=>{for(const [id,value] of [['leadSearch',''],['leadSiteFilter','all'],['leadFilter','all']])document.getElementById(id).value=value;renderLeads();};
  const record=list.find(r=>leadToken(kind,r)===leadWorkspace.selected);if(record)renderLeadDetail(record,kind);
  if(editing&&document.getElementById('leadWhatsappText')){const text=document.getElementById('leadWhatsappText');text.focus({preventScroll:true});text.setSelectionRange(...selection);}
  syncRadarLoadingTimer(search);
}
function renderLeadDetail(record,kind){
  const host=document.getElementById('leadDetail'),candidate=kind==='candidate';
  const link=(url,label)=>{const clean=safePublicUrl(url);return clean?'<a class="btn" target="_blank" rel="noopener noreferrer" href="'+esc(clean)+'">'+label+' ↗</a>':'';};
  const site=safePublicUrl(record.site||record.website),busy=['scout','copy'].some(key=>record[key+'Status']==='running'&&Date.now()-(record[key+'StartedAt']||0)<240000);
  host.innerHTML='<div class="lead-detail-head"><div><div class="eyebrow">'+(candidate?'Revisão da empresa':'Meu funil · '+esc(record.status||'Novo'))+'</div><h2>'+esc(record.company)+'</h2><p class="tiny muted">'+esc(record.city||'Cidade a confirmar')+' · '+esc(record.contact||'Contato público ainda não encontrado')+'</p>'+(!candidate?'<p class="tiny muted">Responsável: '+esc(record.owner||'Não definido')+' · Retorno: '+(record.nextFollowup?fmtDate(record.nextFollowup):'sem data')+'</p>':'')+'</div><div class="row-actions"><button class="btn" id="editLeadEvidence">Corrigir dados</button><button class="btn danger" id="removeLeadRecord">Excluir individual</button></div></div>'+
    '<section class="lead-step"><h3><span>1</span> Site e evidências</h3><b>'+esc(leadSiteLabel(record))+'</b><p>'+esc(record.siteEvidence||'Não há evidência de site registrada. Faça o diagnóstico antes de concluir.')+'</p>'+(site?'<p class="tiny lead-url">'+esc(site)+'</p>':'<p class="tiny muted">Não encontrar um site na busca não comprova que ele não exista.</p>')+'<div class="row-actions">'+link(site,'Ver site da empresa')+link(record.sourceUrl,'Ver fonte')+link(record.socialUrl,'Rede social')+'</div>'+provenanceHtml(record)+'</section>'+
    '<section class="lead-step"><h3><span>2</span> Diagnóstico e melhorias da WDM Apps</h3><p class="tiny muted">Oportunidade apontada na busca: '+esc(record.need||'Avaliar presença digital')+'</p>'+(record.scoutAnalysis?'<div class="lead-report">'+esc(record.scoutAnalysis)+'</div>':'<p>Gere o diagnóstico para ver os problemas observados, as evidências e o que podemos entregar para esta empresa.</p>')+(record.scoutAt?'<p class="tiny muted">Diagnóstico de '+esc(new Date(record.scoutAt).toLocaleString('pt-BR'))+'</p>':'')+'<div class="row-actions"><button class="btn" id="analyzeLeadRecord" '+(busy?'disabled':'')+'>'+(busy?'Agente trabalhando...':record.scoutAnalysis?'Atualizar diagnóstico':'Analisar empresa')+'</button>'+(record.scoutAnalysis?'<button class="btn" id="copyLeadReport">Copiar diagnóstico</button>':'')+'</div></section>'+
    '<section class="lead-step"><h3><span>3</span> Abordagem para o WhatsApp</h3><p class="tiny muted">Revise o texto e o número. Você decide quando enviar.</p><label for="leadWhatsappText">Mensagem inicial</label><textarea id="leadWhatsappText" rows="6" placeholder="Gere a abordagem ou escreva sua mensagem aqui.">'+esc(leadDraft(kind,record))+'</textarea><p class="tiny muted" id="leadDraftStatus">Alterações no texto precisam ser salvas para aparecer em outro aparelho.</p><div class="row-actions"><button class="btn primary" id="generateLeadKit" '+(busy?'disabled':'')+'>'+(busy?'Preparando...':record.approachText?'Refazer abordagem':'Gerar diagnóstico e abordagem')+'</button><button class="btn" id="saveLeadWhatsapp">Salvar texto</button><button class="btn" id="copyLeadWhatsapp">Copiar WhatsApp</button><a class="btn" id="openLeadWhatsapp" target="_blank" rel="noopener noreferrer" hidden>Abrir WhatsApp ↗</a></div><p class="tiny muted" id="leadWhatsappHint"></p>'+(record.approachText?'<details class="lead-extra"><summary>Ver material completo: mensagem e retorno</summary><div class="lead-report">'+esc(record.approachText)+'</div></details>':'')+'</section>'+
    (record.scoutError||record.copyError?'<p class="mission-error" role="alert">'+esc(record.scoutError||record.copyError)+'</p>':'')+
    '<div class="lead-final-actions row-actions">'+(candidate?'<button class="btn primary" id="approveLeadRecord" '+(busy?'disabled':'')+'>Aprovar e adicionar ao funil</button>':'<button class="btn primary" id="contactLeadRecord">Registrar contato</button><button class="btn" id="editLeadRecord">Editar cadastro / retorno</button><button class="btn" id="convertLeadRecord">Virar cliente</button>')+'</div>';
  const text=document.getElementById('leadWhatsappText');
  if(record.approachText&&firstWhatsapp(record.approachText)){
    const button=document.createElement('button');button.className='btn';button.textContent='Usar sugestão gerada';
    button.onclick=()=>{text.value=firstWhatsapp(record.approachText);text.oninput();};
    document.getElementById('saveLeadWhatsapp').before(button);
  }
  const updateLink=()=>{
    const base=businessWhatsapp(record.contact),value=text.value.trim(),anchor=document.getElementById('openLeadWhatsapp');
    anchor.hidden=!base||!value;if(base&&value)anchor.href=base+'?text='+encodeURIComponent(value);else anchor.removeAttribute('href');
    document.getElementById('leadWhatsappHint').textContent=!base?'Número ausente ou ambíguo. Confira o contato antes de abrir o WhatsApp.':!value?'Prepare uma mensagem para abrir a conversa.':'O WhatsApp abre com o texto preenchido; o envio depende de você. O número público pode precisar de confirmação.';
  };
  text.oninput=()=>{leadWorkspace.drafts.set(leadToken(kind,record),text.value);document.getElementById('leadDraftStatus').textContent='Texto editado. Clique em Salvar texto para guardar.';updateLink();};updateLink();
  document.getElementById('removeLeadRecord').onclick=()=>openRemoveLeadModal(record.id,kind);
  document.getElementById('editLeadEvidence').onclick=()=>openLeadEvidenceModal(record.id,kind);
  document.getElementById('analyzeLeadRecord').onclick=()=>analyzeLeadRecord(record.id,kind);
  document.getElementById('generateLeadKit').onclick=()=>prepareLeadKit(record.id,kind);
  document.getElementById('saveLeadWhatsapp').onclick=async()=>{const current=leadRecord(kind,record.id);if(!current)return;current.whatsappDraft=text.value.trim();current.whatsappEditedAt=new Date().toISOString();leadWorkspace.drafts.set(leadToken(kind,current),current.whatsappDraft);const ok=await saveState();const note=document.getElementById('leadDraftStatus');if(note)note.textContent=ok?'Texto salvo.':'Texto guardado neste navegador; confira o aviso de sincronização.';};
  document.getElementById('copyLeadWhatsapp').onclick=()=>copyTextValue(text.value.trim());
  if(record.scoutAnalysis)document.getElementById('copyLeadReport').onclick=()=>copyTextValue(record.scoutAnalysis);
  if(candidate)document.getElementById('approveLeadRecord').onclick=async()=>{
    if(leadWorkspace.drafts.has(leadToken(kind,record))){record.whatsappDraft=text.value.trim();record.whatsappEditedAt=new Date().toISOString();}
    await approveLeadCandidate(record.id);
    const approved=state.leads.find(x=>SquadCore.leadKey(x)===SquadCore.leadKey(record));
    leadWorkspace.tab='funnel';leadWorkspace.selected=approved?leadToken('lead',approved):'';renderLeads();
  };
  else{document.getElementById('contactLeadRecord').onclick=()=>openContactModal(record.id);document.getElementById('editLeadRecord').onclick=()=>openLeadModal(record.id);document.getElementById('convertLeadRecord').onclick=()=>convertLead(record.id);}
}
function openLeadEvidenceModal(id,kind){
  const record=leadRecord(kind,id);if(!record)return;
  const field=(label,key,value)=>'<label>'+label+'<input id="le'+key+'" value="'+esc(value||'')+'"></label>';
  document.getElementById('modalTitle').textContent='Corrigir dados · '+record.company;
  document.getElementById('modalBody').innerHTML='<form id="leadEvidenceForm" class="form-grid">'+field('Empresa','Company',record.company)+field('Cidade','City',record.city)+field('Contato / WhatsApp com DDD','Contact',record.contact)+field('Site oficial','Site',record.site||record.website)+'<label>Situação do site<select id="leStatus">'+[['NAO_CONFIRMADO','A confirmar'],['SEM_SITE','Site não encontrado'],['SITE_FRACO','Com sinais de melhoria'],['COM_SITE','Com site']].map(([value,label])=>'<option value="'+value+'" '+(record.siteStatus===value?'selected':'')+'>'+label+'</option>').join('')+'</select></label><label class="full">Evidências<textarea id="leEvidence">'+esc(record.siteEvidence||'')+'</textarea></label><div class="row-actions full"><button class="btn" type="button" onclick="closeModal(\'formModal\')">Cancelar</button><button class="btn primary">Salvar correções</button></div></form>';
  document.getElementById('leCompany').required=true;
  document.getElementById('leadEvidenceForm').onsubmit=async event=>{
    event.preventDefault();const current=leadRecord(kind,id);if(!current)return closeModal('formModal');
    const val=key=>document.getElementById('le'+key).value.trim(),company=val('Company'),city=val('City');
    if(!company)return;
    if([...state.leads,...state.leadCandidates].some(x=>x!==current&&SquadCore.leadKey(x)===SquadCore.leadKey({company,city})))return alert('Essa empresa já existe.');
    const website=val('Site'),url=safePublicUrl(website);if(website&&!url)return alert('Informe um site HTTP ou HTTPS válido.');
    if(url&&val('Status')==='SEM_SITE')return alert('Há um site informado. Escolha Com site, Com sinais de melhoria ou A confirmar.');
    Object.assign(current,{company,city,contact:val('Contact'),siteStatus:val('Status'),siteEvidence:val('Evidence'),updatedAt:new Date().toISOString()});
    if(kind==='candidate')current.site=url;else current.website=url;
    addActivity('✏️','Dados do lead corrigidos',company);closeModal('formModal');await saveState();
  };openModal('formModal');
}
async function prepareLeadKit(id,kind){
  const record=leadRecord(kind,id);if(!record)return;
  if(!record.scoutAnalysis)await analyzeLeadRecord(id,kind);
  if(record.scoutAnalysis&&record.scoutStatus!=='error')await generateLeadApproach(record,kind);
}
function openRemoveLeadModal(id,kind){
  if(leadOperationsRunning())return alert('Aguarde a pesquisa ou análise terminar antes de excluir.');
  const record=leadRecord(kind,id);if(!record)return;
  document.getElementById('modalTitle').textContent='Excluir empresa';
  document.getElementById('modalBody').innerHTML='<p>Excluir <strong>'+esc(record.company)+'</strong> '+(kind==='candidate'?'das sugestões encontradas':'do funil')+'?</p><p class="tiny muted">Você poderá desfazer neste navegador. Esta exclusão substituirá a cópia da última limpeza.</p><div class="row-actions"><button class="btn" onclick="closeModal(\'formModal\')">Cancelar</button><button class="btn danger" id="confirmRemoveLead">Excluir esta empresa</button></div>';
  document.getElementById('confirmRemoveLead').onclick=()=>clearAllLeads({leads:kind==='lead'?[id]:[],leadCandidates:kind==='candidate'?[id]:[]});openModal('formModal');
}
