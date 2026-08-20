import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc, updateDoc, deleteField } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth=getAuth(getApp());
const db=getFirestore(getApp());
const score={training:0,bronze:1,silver:2,gold:3};
const label={gold:'🥇 Ouro',silver:'🥈 Prata',bronze:'🥉 Bronze',training:'🔁 Refaça a lição'};
const PASSING_ACCURACY=70;
let blockedPhase=null;

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
  if(next&&!next.classList.contains('hidden'))next.textContent='Próxima fase →  Enter';
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
    if(previousPass)next.classList.remove('hidden');
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

async function retune(){
  const user=auth.currentUser;
  if(!user)return;
  const result=parseResult();
  if(!result)return;

  const ref=doc(db,'users',user.uid);
  let data={};
  try{
    const snap=await getDoc(ref);
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
      await updateDoc(ref,{
        [`digitacao.completed.${result.index}`]:deleteField(),
        'digitacao.unlocked':Math.min(currentUnlocked,result.index)
      });
    }catch(err){
      console.error('Reprovação da fase:',err);
    }
    return;
  }

  const rank=accuracyRank(result.acc);
  paintPassed(result,rank);

  try{
    if(stored&&score[rank]>score[stored.rank||'training']){
      await updateDoc(ref,{
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
    if(!finish.classList.contains('hidden'))setTimeout(retune,120);
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

document.addEventListener('keydown',e=>{
  if(e.key!=='Enter')return;
  const card=document.getElementById('finishCard');
  if(!card||card.classList.contains('hidden'))return;
  const result=parseResult();
  if(!result||result.acc<PASSING_ACCURACY)return;
  const next=document.getElementById('nextBtn');
  if(!next||next.classList.contains('hidden'))return;
  e.preventDefault();
  e.stopPropagation();
  next.click();
},true);

onAuthStateChanged(auth,()=>{});
