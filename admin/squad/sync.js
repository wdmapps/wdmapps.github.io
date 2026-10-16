'use strict';
const CACHE_KEY='wdm_squad_state',BASE_KEY='wdm_squad_sync_base';
const deviceId=crypto.randomUUID?.()||String(Date.now())+Math.random().toString(16).slice(2);
let cloudBase=null,syncQueue=Promise.resolve(),syncConflicts=[],syncError='',remoteRun=null,legacyStorage=false;
let leaseTimer=null,cloudUnsubscribe=null,lastPayloadRevision=-1,separateStorageActive=false,leaseLost=false;
const copyState=()=>SquadCore.clone(state);
function enqueueSync(work){const next=syncQueue.then(work,work);syncQueue=next.catch(()=>{});return next;}
function cacheState(){
  try{localStorage.setItem(CACHE_KEY,JSON.stringify(state));if(cloudBase)localStorage.setItem(BASE_KEY,JSON.stringify(cloudBase));}
  catch(e){syncError='Armazenamento local cheio. Exporte um backup e confira a sincronização online.';console.error(e);}
}
function applyState(next){
  // Preserve object identity while a runner holds its current mission reference.
  for(const key of Object.keys(state))if(!(key in next))delete state[key];
  for(const [key,value] of Object.entries(next)){
    if(Array.isArray(value)&&Array.isArray(state[key])){
      const old=new Map(state[key].filter(x=>x?.id).map(x=>[x.id,x]));
      state[key]=value.map(x=>{const item=old.get(x?.id);if(!item)return x;for(const k of Object.keys(item))if(!(k in x))delete item[k];return Object.assign(item,x);});
    }else state[key]=value;
  }
  normalizeState();
}
function recordConflicts(items){
  for(const item of items){const key=JSON.stringify(item);if(!syncConflicts.some(x=>JSON.stringify(x)===key))syncConflicts.push(item);}
  try{localStorage.setItem('wdm_squad_conflicts',JSON.stringify(syncConflicts));}catch(_){}
}
async function expandPayload(raw,reader){
  const result=SquadCore.clone(raw?.payload||{});
  if(raw?.missionStorageVersion===2){
    result.missions=await Promise.all((result.missions||[]).map(async m=>{
      if(!m.detailDoc)return m;
      const snap=await reader(db.collection('wdmAdmin').doc('squadMission_'+m.id));
      if(!snap.exists||!snap.data().mission)throw Error('Não foi possível carregar o histórico completo. Recarregue antes de editar.');
      return snap.data().mission;
    }));
  }
  return result;
}
function missionIndex(m){const {id,clientId,clientName,mode,objective,status,createdAt,finishedAt,progress}=m;return JSON.parse(JSON.stringify({id,clientId,clientName,mode,objective,status,createdAt,finishedAt,progress,detailDoc:true}));}
async function loadState(){
  const local=safeParse(localStorage.getItem(CACHE_KEY));
  cloudBase=safeParse(localStorage.getItem(BASE_KEY));
  syncConflicts=safeParse(localStorage.getItem('wdm_squad_conflicts'))||[];
  state=local||defaultState();normalizeState();
  try{
    const snap=await db.collection('wdmAdmin').doc(DB_DOC).get();
    if(snap.exists&&snap.data().payload){
      const raw=snap.data(),remote=await expandPayload(raw,ref=>ref.get());
      remoteRun=raw.activeRun||null;lastPayloadRevision=raw.revision||0;separateStorageActive=raw.missionStorageVersion===2;
      if(local&&cloudBase){const merged=SquadCore.reconcile(cloudBase,state,remote);applyState(merged.value);recordConflicts(merged.conflicts);}
      else {if(local)try{localStorage.setItem('wdm_squad_backup_before_upgrade',JSON.stringify(local));}catch(_){}applyState(remote);}
      cloudBase=remote;
    }else cloudBase={};
    await saveState();
    cloudUnsubscribe=db.collection('wdmAdmin').doc(DB_DOC).onSnapshot(snap=>{
      if(!snap.exists||snap.metadata.hasPendingWrites)return;
      const raw=snap.data();remoteRun=raw.activeRun||null;
      enqueueSync(async()=>{
        try{
          if((raw.revision||0)<=lastPayloadRevision)return;
          const remote=await expandPayload(raw,ref=>ref.get());
          const merged=SquadCore.reconcile(cloudBase||{},state,remote);
          applyState(merged.value);recordConflicts(merged.conflicts);cloudBase=remote;lastPayloadRevision=raw.revision||0;cacheState();renderAll();
        }catch(e){syncError=e.message;renderSyncStatus();}
      });
    },e=>{syncError='Sem conexão em tempo real. Suas alterações continuam salvas neste aparelho.';renderSyncStatus();});
  }catch(e){console.error(e);syncError='Modo local: '+e.message;cloudStatus('Salvo neste aparelho','err');}
  cacheState();renderAll();
}
async function saveState(){
  cacheState();renderAll();
  return enqueueSync(async()=>{
    if(!db)return false;
    const captured=copyState(),base=SquadCore.clone(cloudBase||{});
    cloudStatus('Salvando...','');
    try{
      let mergedResult;
      const commit=async separate=>db.runTransaction(async tx=>{
        const ref=db.collection('wdmAdmin').doc(DB_DOC),snap=await tx.get(ref),raw=snap.exists?snap.data():{};
        const remote=raw.payload?await expandPayload(raw,r=>tx.get(r)):{};
        const merged=SquadCore.reconcile(base,captured,remote);
        const payload=SquadCore.clone(merged.value);
        if(separate){
          for(const mission of payload.missions||[]){
            const previous=(remote.missions||[]).find(x=>x.id===mission.id);
            if(raw.missionStorageVersion!==2||JSON.stringify(previous)!==JSON.stringify(mission))tx.set(db.collection('wdmAdmin').doc('squadMission_'+mission.id),{mission,ownerEmail:ADMIN_EMAIL});
          }
          payload.missions=(payload.missions||[]).map(missionIndex);
        }
        if(new TextEncoder().encode(JSON.stringify(payload)).length>850000)throw Error('Histórico próximo do limite de armazenamento. Exporte o backup; nenhuma missão foi apagada.');
        tx.set(ref,{payload,missionStorageVersion:separate?2:1,revision:(raw.revision||0)+1,ownerEmail:ADMIN_EMAIL,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
        return {...merged,revision:(raw.revision||0)+1,separate};
      });
      try{mergedResult=await commit(!legacyStorage);}catch(e){
        if(e.code==='permission-denied'&&!legacyStorage&&!separateStorageActive){legacyStorage=true;mergedResult=await commit(false);}else throw e;
      }
      // Include edits made while the transaction was in flight.
      const current=SquadCore.reconcile(captured,state,mergedResult.value);
      applyState(current.value);recordConflicts([...mergedResult.conflicts,...current.conflicts]);
      cloudBase=mergedResult.value;lastPayloadRevision=mergedResult.revision;separateStorageActive=mergedResult.separate;syncError='';cacheState();renderAll();cloudStatus('Sincronizado online','ok');return true;
    }catch(e){console.error(e);syncError='Alterações salvas neste aparelho. Falha ao sincronizar: '+e.message;cacheState();cloudStatus('Pendente de sincronização','err');renderSyncStatus();return false;}
  });
}
async function claimRun(id){
  if(!db)throw Error('Conecte-se para iniciar uma missão.');
  await db.runTransaction(async tx=>{
    const ref=db.collection('wdmAdmin').doc(DB_DOC),snap=await tx.get(ref),lock=snap.data()?.activeRun;
    if(lock&&lock.expiresAt>Date.now()&&(lock.owner!==deviceId||lock.id!==id))throw Error('Já existe uma execução em outro aparelho ou aba. Aguarde sua conclusão ou a liberação em até 4 minutos.');
    leaseLost=false;remoteRun={id,owner:deviceId,expiresAt:Date.now()+240000};
    tx.set(ref,{activeRun:remoteRun},{merge:true});
  });
  clearInterval(leaseTimer);
  leaseTimer=setInterval(()=>db.runTransaction(async tx=>{
    const ref=db.collection('wdmAdmin').doc(DB_DOC),snap=await tx.get(ref);
    if(snap.data()?.activeRun?.owner!==deviceId)throw Error('A execução perdeu a reserva de sincronização.');
    tx.update(ref,{activeRun:{id,owner:deviceId,expiresAt:Date.now()+240000}});
  }).catch(e=>{syncError=e.message;leaseLost=true;activeMissionAbortController?.abort();renderSyncStatus();}),30000);
}
async function releaseRun(){
  clearInterval(leaseTimer);leaseTimer=null;
  try{await db.runTransaction(async tx=>{const ref=db.collection('wdmAdmin').doc(DB_DOC),snap=await tx.get(ref);if(snap.data()?.activeRun?.owner===deviceId)tx.update(ref,{activeRun:null});});}catch(e){console.warn(e);}
}
function renderSyncStatus(){
  let el=document.getElementById('squadSyncNotice');
  if(!el){el=document.createElement('div');el.id='squadSyncNotice';el.className='squad-notice';document.querySelector('main')?.prepend(el);}
  if(!el)return;
  const pending=syncConflicts.length;
  el.hidden=!syncError&&!pending;
  el.innerHTML='<span>'+esc(syncError||'')+(pending?' · '+pending+' conflito(s) de edição aguardando revisão.':'')+'</span> <button class="btn" onclick="exportSquadBackup()">Exportar backup</button>'+(pending?' <button class="btn" onclick="reviewSyncConflicts()">Revisar conflitos</button>':'')+(syncError?' <button class="btn" onclick="saveState()">Tentar sincronizar</button>':'');
}
function exportSquadBackup(){
  const blob=new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),state,syncConflicts,previousCacheBackup:safeParse(localStorage.getItem('wdm_squad_backup_before_upgrade'))},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='wdm-squad-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function reviewSyncConflicts(){
  document.getElementById('modalTitle').textContent='Revisar edições simultâneas';
  document.getElementById('modalBody').innerHTML=syncConflicts.map((c,i)=>'<article class="execution-plan"><b>'+esc(c.path.join(' / '))+'</b><p>Sua edição: '+esc(JSON.stringify(c.local))+'</p><p>Na nuvem: '+esc(JSON.stringify(c.remote))+'</p><button class="btn" onclick="resolveSyncConflict('+i+',false)">Manter nuvem</button> <button class="btn primary" onclick="resolveSyncConflict('+i+',true)">Usar minha edição</button></article>').join('');openModal('formModal');
}
async function resolveSyncConflict(index,useLocal){
  const item=syncConflicts[index];if(!item)return;
  if(useLocal){
    let target=state;
    for(let i=0;i<item.path.length-1;i++){const key=item.path[i];target=Array.isArray(target)?target.find(x=>(x.id||x.agentId)===key):target?.[key];if(!target){alert('O registro foi removido. Sua edição continua no backup para recuperação manual.');return;}}
    const key=item.path.at(-1);
    if(Array.isArray(target)){const at=target.findIndex(x=>(x.id||x.agentId)===key);if(at<0&&item.local)target.push(item.local);else if(at>=0)target.splice(at,1,...(item.local?[item.local]:[]));}
    else if(item.localDeleted)delete target[key];else target[key]=item.local;
  }
  syncConflicts.splice(index,1);recordConflicts([]);await saveState();if(syncConflicts.length)reviewSyncConflicts();else closeModal('formModal');
}
window.addEventListener('online',()=>{if(state)saveState();});
