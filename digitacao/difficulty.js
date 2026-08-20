import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth=getAuth(getApp());
const db=getFirestore(getApp());
const score={training:0,bronze:1,silver:2,gold:3};
const label={gold:'🥇 Ouro',silver:'🥈 Prata',bronze:'🥉 Bronze',training:'Em treino'};

function mode(){
  const text=document.querySelector('.lesson-item.active small')?.textContent||'';
  if(/Jogo/i.test(text))return'game';
  if(/Teste/i.test(text))return'fluency';
  if(/Texto/i.test(text))return'text';
  if(/Palavras/i.test(text))return'words';
  return'practice';
}

function easierRank(acc,wpm,type,combo=0){
  if(type==='game'){
    if(acc>=88&&combo>=8)return'gold';
    if(acc>=80&&combo>=5)return'silver';
    if(acc>=70)return'bronze';
    return'training';
  }
  if(type==='practice'){
    if(acc>=90&&wpm>=10)return'gold';
    if(acc>=82&&wpm>=6)return'silver';
    if(acc>=70)return'bronze';
    return'training';
  }
  if(type==='words'){
    if(acc>=92&&wpm>=16)return'gold';
    if(acc>=85&&wpm>=10)return'silver';
    if(acc>=72)return'bronze';
    return'training';
  }
  if(type==='text'){
    if(acc>=92&&wpm>=18)return'gold';
    if(acc>=86&&wpm>=12)return'silver';
    if(acc>=75)return'bronze';
    return'training';
  }
  if(acc>=94&&wpm>=24)return'gold';
  if(acc>=88&&wpm>=17)return'silver';
  if(acc>=78)return'bronze';
  return'training';
}

function parseResult(){
  const title=document.getElementById('lessonTitle')?.textContent||'';
  const phase=(title.match(/Fase\s+(\d+)/i)||[])[1];
  if(!phase)return null;
  const txt=document.getElementById('finishText')?.textContent||'';
  const acc=Number((txt.match(/(\d+)%\s+de precisão/i)||[])[1]||0);
  const wpm=Number((txt.match(/(\d+)\s+PPM/i)||[])[1]||0);
  const combo=Number((txt.match(/combo máximo\s+(\d+)/i)||[])[1]||0);
  return{index:Number(phase)-1,acc,wpm,combo,type:mode()};
}

async function retune(){
  const user=auth.currentUser;
  if(!user)return;
  const result=parseResult();
  if(!result)return;
  const rank=easierRank(result.acc,result.wpm,result.type,result.combo);
  const stars=score[rank];
  const starsEl=document.getElementById('finishStars');
  const rankEl=document.getElementById('finishRank');
  if(starsEl)starsEl.textContent='★'.repeat(stars)+'☆'.repeat(3-stars);
  if(rankEl)rankEl.textContent=label[rank];

  try{
    const ref=doc(db,'users',user.uid);
    const snap=await getDoc(ref);
    const data=snap.exists()?snap.data():{};
    const current=data?.digitacao?.completed?.[result.index];
    if(current&&score[rank]>score[current.rank||'training']){
      await updateDoc(ref,{
        [`digitacao.completed.${result.index}.rank`]:rank,
        [`digitacao.completed.${result.index}.stars`]:stars
      });
      const active=document.querySelector('.lesson-item.active .lesson-stars');
      if(active)active.textContent='★'.repeat(stars)+'☆'.repeat(3-stars);
      const all={...(data?.digitacao?.completed||{}),[result.index]:{...current,rank,stars}};
      const golds=Object.values(all).filter(x=>x?.rank==='gold').length;
      const goldEl=document.getElementById('goldCount');if(goldEl)goldEl.textContent=String(golds);
    }
  }catch(err){console.error('Ajuste de dificuldade:',err)}
}

const finish=document.getElementById('finishCard');
if(finish){
  new MutationObserver(()=>{
    if(!finish.classList.contains('hidden'))setTimeout(retune,120);
  }).observe(finish,{attributes:true,attributeFilter:['class']});
}

onAuthStateChanged(auth,()=>{});
