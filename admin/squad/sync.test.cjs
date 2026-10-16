const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),core=require('./core.js');
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
function store(seed,denyDetails=false){
  const docs=new Map([['squad',{payload:clone(seed),revision:1}]]);let queue=Promise.resolve();
  const snap=id=>({exists:docs.has(id),data:()=>clone(docs.get(id)),metadata:{hasPendingWrites:false}});
  const database={collection:()=>({doc:id=>({id,get:async()=>snap(id),onSnapshot:()=>()=>{}})}),runTransaction:fn=>{
    const operation=queue.then(async()=>{const writes=[];const tx={get:async ref=>snap(ref.id),set:(ref,data,opts)=>{if(denyDetails&&ref.id.startsWith('squadMission_')){const e=Error('Document permission denied');e.code='permission-denied';throw e;}writes.push(()=>docs.set(ref.id,opts?.merge?{...docs.get(ref.id),...clone(data)}:clone(data)));},update:(ref,data)=>writes.push(()=>docs.set(ref.id,{...docs.get(ref.id),...clone(data)}))};const result=await fn(tx);writes.forEach(fn=>fn());return result;});queue=operation.catch(()=>{});return operation;
  }};return {database,docs};
}
const seed=()=>({clients:[],leads:[{id:'lead',company:'Loja',city:'Itu'}],missions:[{id:'m',clientName:'Teste',objective:'Auditar',status:'Erro',createdAt:'2026-10-16',results:[{agentId:'scout',text:'Entrega preservada'}]}],tasks:[],campaigns:[],activity:[]});
function device(database,storage=new Map()){
  const ctx=vm.createContext({crypto:webcrypto,TextEncoder,console:{error(){},warn(){}},Date,setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},SquadCore:core,window:{addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},firebase:{firestore:{FieldValue:{serverTimestamp:()=>0}}},ADMIN_EMAIL:'fake@example.invalid',DB_DOC:'squad',db:database,state:null,activeMissionAbortController:null,
    safeParse:x=>{try{return JSON.parse(x)}catch{return null}},defaultState:seed,normalizeState(){},renderAll(){},cloudStatus(){},document:{getElementById:()=>null},esc:x=>x});
  vm.runInContext(fs.readFileSync(__dirname+'/sync.js','utf8'),ctx);vm.runInContext('renderSyncStatus=()=>{}',ctx);
  return {run:code=>vm.runInContext(code,ctx),state:()=>clone(ctx.state),storage};
}
test('migração grava detalhes separados e recarrega o histórico completo',async()=>{
  const shared=store(seed()),a=device(shared.database);await a.run('loadState()');
  assert.equal(shared.docs.get('squad').missionStorageVersion,2);assert.equal(shared.docs.get('squad').payload.missions[0].detailDoc,true);assert.equal(shared.docs.get('squadMission_m').mission.results[0].text,'Entrega preservada');
  const b=device(shared.database);await b.run('loadState()');assert.equal(b.state().missions[0].results[0].text,'Entrega preservada');
});
test('PC e celular salvando de uma base antiga preservam ambas as alterações',async()=>{
  const shared=store(seed()),a=device(shared.database),b=device(shared.database);await a.run('loadState()');await b.run('loadState()');
  await a.run(`state.leads[0].company='Loja editada no PC';saveState()`);await b.run(`state.leads[0].city='Salto';state.leads.push({id:'novo',company:'Nova'});saveState()`);
  const value=shared.docs.get('squad').payload;assert.equal(value.leads[0].company,'Loja editada no PC');assert.equal(value.leads[0].city,'Salto');assert.equal(value.leads.length,2);
});
test('edição simultânea do mesmo campo gera conflito recuperável',async()=>{
  const shared=store(seed()),a=device(shared.database),b=device(shared.database);await a.run('loadState()');await b.run('loadState()');
  await a.run(`state.leads[0].city='Salto';saveState()`);await b.run(`state.leads[0].city='Sorocaba';saveState()`);
  assert.equal(b.state().leads[0].city,'Salto');assert.equal(b.run('syncConflicts[0].local'),'Sorocaba');assert.match(b.storage.get('wdm_squad_conflicts'),/Sorocaba/);
});
test('alterações locais pendentes sobrevivem à reabertura do painel',async()=>{
  const shared=store(seed()),a=device(shared.database);await a.run('loadState()');a.run(`state.leads[0].company='Edição offline';cacheState()`);
  const b=device(shared.database,a.storage);await b.run('loadState()');assert.equal(b.state().leads[0].company,'Edição offline');assert.equal(shared.docs.get('squad').payload.leads[0].company,'Edição offline');
});
test('reserva em transação impede dois dispositivos e libera ao concluir',async()=>{
  const shared=store(seed()),a=device(shared.database),b=device(shared.database);await a.run(`claimRun('missao-a')`);
  await assert.rejects(b.run(`claimRun('missao-b')`),/outro aparelho/);await a.run('releaseRun()');await b.run(`claimRun('missao-b')`);assert.equal(shared.docs.get('squad').activeRun.id,'missao-b');
});
test('regras antigas sem acesso a novos documentos mantêm armazenamento anterior',async()=>{
  const shared=store(seed(),true),a=device(shared.database);await a.run('loadState()');const raw=shared.docs.get('squad');assert.equal(raw.missionStorageVersion,1);assert.equal(raw.payload.missions[0].results[0].text,'Entrega preservada');
});
