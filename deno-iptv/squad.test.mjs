import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.Deno={env:{get:name=>name==='OPENAI_API_KEY'?'mock-key':undefined}};
const {handleRequest}=await import('./main.ts');
const originalFetch=globalThis.fetch;test.afterEach(()=>{globalThis.fetch=originalFetch;});
let apiBodies=[];
function mock(payload){apiBodies=[];globalThis.fetch=async(url,init)=>{
  if(String(url).includes('identitytoolkit'))return Response.json({users:[{email:'williamwdm@gmail.com'}]});
  assert.equal(String(url),'https://api.openai.com/v1/responses');apiBodies.push(JSON.parse(init.body));assert.ok(init.signal);return Response.json(payload);
};}
const call=(agentId='planner',extra={})=>handleRequest(new Request('https://example.test/squad/agent',{method:'POST',headers:{Authorization:'Bearer fake-token','Content-Type':'application/json'},body:JSON.stringify({agentId,client:{name:'Empresa de teste'},objective:'Teste',...extra})}));
const plan={summary:'Plano confirmado',nextMove:'Revisar diagnóstico',tasks:[{title:'Revisar',priority:'Alta',daysFromNow:1,why:'Verificar os fatos'}]};
const complete=text=>({id:'resp_test',status:'completed',output:[{type:'message',content:[{type:'output_text',text}]}],usage:{input_tokens:100,output_tokens:50,total_tokens:150}});
test('API exige autenticação antes de executar agentes',async()=>{let called=false;globalThis.fetch=async()=>{called=true;throw Error('Não deve chamar')};const res=await handleRequest(new Request('https://example.test/squad/agent',{method:'POST'}));assert.equal(res.status,401);assert.equal(called,false);});
test('Planner usa schema estrito, retorna uso e não inventa custo',async()=>{
  mock(complete(JSON.stringify(plan)));const res=await call();assert.equal(res.status,200);const data=await res.json();assert.deepEqual(data.structured,plan);assert.equal(data.usage.totalTokens,150);assert.equal(data.estimatedCostUsd,null);assert.equal(data.usedWeb,false);assert.equal(apiBodies[0].text.format.strict,true);assert.equal(apiBodies[0].text.format.type,'json_schema');
});
test('resposta incompleta não é tratada como entrega concluída',async()=>{
  mock({...complete('Texto cortado'),status:'incomplete',incomplete_details:{reason:'max_output_tokens'}});const res=await call('scout');assert.equal(res.status,502);const data=await res.json();assert.match(data.error,/INCOMPLETE/);assert.equal(data.telemetry.usage.totalTokens,150);
});
test('recusa explícita é erro recuperável',async()=>{
  mock({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'Recusa'}]}]});assert.equal((await call()).status,502);
});
test('schema válido sintaticamente ainda recebe validação de negócio',async()=>{
  mock(complete(JSON.stringify({...plan,tasks:[{...plan.tasks[0],daysFromNow:50}]})));const res=await call();assert.equal(res.status,502);assert.match((await res.json()).error,/INVALID_TASK/);
});
test('permissão de pesquisa não é confundida com uso real da web',async()=>{
  mock(complete('Diagnóstico sem pesquisa'));const data=await(await call('scout')).json();assert.equal(data.usedWeb,false);assert.equal(data.webSearchCalls,0);
});
test('lead estruturado exige pesquisa real e mantém fontes da API',async()=>{
  mock(complete(JSON.stringify({leads:[]})));assert.equal((await call('radar',{outputFormat:'leads'})).status,502);
  const payload=complete(JSON.stringify({leads:[]}));payload.output.unshift({type:'web_search_call',status:'completed',action:{sources:[{url:'https://example.org/empresa',title:'Empresa'}]}});
  mock(payload);const data=await(await call('radar',{outputFormat:'leads'})).json();assert.equal(data.usedWeb,true);assert.equal(data.sources[0].url,'https://example.org/empresa');assert.deepEqual(data.structured,{leads:[]});assert.equal(apiBodies[0].text.format.name,'lead_candidates');
});

test("saúde da Squad identifica a versão sem chamar serviços externos",async()=>{globalThis.fetch=async()=>{throw Error("Não deve chamar a rede")};const res=await handleRequest(new Request("https://example.test/squad/health"));assert.deepEqual(await res.json(),{ok:true,version:"2026-10-16.2",structuredOutputs:true});});
