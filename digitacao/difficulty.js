const score={training:0,bronze:1,silver:2,gold:3};
const label={gold:'🥇 Ouro',silver:'🥈 Prata',bronze:'🥉 Bronze',training:'🔁 Refaça a lição'};
const PASSING_ACCURACY=70;
let blockedPhase=null;
let firebasePromise=null;

// Ajuste visual: acertos em verde mais vivo/luminoso.
const visualStyle=document.createElement('style');
visualStyle.textContent=`
.char.correct{
  opacity:1!important;
  color:#69ff9b!important;
  text-shadow:0 0 7px rgba(105,255,155,.72),0 0 14px rgba(105,255,155,.28);
  font-weight:700;
}
`;
document.head.appendChild(visualStyle);

function accuracyRank(acc){
  if(acc>=90)return'gold';
  if(acc>=80)return'silver';
  if(acc>=PASSING_ACCURACY)return'bronze';
  return'training';
}

function parseResult(){
  const title=document.getElementById('lessonTitle')?.textContent||'';
  const phase=(title.match(/Fase\s+(\d+)/i)||[])[1];
  if(!phase)return null;
  const txt=document.getElementById('finishText')?.textContent||'';
  const acc=Number((txt.match(/(\d+)%\s+de precisão/i)||[])[1]||0);
  const wpm=Number((txt.match(/(\d+)\s+PPM/i)||[])[1]||0);
  return{index:Number(phase)-1,acc,wpm};
}

function phaseNumberFromItem(item){
  const txt=item?.querySelector('strong')?.textContent||'';
  return Number((txt.match(/^(\d+)\./)||[])[1]||0);
}

function sanitizeSidebar(){
  const items=[...document.querySelectorAll('.lesson-item')];
  items.forEach(item=>{
    const n=phaseNumberFromItem(item);
    if(!n)return;
    item.style.display=blockedPhase!==null&&n>blockedPhase+1?'none':'';
  });
}

function setProgressFromCompleted(completed={}){
  const values=Object.values(completed||{});
  const done=values.length;
  const total=450;
  const doneEl=document.getElementById('doneCount');
  const progressEl=document.getElementById('globalProgress');
  const goldEl=document.getElementById('goldCount');
  if(doneEl)doneEl.textContent=`${done}/${total}`;
  if(progressEl)progressEl.textContent=`${Math.round(done/total*100)}%`;
  if(goldEl)goldEl.textContent=String(values.filter(x=>x?.rank==='gold').length);
}

function paintPassed(result,rank){
  blockedPhase=null;
  sanitizeSidebar();
  const card=document.getElementById('finishCard');
  const stars=document.getElementById('finishStars');
  const rankEl=document.getElementById('finishRank');
  const retry=document.getElementById('retryBtn');
  const next=document.getElementById('nextBtn');
  const kicker=card?.querySelector('.kicker');
  const heading=card?.querySelector('h3');
  const starCount=score[rank];
  if(kicker)kicker.textContent='Fase concluída';
  if(heading)heading.textContent='🎉 Muito bem!';
  if(stars)stars.textContent='★'.repeat(starCount)+'☆'.repeat(3-starCount);
  if(rankEl)rankEl.textContent=`${label[rank]} · Pressione Enter para continuar`;
  if(retry)retry.textContent='Tentar novamente';
  if(next){
    if(result.index<449)next.classList.remove('hidden');
    next.textContent='Próxima fase →  Enter';
  }
  card?.removeAttribute('data-failed');
  document.getElementById('celebration')?.removeAttribute('aria-hidden');
}

function paintFailed(result,previousPass=false){
  const card=document.getElementById('finishCard');
  const stars=document.getElementById('finishStars');
  const rankEl=document.getElementById('finishRank');
  const retry=document.getElementById('retryBtn');
  const next=document.getElementById('nextBtn');
  const kicker=card?.querySelector('.kicker');
  const heading=card?.querySelector('h3');
  const finishText=document.getElementById('finishText');
  if(kicker)kicker.textContent=previousPass?'Tentativa concluída':'Fase não concluída';
  if(heading)heading.textContent=previousPass?'Você já tinha passado esta fase':'💪 Quase lá!';
  if(stars)stars.textContent='☆☆☆';
  if(rankEl)rankEl.textContent=previousPass?'Sua aprovação anterior foi mantida.':'🔁 Refaça a lição para avançar';
  if(retry)retry.textContent='Refazer lição ↻';
  if(next){
    if(previousPass&&result.index<449)next.classList.remove('hidden');
    else next.classList.add('hidden');
  }
  if(finishText&&!finishText.dataset.approvalMessage){
    finishText.insertAdjacentHTML('beforeend',`<br><strong>${previousPass?'Nesta tentativa você ficou abaixo da meta.':'Meta mínima: 70% de precisão para liberar a próxima fase.'}</strong>`);
    finishText.dataset.approvalMessage='1';
  }
  card?.setAttribute('data-failed','1');
  const celebration=document.getElementById('celebration');
  if(celebration){celebration.innerHTML='';celebration.setAttribute('aria-hidden','true')}
}

async function getFirebase(){
  if(firebasePromise)return firebasePromise;
  firebasePromise=(async()=>{
    const appMod=await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js');
    const authMod=await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js');
    const fsMod=await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js');
    let app=null;
    for(let i=0;i<30&&!app;i++){
      try{app=appMod.getApp()}catch(_){await new Promise(r=>setTimeout(r,50))}
    }
    if(!app)throw new Error('Firebase principal ainda não inicializado.');
    return{
      auth:authMod.getAuth(app),
      db:fsMod.getFirestore(app),
      doc:fsMod.doc,
      getDoc:fsMod.getDoc,
      updateDoc:fsMod.updateDoc,
      deleteField:fsMod.deleteField
    };
  })();
  return firebasePromise;
}

async function retune(){
  const result=parseResult();
  if(!result)return;

  // A interface e o Enter não dependem mais do Firebase para funcionar.
  const rank=accuracyRank(result.acc);
  if(result.acc>=PASSING_ACCURACY)paintPassed(result,rank);

  let fb;
  try{fb=await getFirebase()}catch(err){console.error('Inicialização do ajuste:',err);return}
  const user=fb.auth.currentUser;
  if(!user)return;

  const ref=fb.doc(fb.db,'users',user.uid);
  let data={};
  try{
    const snap=await fb.getDoc(ref);
    data=snap.exists()?snap.data():{};
  }catch(err){
    console.error('Leitura do progresso:',err);
  }

  const completed={...(data?.digitacao?.completed||{})};
  const stored=completed?.[result.index];
  const hadPassingBest=!!stored&&Number(stored.acc||0)>=PASSING_ACCURACY;

  if(result.acc<PASSING_ACCURACY){
    if(hadPassingBest){
      blockedPhase=null;
      paintFailed(result,true);
      sanitizeSidebar();
      return;
    }

    blockedPhase=result.index;
    paintFailed(result,false);
    delete completed[result.index];
    setProgressFromCompleted(completed);
    sanitizeSidebar();

    try{
      const currentUnlocked=Number(data?.digitacao?.unlocked||0);
      await fb.updateDoc(ref,{
        [`digitacao.completed.${result.index}`]:fb.deleteField(),
        'digitacao.unlocked':Math.min(currentUnlocked,result.index)
      });
    }catch(err){
      console.error('Reprovação da fase:',err);
    }
    return;
  }

  try{
    if(stored&&score[rank]>score[stored.rank||'training']){
      await fb.updateDoc(ref,{
        [`digitacao.completed.${result.index}.rank`]:rank,
        [`digitacao.completed.${result.index}.stars`]:score[rank]
      });
      completed[result.index]={...stored,rank,stars:score[rank]};
      setProgressFromCompleted(completed);
      const active=document.querySelector('.lesson-item.active .lesson-stars');
      if(active)active.textContent='★'.repeat(score[rank])+'☆'.repeat(3-score[rank]);
    }
  }catch(err){
    console.error('Ajuste de estrelas:',err);
  }
}

const finish=document.getElementById('finishCard');
if(finish){
  new MutationObserver(()=>{
    if(!finish.classList.contains('hidden'))setTimeout(retune,60);
    else{
      finish.removeAttribute('data-failed');
      const finishText=document.getElementById('finishText');
      if(finishText)delete finishText.dataset.approvalMessage;
      setTimeout(sanitizeSidebar,0);
    }
  }).observe(finish,{attributes:true,attributeFilter:['class']});
}

const lessonList=document.getElementById('lessonList');
if(lessonList)new MutationObserver(sanitizeSidebar).observe(lessonList,{childList:true,subtree:true});

document.addEventListener('click',e=>{
  if(blockedPhase===null)return;
  const item=e.target.closest?.('.lesson-item');
  if(!item)return;
  const n=phaseNumberFromItem(item);
  if(n>blockedPhase+1){e.preventDefault();e.stopPropagation();}
},true);

function advanceWithEnter(e){
  if(e.key!=='Enter'&&e.code!=='Enter'&&e.code!=='NumpadEnter')return;
  const card=document.getElementById('finishCard');
  if(!card||card.classList.contains('hidden'))return;
  const result=parseResult();
  if(!result||result.acc<PASSING_ACCURACY||result.index>=449)return;
  const next=document.getElementById('nextBtn');
  if(!next)return;
  next.classList.remove('hidden');
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  next.click();
}

document.addEventListener('keydown',advanceWithEnter,true);
