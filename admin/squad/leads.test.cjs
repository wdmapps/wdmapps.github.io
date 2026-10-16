const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const core=require('./core.js');
function fixture(){
  const elements=new Map(),storage=new Map(),calls=[];
  const element=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',focus(){},classList:{add(){},remove(){}}});return elements.get(id);};
  const ctx=vm.createContext({crypto:webcrypto,URL,Date,console,AbortController,setTimeout,clearTimeout,SquadCore:core,window:{addEventListener(){}},document:{getElementById:element,querySelectorAll:()=>[]},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},alert(){},confirm:()=>true,remoteRun:null});
  for(const file of ['crm.js','leads.js','squad.js']){let js=fs.readFileSync(__dirname+'/'+file,'utf8');if(file==='squad.js')js=js.slice(0,js.lastIndexOf('(async function init()'));vm.runInContext(js,ctx);}
  ctx.api=async payload=>{calls.push(payload);return {text:payload.agentId==='scout'?'PROBLEMAS OBSERVADOS: contato inacessível.\nO QUE A WDM APPS PODE MELHORAR: corrigir link.':'WHATSAPP INICIAL:\nOlá! Sou William, da WDM Apps. Podemos conversar?\nFOLLOW-UP:\nOlá, podemos conversar?\nPONTOS PARA CONVERSAR:\nContato',sources:[]};};
  const run=s=>vm.runInContext(s,ctx);
  run("state={leads:[],leadCandidates:[],clients:[],activity:[]};renderLeads=()=>{};renderAll=()=>{};saveState=async()=>true;firebaseUser=async()=>({getIdToken:async()=> 'fake'});squadApiCall=async(token,payload)=>api(payload);openModal=()=>{};closeModal=()=>{};");
  return {run,ctx,calls,element,storage};
}
test('WhatsApp copia apenas a mensagem inicial de saídas atuais e antigas',()=>{
  const f=fixture();
  for(const text of ['WHATSAPP INICIAL:\nOlá, empresa!\nFOLLOW-UP:\nRetorno','1) **WHATSAPP INICIAL**\nOlá, empresa!\n2) **FOLLOW-UP**\nRetorno','### WHATSAPP INICIAL:\nOlá, empresa!\n### FOLLOW-UP:\nRetorno']){f.ctx.sample=text;assert.equal(f.run('firstWhatsapp(sample)'),'Olá, empresa!');}
  assert.equal(f.run("firstWhatsapp('Um relatório sem título com e-mail e notas internas')"),'');
});
test('link de WhatsApp aceita um número e recusa e-mail, números misturados e contato desconhecido',()=>{
  const f=fixture();assert.equal(f.run("businessWhatsapp('(11) 99999-0000')"),'https://wa.me/5511999990000');assert.equal(f.run("businessWhatsapp('+55 11 99999-0000')"),'https://wa.me/5511999990000');
  for(const value of ['contato@example.org','11 99999-0000 / 11 99999-1111','a confirmar','1234']){f.ctx.contact=value;assert.equal(f.run('businessWhatsapp(contact)'),'');}
});
test('filtros combinam cidade sem acento, situação do site, status e ordem sem alterar dados',()=>{
  const f=fixture();f.run("items=[{id:'a',company:'Z',city:'São Paulo',siteStatus:'SITE_FRACO',status:'Novo'},{id:'b',company:'A',city:'São Paulo',siteStatus:'SEM_SITE',status:'Contato'},{id:'c',company:'B',city:'Itu',siteStatus:'SITE_FRACO',status:'Novo'}]");
  assert.equal(f.run("filterLeadRecords(items,'sao paulo','SITE_FRACO','Novo','company').map(x=>x.id).join(',')"),'a');assert.equal(f.run("items.map(x=>x.id).join(',')"),'a,b,c');
});
test('diagnóstico de lead aprovado usa o site cadastrado e kit roda Scout antes do Copy',async()=>{
  const f=fixture();f.run("state.leads=[{id:'a',company:'Empresa',website:'https://example.org'}]");await f.run("prepareLeadKit('a','lead')");
  assert.deepEqual(f.calls.map(x=>x.agentId),['scout','copy']);assert.equal(f.calls[0].client.site,'https://example.org');assert.match(f.calls[0].objective,/O QUE A WDM APPS PODE MELHORAR/);assert.equal(f.run('state.leads[0].whatsappDraft'),'Olá! Sou William, da WDM Apps. Podemos conversar?');
});
test('regeneração preserva texto escrito pelo usuário e aprovação conserva diagnóstico e rascunho',async()=>{
  const f=fixture();f.run("state.leadCandidates=[{id:'c',company:'Empresa',city:'Itu',scoutAnalysis:'Diagnóstico com evidências',whatsappDraft:'Minha mensagem revisada',whatsappEditedAt:'2026-10-16'}]");await f.run("generateLeadApproach(state.leadCandidates[0],'candidate')");await f.run("approveLeadCandidate('c')");assert.equal(f.run('state.leadCandidates.length'),0);assert.equal(f.run('state.leads[0].whatsappDraft'),'Minha mensagem revisada');assert.equal(f.run('state.leads[0].scoutAnalysis'),'Diagnóstico com evidências');
});
test('exclusão individual cancela sem efeito e remove somente o registro escolhido com desfazer',async()=>{
  const f=fixture();f.run("state.leads=[{id:'a',company:'A'},{id:'b',company:'B'}];state.leadCandidates=[{id:'c',company:'C'}];openRemoveLeadModal('a','lead')");assert.equal(f.run('state.leads.length'),2);
  await f.element('confirmRemoveLead').onclick();assert.equal(f.run("state.leads.map(x=>x.id).join(',')"),'b');assert.equal(f.run('state.leadCandidates.length'),1);await f.run('undoLeadCleanup()');assert.equal(f.run('state.leads.length'),2);
});
test('URLs públicas antigas não incorporam citações markdown ao endereço',()=>{
  const f=fixture();assert.equal(f.run("safePublicUrl('https://example.org ( [fonte](https://example.org))')"),'https://example.org/');assert.equal(f.run("safePublicUrl('[Site](https://example.org)')"),'https://example.org/');assert.equal(f.run("safePublicUrl('javascript:alert(1)')"),'');
});
test('falha ao salvar o início impede novas chamadas de análise e abordagem',async()=>{
  const f=fixture();f.run("state.leads=[{id:'a',company:'Empresa'}];saveState=async()=>false");await f.run("prepareLeadKit('a','lead')");assert.equal(f.calls.length,0);assert.equal(f.run('state.leads[0].scoutStatus'),'error');
  f.run("state.leads[0].scoutAnalysis='Diagnóstico salvo anteriormente'");await f.run("generateLeadApproach(state.leads[0],'lead')");assert.equal(f.calls.length,0);assert.equal(f.run('state.leads[0].copyStatus'),'error');
});
