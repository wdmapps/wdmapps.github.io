const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const root=__dirname;
const core=require('./core.js');
test('sincronização combina edições em campos e registros diferentes',()=>{
  const base={leads:[{id:'a',company:'Loja',city:'Itu'}]},local={leads:[{id:'a',company:'Loja nova',city:'Itu'},{id:'b',company:'B'}]},remote={leads:[{id:'a',company:'Loja',city:'Salto'},{id:'c',company:'C'}]};
  const result=core.reconcile(base,local,remote);assert.equal(result.conflicts.length,0);assert.equal(result.value.leads.length,3);assert.deepEqual(result.value.leads.find(x=>x.id==='a'),{id:'a',company:'Loja nova',city:'Salto'});
});
test('conflitos preservam a edição local e não ressuscitam exclusões remotas',()=>{
  const base={leads:[{id:'a',city:'Itu'}]},local={leads:[{id:'a',city:'Salto'}]},remote={leads:[]};
  const result=core.reconcile(base,local,remote);assert.deepEqual(result.value.leads,[]);assert.equal(result.conflicts[0].local.city,'Salto');assert.equal(result.conflicts[0].deleted,true);
  const edit=core.reconcile(base,local,{leads:[{id:'a',city:'Sorocaba'}]});assert.equal(edit.value.leads[0].city,'Sorocaba');assert.deepEqual(edit.conflicts[0].path,['leads','a','city']);
});
test('histórico de contato de dois aparelhos é combinado sem duplicação',()=>{
  const base={id:'a',contactHistory:[]},local={...base,contactHistory:[{id:'x',note:'A'}]},remote={...base,contactHistory:[{id:'y',note:'B'}]};
  assert.equal(core.reconcile(base,local,remote).value.contactHistory.length,2);
});
test('Morgan seleciona somente especialistas relacionados ao objetivo',()=>{
  assert.deepEqual(core.selectAgents('Auditar site e SEO'),['scout','web','analyst']);
  assert.equal(core.selectAgents('Plano completo').length,7);
  assert.ok(core.selectAgents('Buscar novos leads','prospecting').includes('radar'));
});
test('Planner rejeita tarefas inválidas antes de alterar o quadro',()=>{
  assert.throws(()=>core.validPlan({summary:'OK',nextMove:'Ir',tasks:[{title:'Teste',priority:'Alta',daysFromNow:90,why:'x'}]}));
  assert.throws(()=>core.validPlan({summary:'',tasks:[]}));
});
test('fila inclui atrasados e não agendados, exclui futuros e encerrados',()=>{
  const queue=core.followupQueue([{id:'a',status:'Contato',nextFollowup:'2026-10-15'},{id:'b',status:'Novo'},{id:'c',status:'Ganho'},{id:'d',status:'Contato',nextFollowup:'2026-10-18'}],'2026-10-16');assert.deepEqual(queue.map(x=>x.id),['a','b']);
});
function fixture(){
  const alerts=[],calls=[];
  const ctx=vm.createContext({crypto:webcrypto,AbortController,console,Date,setTimeout,clearTimeout,leaseLost:false,remoteRun:null,window:{addEventListener(){}},alert:v=>alerts.push(v),confirm:()=>true,
    document:{querySelectorAll:()=>[],getElementById:()=>({})},location:{hash:''},history:{replaceState(){}},localStorage:{getItem:()=>null,setItem(){}},SquadCore:core});
  let js=fs.readFileSync(root+'/squad.js','utf8');js=js.slice(0,js.lastIndexOf('(async function init()'));
  vm.runInContext(js,ctx);
  ctx.api=async payload=>{calls.push(payload);return {text:'Entrega validada',agentName:payload.agentId};};
  vm.runInContext(`state=defaultState();normalizeState();renderAll=()=>{};showView=()=>{};showMissionResult=()=>{};squadSpeak=()=>{};saveState=async()=>true;claimRun=async()=>{};releaseRun=async()=>{};firebaseUser=async()=>({getIdToken:async()=> 'mock-token'});squadApiCall=async(token,payload)=>api(payload);generateExecutionPlan=async()=>true;`,ctx);
  return {ctx,alerts,calls,run:s=>vm.runInContext(s,ctx),data:()=>JSON.parse(vm.runInContext('JSON.stringify(state)',ctx))};
}
test('nona missão preserva todas as oito anteriores',async()=>{
  const f=fixture();f.run(`state.missions=Array.from({length:8},(_,i)=>({id:'old'+i,status:'Concluída',results:[]}));`);
  await f.run(`runFullMission('ferrari-gesso','Auditar SEO')`);assert.equal(f.data().missions.length,9);assert.equal(f.data().missions[0].status,'Concluída');
});
test('falha no Planner resulta em Parcial, com entregas preservadas',async()=>{
  const f=fixture();f.run('generateExecutionPlan=async()=>false;');await f.run(`runFullMission('ferrari-gesso','Auditar SEO')`);
  assert.equal(f.data().missions[0].status,'Parcial');assert.equal(f.data().missions[0].results.length,f.data().missions[0].agentIds.length);
});
test('duplo clique não inicia duas execuções',async()=>{
  const f=fixture();await f.run(`Promise.all([runFullMission('ferrari-gesso','SEO'),runFullMission('ferrari-gesso','SEO')])`);
  assert.equal(f.data().missions.length,1);assert.equal(f.alerts.length,1);
});
test('retomada usa o resultado já salvo e executa somente a etapa pendente',async()=>{
  const f=fixture();f.run(`state.missions=[{id:'resume',clientId:'ferrari-gesso',clientSnapshot:state.clients[0],clientName:'Ferrari',mode:'client',objective:'SEO',agentIds:['scout','analyst'],status:'Erro',results:[{agentId:'scout',text:'Pesquisa já salva'}]}];`);
  await f.run(`resumeMission('resume')`);assert.deepEqual(f.calls.map(x=>x.agentId),['analyst']);assert.equal(f.calls[0].previousResults.scout,'Pesquisa já salva');assert.equal(f.data().missions[0].status,'Concluída');
});
test('falha no checkpoint impede a chamada paga seguinte',async()=>{
  const f=fixture();f.run('saveState=async()=>false;');await f.run(`runFullMission('ferrari-gesso','SEO')`);assert.equal(f.calls.length,0);assert.equal(f.data().missions[0].status,'Erro');
});
test('reserva recusada no outro aparelho não cria missão local',async()=>{
  const f=fixture();f.run(`claimRun=async()=>{throw Error('Outro aparelho em execução')}`);await f.run(`runFullMission('ferrari-gesso','SEO')`);assert.equal(f.data().missions.length,0);assert.match(f.alerts[0],/Outro aparelho/);
});
test('Scout valida também o modo de qualquer oportunidade',async()=>{
  const f=fixture();f.run(`radarApiCallWithRetry=async()=>{throw Error('Scout foi chamado')}`);
  await assert.rejects(f.run(`validateRadarCandidates('token',[{company:'Loja',city:'Itu'}],'any','Itu','',5)`),/Scout foi chamado/);
});
test('parser aceita JSON estruturado e mantém compatibilidade com histórico antigo',()=>{
  const f=fixture();const legacy='LEAD_START\nEMPRESA: Loja\nCIDADE: Itu\nSTATUS_SITE: NAO_CONFIRMADO\nLEAD_END';
  f.ctx.legacy=legacy;f.ctx.structured=JSON.stringify({leads:[{EMPRESA:'Loja',CIDADE:'Itu',STATUS_SITE:'NAO_CONFIRMADO'}]});
  assert.equal(f.run(`parseRadarLeadBlocks(legacy,'Itu')[0].company`),'Loja');assert.equal(f.run(`parseRadarLeadBlocks(structured,'Itu')[0].company`),'Loja');
});

test("datas de prazo mantêm o dia informado",()=>{const f=fixture();assert.equal(f.run("fmtDate('2026-10-16')"),"16/10/2026");});

test('erro de tokens aparece em português e oferece recuperação sem descartar etapas',()=>{
  const f=fixture(),message=f.run("friendlySquadError('OPENAI_INCOMPLETE:max_output_tokens')");assert.match(message,/limite de resposta/);assert.match(message,/continuam salvas/);assert.doesNotMatch(message,/OPENAI_/);
});

test('missão com erro não exibe como resultado final uma missão antiga',()=>{
  const f=fixture(),shown=new Set(['show']),body={innerHTML:'Resultado antigo'};
  f.ctx.document.getElementById=id=>id==='commandResult'?{classList:{remove:v=>shown.delete(v),add:v=>shown.add(v)}}:id==='commandResultBody'?body:{};
  f.run("state.missions=[{id:'new',status:'Erro',results:[]},{id:'old',status:'Concluída',results:[{agentId:'scout',text:'Antigo'}]}];renderCommandResult()");assert.equal(shown.has('show'),false);assert.equal(body.innerHTML,'');
});
