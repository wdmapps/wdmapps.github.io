(function(root){
  'use strict';
  const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
  // Three-way merge: untouched fields follow the cloud; simultaneous edits are
  // retained as explicit conflicts. A stale edit cannot resurrect a deletion.
  function merge(base,local,remote,path=[],conflicts=[]){
    if(equal(base,local))return clone(remote);
    if(equal(base,remote)||equal(local,remote))return clone(local);
    if(Array.isArray(local)&&Array.isArray(remote)&&[...local,...remote,...(base||[])].every(x=>object(x)&&(x.id||x.agentId))){
      const key=x=>x.id||x.agentId;
      const b=new Map((base||[]).map(x=>[key(x),x])),l=new Map(local.map(x=>[key(x),x])),r=new Map(remote.map(x=>[key(x),x]));
      return [...new Set([...r.keys(),...l.keys(),...b.keys()])].map(id=>merge(b.get(id),l.get(id),r.get(id),[...path,id],conflicts)).filter(x=>x!==undefined);
    }
    if(object(local)&&object(remote)&&(base===undefined||object(base))){
      const out={};
      for(const k of new Set([...Object.keys(base||{}),...Object.keys(local),...Object.keys(remote)])){
        const value=merge(base?.[k],local[k],remote[k],[...path,k],conflicts);
        if(value!==undefined)out[k]=value;
      }
      return out;
    }
    conflicts.push({path,local:clone(local)??null,remote:clone(remote)??null,deleted:remote===undefined,localDeleted:local===undefined});
    return clone(remote);
  }
  function reconcile(base,local,remote){const conflicts=[];return {value:merge(base,local,remote,[],conflicts),conflicts};}
  function selectAgents(objective,mode='client'){
    const q=String(objective||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const ids=new Set(mode==='prospecting'?['radar','scout','copy','growth','analyst']:['scout','analyst']);
    if(/complet|tudo|360/.test(q))return ['radar','scout','copy','studio','web','growth','analyst'];
    if(/prospec|lead|oportunidade|concorrent|pesquis/.test(q))ids.add('radar');
    if(/conteudo|texto|copy|mensage|whatsapp|instagram|comunic|anuncio|campanha/.test(q))ids.add('copy');
    if(/arte|visual|criativ|video|design|campanha/.test(q))ids.add('studio');
    if(/site|landing|seo|web|app|sistema|automac/.test(q))ids.add('web');
    if(/divulg|marketing|venda|contato|growth|campanha|trafego/.test(q))ids.add('growth');
    return ['radar','scout','copy','studio','web','growth','analyst'].filter(id=>ids.has(id));
  }
  function validPlan(plan){
    if(!object(plan)||typeof plan.summary!=='string'||!plan.summary.trim()||typeof plan.nextMove!=='string'||!Array.isArray(plan.tasks)||plan.tasks.length<1||plan.tasks.length>8)throw Error('O Planner retornou um plano inválido. Retome a missão para tentar novamente.');
    for(const t of plan.tasks)if(!object(t)||typeof t.title!=='string'||!t.title.trim()||!['Alta','Média','Baixa'].includes(t.priority)||!Number.isInteger(t.daysFromNow)||t.daysFromNow<0||t.daysFromNow>30||typeof t.why!=='string')throw Error('O Planner retornou uma tarefa inválida.');
    return plan;
  }
  function leadKey(x){return [x?.company||x?.name||'',x?.city||''].join('|').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9|]/g,'');}
  function followupQueue(leads,today){return leads.filter(l=>!['Ganho','Perdido'].includes(l.status)&&(!l.nextFollowup||l.nextFollowup<=today)).sort((a,b)=>(a.nextFollowup||'9999').localeCompare(b.nextFollowup||'9999')||(Number(b.leadScore)||0)-(Number(a.leadScore)||0));}
  const api={clone,reconcile,selectAgents,validPlan,leadKey,followupQueue};
  if(typeof module!=='undefined')module.exports=api;else root.SquadCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
