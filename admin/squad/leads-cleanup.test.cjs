const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),core=require('./core.js');
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(options={}){
  const storage=options.storage||new Map(),alerts=[],saves=[];
  const state=clone(options.state||{leads:[{id:'a',company:'Loja A',city:'Itu',status:'Ganho',contactHistory:[{id:'contact',note:'Histórico preservado'}]},{id:'b',company:'Loja B',city:'Salto',status:'Novo'}],leadCandidates:[{id:'c',company:'Loja C',city:'Itu'}],clients:[{id:'client'}],missions:[{id:'mission'}],tasks:[{id:'task'}],activity:[]});
  const ctx=vm.createContext({state,Date,SquadCore:core,radarSearchInFlight:false,remoteRun:null,uid:()=> 'cleanup-test',safeParse:x=>{try{return JSON.parse(x)}catch{return null}},alert:msg=>alerts.push(msg),closeModal(){},renderLeads(){},addActivity:(icon,title,detail)=>state.activity.push({icon,title,detail}),saveState:async()=>{saves.push(clone(state));return options.saveResult!==false;},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(options.storageFails)throw Error('Quota cheia');storage.set(k,v)},removeItem:k=>storage.delete(k)}});
  vm.runInContext(fs.readFileSync(__dirname+'/crm.js','utf8'),ctx);
  return {ctx,state,storage,alerts,saves,run:code=>vm.runInContext(code,ctx),selection:()=>({leads:state.leads.map(x=>x.id),leadCandidates:state.leadCandidates.map(x=>x.id)})};
}
test('limpeza remove todos os status e sugestões, preservando os demais módulos',async()=>{
  const f=fixture();await f.run("clearAllLeads({leads:['a','b'],leadCandidates:['c']})");
  assert.equal(f.state.leads.length,0);assert.equal(f.state.leadCandidates.length,0);assert.equal(f.state.clients.length,1);assert.equal(f.state.missions.length,1);assert.equal(f.state.tasks.length,1);
  const backup=JSON.parse(f.storage.get('wdm_squad_last_lead_cleanup'));assert.equal(backup.leads.length,2);assert.equal(backup.leadCandidates.length,1);assert.equal(backup.leads[0].contactHistory[0].note,'Histórico preservado');assert.equal(f.saves.length,1);
});
test('cópia para desfazer é gravada antes de qualquer remoção',async()=>{
  const f=fixture({storageFails:true});await f.run("clearAllLeads({leads:['a','b'],leadCandidates:['c']})");assert.equal(f.state.leads.length,2);assert.equal(f.state.leadCandidates.length,1);assert.equal(f.saves.length,0);assert.match(f.alerts[0],/Nenhum lead foi removido/);
});
test('desfazer funciona após reabrir e restaura o histórico completo',async()=>{
  const f=fixture();await f.run("clearAllLeads({leads:['a','b'],leadCandidates:['c']})");const reopened=fixture({state:f.state,storage:f.storage});await reopened.run('undoLeadCleanup()');assert.equal(reopened.state.leads.length,2);assert.equal(reopened.state.leads[0].status,'Ganho');assert.equal(reopened.state.leads[0].contactHistory.length,1);assert.equal(reopened.state.leadCandidates.length,1);assert.equal(reopened.storage.has('wdm_squad_last_lead_cleanup'),false);
});
test('desfazer preserva edições e novos registros sem duplicar empresas',async()=>{
  const f=fixture();await f.run("clearAllLeads({leads:['a','b'],leadCandidates:['c']})");f.state.leads.push({id:'new-a',company:'Loja A',city:'Itu',status:'Contato'},{id:'new-d',company:'Loja D',city:'Itu'});await f.run('undoLeadCleanup()');assert.equal(f.state.leads.length,3);assert.equal(f.state.leads.find(x=>x.id==='new-a').status,'Contato');assert.equal(f.state.leads.some(x=>x.id==='a'),false);
});
test('confirmação não remove registros adicionados depois de abrir o diálogo',async()=>{
  const f=fixture();f.state.leads.push({id:'new-d',company:'Loja D'});await f.run("clearAllLeads({leads:['a','b'],leadCandidates:['c']})");assert.deepEqual(f.state.leads.map(x=>x.id),['new-d']);
});
test('pesquisa em andamento bloqueia a limpeza e falha na nuvem conserva recuperação',async()=>{
  const busy=fixture();busy.ctx.radarSearchInFlight=true;await busy.run("clearAllLeads({leads:['a','b'],leadCandidates:['c']})");assert.equal(busy.state.leads.length,2);assert.equal(busy.saves.length,0);
  const offline=fixture({saveResult:false});await offline.run("clearAllLeads({leads:['a','b'],leadCandidates:['c']})");assert.equal(offline.state.leads.length,0);assert.equal(offline.storage.has('wdm_squad_last_lead_cleanup'),true);await offline.run('undoLeadCleanup()');assert.equal(offline.state.leads.length,2);assert.equal(offline.storage.has('wdm_squad_last_lead_cleanup'),true);
});
