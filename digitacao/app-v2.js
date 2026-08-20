// WDM Digitação v2 — currículo mais variado + som mecânico
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const firebaseConfig={apiKey:'AIzaSyAsFSEPowUrZrYLipkrQiCcc0Q7evJbcFo',authDomain:'wdm-shopping-d0fab.firebaseapp.com',projectId:'wdm-shopping-d0fab',storageBucket:'wdm-shopping-d0fab.firebasestorage.app',messagingSenderId:'680767376055',appId:'1:680767376055:web:4f7db5be627c205d611b32'};
const firebaseApp=initializeApp(firebaseConfig);
const auth=getAuth(firebaseApp);
const db=getFirestore(firebaseApp);
await setPersistence(auth,browserLocalPersistence);

const $=id=>document.getElementById(id);
const els={authGate:$('authGate'),app:$('app'),name:$('name'),email:$('email'),password:$('password'),authMessage:$('authMessage'),loginBtn:$('loginBtn'),createBtn:$('createBtn'),googleBtn:$('googleBtn'),resetPasswordBtn:$('resetPasswordBtn'),logoutBtn:$('logoutBtn'),studentName:$('studentName'),studentEmail:$('studentEmail'),globalProgress:$('globalProgress'),doneCount:$('doneCount'),goldCount:$('goldCount'),cloudStatus:$('cloudStatus'),moduleLabel:$('moduleLabel'),lessonList:$('lessonList'),lessonModule:$('lessonModule'),lessonTitle:$('lessonTitle'),lessonDesc:$('lessonDesc'),wpm:$('wpm'),accuracy:$('accuracy'),errors:$('errors'),time:$('time'),lessonProgress:$('lessonProgress'),typingPanel:$('typingPanel'),typingBox:$('typingBox'),nextKey:$('nextKey'),gamePanel:$('gamePanel'),gameTarget:$('gameTarget'),gameHits:$('gameHits'),gameMisses:$('gameMisses'),gameCombo:$('gameCombo'),keyboard:$('keyboard'),fingerHint:$('fingerHint'),leftHand:$('leftHand'),rightHand:$('rightHand'),finishCard:$('finishCard'),finishStars:$('finishStars'),finishText:$('finishText'),finishRank:$('finishRank'),nextBtn:$('nextBtn'),retryBtn:$('retryBtn'),resetBtn:$('resetBtn'),tipText:$('tipText'),celebration:$('celebration')};

// ---------- Som de teclado mecânico (Web Audio, sem arquivos externos) ----------
let soundEnabled=localStorage.getItem('wdmTypingSound')!=='off';
let audioCtx=null;
function ensureAudio(){if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();return audioCtx}
function playKeySound(strength=1){
  if(!soundEnabled)return;
  try{
    const ctx=ensureAudio(),now=ctx.currentTime;
    const osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
    osc.type='triangle';osc.frequency.setValueAtTime(155+Math.random()*35,now);osc.frequency.exponentialRampToValueAtTime(72,now+.045);
    filter.type='lowpass';filter.frequency.value=900;
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.11*strength,now+.003);gain.gain.exponentialRampToValueAtTime(.0001,now+.055);
    osc.connect(filter);filter.connect(gain);gain.connect(ctx.destination);osc.start(now);osc.stop(now+.06);
    const buffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*.025),ctx.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
    const noise=ctx.createBufferSource(),ng=ctx.createGain(),hp=ctx.createBiquadFilter();noise.buffer=buffer;hp.type='highpass';hp.frequency.value=1500;ng.gain.setValueAtTime(.05*strength,now);ng.gain.exponentialRampToValueAtTime(.0001,now+.022);noise.connect(hp);hp.connect(ng);ng.connect(ctx.destination);noise.start(now);
  }catch(e){/* áudio é opcional */}
}
function installSoundToggle(){
  const head=document.querySelector('.keyboard-head');if(!head||document.getElementById('soundToggle'))return;
  const b=document.createElement('button');b.id='soundToggle';b.className='sound-toggle';
  const paint=()=>b.textContent=soundEnabled?'🔊 Som mecânico':'🔇 Som desligado';paint();
  b.onclick=()=>{soundEnabled=!soundEnabled;localStorage.setItem('wdmTypingSound',soundEnabled?'on':'off');paint();if(soundEnabled)playKeySound(.8)};
  head.appendChild(b);
}

const moduleData=[
['Fundamentos F e J','fjdk',['f','j','fj','jf','fd','jk','df','kj'],[]],
['Fileira central','asdfghjklç',['sala','fala','fada','gala','falha','salada','salsa','dada','alfa'],[]],
['Linha superior I','asdfghjklçqwert',['rede','arte','festa','terra','data','falar','rato','gato','tela','queda'],[]],
['Linha superior II','asdfghjklçqwertyuiop',['quero','poder','ideia','tipo','olhar','roupa','rua','futuro','estudo','portal'],[]],
['Linha inferior','abcdefghijklmnopqrstuvwxyzç',['cama','navio','vinho','texto','baixo','banco','zero','zona','azul','vida','novo','mundo'],[]],
['Alfabeto completo','abcdefghijklmnopqrstuvwxyzç',['computador','teclado','escola','aluno','curso','trabalho','internet','arquivo','programa','janela','mouse','monitor'],['digitar bem exige pratica e paciencia','o aluno aprende melhor quando pratica todos os dias','a velocidade aumenta quando a tecnica fica natural']],
['Acentos e cedilha','abcdefghijklmnopqrstuvwxyzçáéíóúãõâêô',['ação','atenção','coração','você','café','saúde','informação','educação','visão','mão','função','digitação'],['a digitação melhora com atenção e prática','você pode ganhar precisão com exercícios curtos','educação e tecnologia caminham juntas']],
['Maiúsculas','abcdefghijklmnopqrstuvwxyzç',['Brasil','Escola','Curso','Tecnologia','Internet','Teclado','Aluno','Professor','Windows','WDM'],['A prática diária melhora a Digitação.','O Aluno deve olhar para a tela.','Tecnologia exige atenção e precisão.']],
['Pontuação','abcdefghijklmnopqrstuvwxyzç,.;:?!',['olá,','sim.','não?','atenção!','curso;','texto:'],['Olá, aluno. Tudo bem?','Digite com calma, precisão e ritmo.','Treinar é importante; desistir não ajuda.','Atenção: olhe para a tela!']],
['Números','1234567890abcdefghijklmnopqrstuvwxyz',['2026','1234','5678','90','100','250','500','1000','2025','450'],['o curso possui 450 fases','treine 10 minutos por dia','uma meta pode ser 30 palavras por minuto']],
['Símbolos','1234567890-_=+()[]{}%$@#abcdefghijklmnopqrstuvwxyz',['10%','R$','@','2026-08','(teste)','[fase]','100%','email@teste'],['resultado: 95% de precisão','meta: 30 ppm + 95%','curso [wdm] - fase 1']],
['Vocabulário cotidiano','abcdefghijklmnopqrstuvwxyzçáéíóúãõ,.',['família','cidade','mercado','trabalho','estudo','telefone','mensagem','viagem','amigo','tempo','casa','escola','projeto','dinheiro'],['A prática faz parte de uma rotina eficiente.','Escrever bem no computador economiza tempo.','Uma mensagem clara começa com boas ideias.']],
['Vocabulário de tecnologia','abcdefghijklmnopqrstuvwxyzçáéíóúãõ,.-/',['computador','hardware','software','internet','servidor','arquivo','backup','navegador','sistema','aplicativo','rede','senha','login','nuvem'],['O computador executa programas e processa informações.','Uma senha forte ajuda a proteger a conta do usuário.','O backup evita a perda de arquivos importantes.']],
['Frases e ritmo','abcdefghijklmnopqrstuvwxyzçáéíóúãõ,.;:?!',['ritmo','precisão','velocidade','controle','postura','conforto','memória','movimento'],['Mantenha os dedos próximos das teclas e evite movimentos desnecessários.','A velocidade deve crescer sem prejudicar a precisão da digitação.','Olhe para a tela e deixe as mãos encontrarem as teclas pela memória.']],
['Textos de fluidez','abcdefghijklmnopqrstuvwxyzçáéíóúãõ,.;:?!',['fluidez','leitura','conteúdo','produção','comunicação','habilidade'],['Quando a posição dos dedos se torna natural, a digitação passa a exigir menos esforço consciente.','Um bom ritmo permite escrever com velocidade sem perder a clareza e a precisão.','Treinos curtos e frequentes costumam produzir melhores resultados do que sessões longas e irregulares.']],
['Velocidade e precisão','abcdefghijklmnopqrstuvwxyzçáéíóúãõ,.;:?!1234567890',['desempenho','resultado','recorde','meta','precisão','velocidade','evolução','desafio'],['A meta deste módulo é manter precisão alta enquanto a velocidade aumenta.','Evite acelerar de forma descontrolada; procure um ritmo constante.','Cada repetição ajuda a transformar movimentos corretos em hábitos automáticos.']],
['Desafios avançados','abcdefghijklmnopqrstuvwxyzçáéíóúãõ,.;:?!1234567890',['produtividade','aprendizado','tecnologia','concentração','desenvolvimento','profissional','comunicação','organização'],['Digitar com eficiência permite concentrar a atenção no conteúdo em vez de procurar teclas.','A combinação de técnica, prática e regularidade melhora o desempenho ao longo do tempo.','Um digitador experiente mantém postura, precisão e ritmo mesmo em textos mais complexos.']],
['Mestre da Digitação','abcdefghijklmnopqrstuvwxyzçáéíóúãõ,.;:?!1234567890',['maestria','consistência','precisão','velocidade','conquista','excelência','finalização','recorde'],['Chegar ao final do curso significa dominar uma técnica que continuará evoluindo com o uso diário.','A verdadeira fluidez aparece quando pensamentos e palavras chegam à tela sem interrupções desnecessárias.','Precisão, velocidade e conforto formam a base de uma digitação eficiente e sustentável.']]
];

const uniq=s=>[...new Set([...s].filter(c=>c!==' '))];
const wordsText=(pool,count,off)=>Array.from({length:count},(_,i)=>pool[(off+i)%pool.length]).join(' ');
const practiceText=(keys,mi,li)=>{let chars=uniq(keys);if(mi===1){const p=['fj','dk','sl','aç','gh','asdf','jklç','asdfghjklç'];chars=uniq(p[Math.min(Math.floor((li-1)/3),p.length-1)])}return Array.from({length:12},(_,n)=>{const a=chars[(n+li)%chars.length],b=chars[(n*2+mi)%chars.length],c=chars[(n*3+li+mi)%chars.length];return `${a}${b} ${b}${a} ${a}${c}${b}`}).join(' ')};
const textText=(sentences,words,li)=>!sentences.length?wordsText(words,24,li):Array.from({length:3},(_,i)=>sentences[(li+i)%sentences.length]).join(' ');
const gameKeys=keys=>uniq(keys).filter(k=>!('{}[]()_+=@#$%:'.includes(k))).slice(0,26);

function buildLessons(){
  const out=[];
  moduleData.forEach((m,mi)=>{const [name,keys,words,sentences]=m;for(let li=1;li<=25;li++){
    let mode='practice';if(li===10||li===20)mode='game';else if(mi>=5&&(li===12||li===24))mode='fluency';else if(mi>=5&&(li===7||li===17||li===23))mode='text';else if(li===5||li===15||li===25)mode='words';
    const base={mode,module:`Módulo ${mi+1} de 18 • ${name}`};
    if(mode==='game')out.push({...base,title:`Desafio de reflexo ${li}`,desc:'Pressione a tecla mostrada o mais rápido possível sem perder a posição das mãos.',keys:gameKeys(keys),rounds:24+Math.min(mi*2,26),tip:'Tente aumentar o combo sem olhar para o teclado.'});
    else if(mode==='fluency'){const duration=mi<10?30:mi<15?45:60;out.push({...base,title:`Teste de fluidez ${li}`,desc:`Teste de ${duration} segundos para medir ritmo, velocidade e precisão.`,duration,text:(textText(sentences,words,li)+' ').repeat(7),tip:'Comece em um ritmo confortável e mantenha a regularidade até o final.'})}
    else if(mode==='text')out.push({...base,title:`Texto contínuo ${li}`,desc:'Digite um texto completo para desenvolver leitura antecipada e fluidez.',text:textText(sentences,words,li),tip:'Leia um pouco à frente enquanto continua digitando.'});
    else if(mode==='words')out.push({...base,title:`Palavras em ritmo ${li}`,desc:'Treine palavras em sequência mantendo a técnica correta.',text:wordsText(words,mi<8?20:24,li),tip:'Priorize precisão e movimentos curtos.'});
    else out.push({...base,title:`Treino técnico ${li}`,desc:'Treino progressivo para fortalecer a memória muscular e reduzir erros.',text:practiceText(keys,mi,li),tip:'Use F e J como referência e evite olhar para o teclado.'});
  }});

  const mod='Módulo 1 de 18 • Fundamentos F e J';
  const custom=[
    ['F e J — Indicadores','Comece pelas duas teclas-guia do teclado.','f j f j ff jj fj jf fff jjj fjfj jfjf f j f j fj jf','Sinta as marcas em relevo de F e J.'],
    ['D e K — Dedos médios','Acrescente D e K mantendo os indicadores em F e J.','d k d k dd kk dk kd fd jk df kj f d j k fdjk dfkj','D usa o médio esquerdo e K usa o médio direito.'],
    ['S e L — Anelares','Agora entram S e L com os dedos anelares.','s l s l ss ll sl ls ds kl fs jl sd lk s d f j k l','Mova apenas o dedo necessário.'],
    ['A e Ç — Dedos mínimos','Complete a posição de repouso com A e Ç.','a ç a ç aa çç aç ça as lç ad kç asdf jklç asdf jklç','A base completa é A S D F — J K L Ç.'],
    ['Primeiras combinações','Misture os oito dedos da fileira central em blocos curtos.','asdf jklç asdf jklç fdsa çlkj asdf fdsa jklç çlkj','Mantenha os dedos apoiados na fileira de repouso.'],
    ['Alternando as mãos','Troque de mão a cada toque para criar coordenação.','a ç s l d k f j a l s k d j f ç f j d k s l a ç','Pense esquerda, direita, esquerda, direita.'],
    ['Escada da base','Suba e desça a fileira central como uma escada.','a s d f j k l ç ç l k j f d s a asdf jklç fdsa çlkj','Faça o movimento fluido, sem correr.'],
    ['Espelho das mãos','Treine padrões espelhados entre a mão esquerda e a direita.','aç sl dk fj fj dk sl aç asdf jklç açsl dkfj fjdk slça','Observe como os dedos correspondentes trabalham juntos.'],
    ['Saltos de dedos','Alterne dedos distantes para fortalecer a memória muscular.','a f ç j s g l h d a k ç f s j l a d ç k s f l j','Não mova a mão inteira para alcançar a tecla.'],
    null,
    ['Ritmo em blocos','Digite blocos diferentes e mantenha o mesmo ritmo.','as jk df lç sa kj fd çl ad jç sf kl da çj fs lk','Tente ouvir um ritmo constante nos toques.'],
    ['Extremos e centro','Misture mínimos, indicadores e dedos médios.','a ç f j d k s l a f ç j s d l k f a j ç d s k l','Volte sempre para a posição inicial.'],
    ['Cruza e volta','Faça cruzamentos de padrões sem perder o posicionamento.','af jç sd kl da kj fs lç as jl df kç fa çj ds lk','Precisão primeiro; a velocidade vem depois.'],
    ['Sequência crescente','Comece curto e aumente o tamanho dos blocos.','fj dk sl aç fjdk sl aç asdf jklç asdfjklç çlkjfdsa','Mantenha os pulsos relaxados.'],
    ['Palavras da base','Use combinações que já começam a parecer palavras.','sala fala fada gala salsa falha dada asas alada salada sala fala fada gala salsa falha','Leia a palavra inteira antes de terminar de digitá-la.'],
    ['Palavras cruzadas','Misture palavras curtas e mudanças rápidas entre as mãos.','fala sala gala fada falha salsa alada salada dadas asas fala gala sala fada','Evite olhar para o teclado mesmo nas trocas rápidas.'],
    ['Ritmo contínuo','Treine sequências longas sem interromper o fluxo.','asdf jklç fdsa çlkj afjç sdk lçfa jdas asdfjklç jklçasdf fdsaçlkj','Procure manter a mesma cadência do começo ao fim.'],
    ['Precisão sem olhar','Combinações imprevisíveis usando toda a fileira central.','f a j ç d l s k g h f j a ç s l d k h g j f ç a k d','Use F e J para se reencontrar sem olhar.'],
    ['Desafio misto da base','Feche a preparação com palavras, blocos e saltos.','asdf jklç sala fala fdsa çlkj falha salsa af jç sd kl salada dada fj dk aç sl','Aqui vale coordenação e regularidade, não só velocidade.']
  ];
  custom.forEach((c,i)=>{if(!c)return;out[i]={mode:(i===14||i===15)?'words':'practice',module:mod,title:c[0],desc:c[1],text:c[2],tip:c[3]}});
  return out;
}
const lessons=buildLessons();

const saved={completed:{},best:{},unlocked:0};
let user=null;
let state={lesson:0,typed:'',errors:0,startedAt:null,timer:null,finished:false,round:0,hits:0,misses:0,combo:0,bestCombo:0,target:null};

const rows=[['1','2','3','4','5','6','7','8','9','0','-','='],['Tab','q','w','e','r','t','y','u','i','o','p','´','['],['Caps','a','s','d','f','g','h','j','k','l','ç','~',']'],['Shift','z','x','c','v','b','n','m',',','.',';','/','Shift'],['Espaço']];
const fingerMap={a:'LP',q:'LP',z:'LP','1':'LP',s:'LR',w:'LR',x:'LR','2':'LR',d:'LM',e:'LM',c:'LM','3':'LM',f:'LI',g:'LI',r:'LI',t:'LI',v:'LI',b:'LI','4':'LI','5':'LI',j:'RI',h:'RI',u:'RI',y:'RI',n:'RI',m:'RI','6':'RI','7':'RI',k:'RM',i:'RM',',':'RM','8':'RM',l:'RR',o:'RR','.':'RR','9':'RR',ç:'RP',p:'RP',';':'RP','/':'RP','0':'RP',' ':'RT'};
const fingerNames={LP:'mínimo esquerdo',LR:'anelar esquerdo',LM:'médio esquerdo',LI:'indicador esquerdo',RI:'indicador direito',RM:'médio direito',RR:'anelar direito',RP:'mínimo direito',RT:'polegar'};
const accentBase=c=>{c=(c||'').toLowerCase();if('áàâãä'.includes(c))return'a';if('éèêë'.includes(c))return'e';if('íìîï'.includes(c))return'i';if('óòôõö'.includes(c))return'o';if('úùûü'.includes(c))return'u';return c};

function buildKeyboard(){els.keyboard.innerHTML='';rows.forEach(row=>{const r=document.createElement('div');r.className='key-row';row.forEach(k=>{const e=document.createElement('div');e.className='key'+(['Tab','Caps','Shift'].includes(k)?' wide':'')+(k==='Espaço'?' space':'');e.dataset.key=k.toLowerCase();e.textContent=k;r.appendChild(e)});els.keyboard.appendChild(r)});const mk=(side,target)=>{const names=side==='left'?['Mín.','Anel.','Médio','Indic.','Polegar']:['Polegar','Indic.','Médio','Anel.','Mín.'];target.innerHTML='';names.forEach((n,i)=>{const f=document.createElement('div');f.className='finger';f.textContent=n;f.dataset.code=side==='left'?['LP','LR','LM','LI','LT'][i]:['RT','RI','RM','RR','RP'][i];target.appendChild(f)})};mk('left',els.leftHand);mk('right',els.rightHand);installSoundToggle()}
function highlightTarget(char){document.querySelectorAll('.key.target,.finger.target').forEach(e=>e.classList.remove('target'));if(!char){els.nextKey.textContent='—';return}const lookup=char===' '?' ':accentBase(char);const key=char===' '?'espaço':lookup;const keyEl=document.querySelector(`.key[data-key="${CSS.escape(key)}"]`);if(keyEl)keyEl.classList.add('target');const code=fingerMap[lookup];const finger=document.querySelector(`.finger[data-code="${code}"]`);if(finger)finger.classList.add('target');els.nextKey.textContent=char===' '?'ESPAÇO':char.toUpperCase();els.fingerHint.textContent=fingerNames[code]||'Tecla especial'}
function current(){return lessons[state.lesson]}
function isGame(){return current().mode==='game'}
function isFluency(){return current().mode==='fluency'}
function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function renderText(){const text=current().text||'';let h='';for(let i=0;i<text.length;i++){let cls='char';if(i<state.typed.length)cls+=state.typed[i]===text[i]?' correct':' wrong';else if(i===state.typed.length)cls+=' current';h+=`<span class="${cls}">${text[i]===' '?'&nbsp;':escapeHtml(text[i])}</span>`}els.typingBox.innerHTML=h;els.lessonProgress.style.width=`${Math.min(100,Math.round(state.typed.length/text.length*100))}%`;highlightTarget(text[state.typed.length])}
function stats(){const elapsed=state.startedAt?Math.max((Date.now()-state.startedAt)/60000,1/600):0;if(isGame()){const tries=state.hits+state.misses;return{wpm:elapsed?Math.round(state.hits/elapsed):0,acc:tries?Math.round(state.hits/tries*100):100}}const text=current().text||'';let correct=0;for(let i=0;i<state.typed.length;i++)if(state.typed[i]===text[i])correct++;return{wpm:elapsed?Math.round((correct/5)/elapsed):0,acc:state.typed.length?Math.round(correct/state.typed.length*100):100}}
function updateStats(){const s=stats();els.wpm.textContent=s.wpm;els.accuracy.textContent=s.acc;els.errors.textContent=state.errors;if(state.startedAt&&!isFluency()){const sec=Math.floor((Date.now()-state.startedAt)/1000);els.time.textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`}}
function rankFor(acc,wpm,mode,bestCombo=0){if(mode==='game'){if(acc>=88&&bestCombo>=8)return'gold';if(acc>=78&&bestCombo>=5)return'silver';if(acc>=65)return'bronze';return'training'}let silverAcc=82,silverSpeed=7,goldAcc=90,goldSpeed=10;if(mode==='words'){silverAcc=85;silverSpeed=11;goldAcc=92;goldSpeed=16}if(mode==='text'){silverAcc=85;silverSpeed=12;goldAcc=92;goldSpeed=18}if(mode==='fluency'){silverAcc=88;silverSpeed=17;goldAcc=94;goldSpeed=24}if(acc>=goldAcc&&wpm>=goldSpeed)return'gold';if(acc>=silverAcc&&wpm>=silverSpeed)return'silver';if(acc>=70)return'bronze';return'training'}
const rankLabel=r=>({gold:'🥇 Ouro',silver:'🥈 Prata',bronze:'🥉 Bronze',training:'Em treino'}[r]);
const rankScore=r=>({training:0,bronze:1,silver:2,gold:3}[r]||0);
const starsFor=rank=>Math.max(0,rankScore(rank));

function renderList(){els.lessonList.innerHTML='';lessons.forEach((l,i)=>{const info=saved.completed[i],completed=!!info,currentUnlocked=i===saved.unlocked&&!completed;if(!completed&&!currentUnlocked&&i!==state.lesson)return;const b=document.createElement('button');b.className='lesson-item'+(i===state.lesson?' active':'');const stars=info?'★'.repeat(info.stars||0)+'☆'.repeat(3-(info.stars||0)):'☆☆☆';b.innerHTML=`<span class="lesson-num">${completed?'✓':i+1}</span><span class="lesson-copy"><strong>${i+1}. ${l.title}</strong><small>${completed?'Concluída':'Fase atual'} · ${l.mode==='game'?'Jogo':l.mode==='fluency'?'Teste':l.mode==='text'?'Texto':l.mode==='words'?'Palavras':'Treino'}</small><span class="lesson-stars">${stars}</span></span>`;b.onclick=()=>loadLesson(i);els.lessonList.appendChild(b)});updateGlobal()}
function updateGlobal(){const done=Object.keys(saved.completed).length;els.doneCount.textContent=`${done}/${lessons.length}`;els.globalProgress.textContent=`${Math.round(done/lessons.length*100)}%`;els.goldCount.textContent=Object.values(saved.completed).filter(x=>x.rank==='gold').length;els.moduleLabel.textContent=`Módulo ${Math.floor(state.lesson/25)+1}/18`}
function setCloud(text,type='busy'){els.cloudStatus.textContent=text;els.cloudStatus.className=type==='ok'?'cloud-ok':type==='error'?'cloud-error':'cloud-busy'}
async function saveCloud(){if(!user)return;setCloud('Salvando...');try{await setDoc(doc(db,'users',user.uid),{email:user.email||'',name:user.displayName||els.studentName.textContent,digitacao:{completed:saved.completed,best:saved.best,unlocked:saved.unlocked},updatedAt:serverTimestamp()},{merge:true});setCloud('Salvo ✓','ok')}catch(e){console.error(e);setCloud('Erro','error')}}

function loadLesson(i){clearInterval(state.timer);state={lesson:i,typed:'',errors:0,startedAt:null,timer:null,finished:false,round:0,hits:0,misses:0,combo:0,bestCombo:0,target:null};const l=current();els.lessonModule.textContent=l.module;els.lessonTitle.textContent=`Fase ${i+1}: ${l.title}`;els.lessonDesc.textContent=l.desc;els.tipText.textContent=l.tip;els.finishCard.classList.add('hidden');els.time.textContent=isFluency()?`00:${String(l.duration).padStart(2,'0')}`:'00:00';els.wpm.textContent='0';els.accuracy.textContent='100';els.errors.textContent='0';els.lessonProgress.style.width='0%';if(isGame()){els.typingPanel.classList.add('hidden');els.gamePanel.classList.remove('hidden');startGame()}else{els.gamePanel.classList.add('hidden');els.typingPanel.classList.remove('hidden');renderText();setTimeout(()=>els.typingBox.focus(),80)}renderList()}
function startTimer(){if(state.startedAt)return;state.startedAt=Date.now();if(isFluency()){const dur=current().duration;state.timer=setInterval(()=>{const elapsed=(Date.now()-state.startedAt)/1000,remain=Math.max(0,Math.ceil(dur-elapsed));els.time.textContent=`00:${String(remain).padStart(2,'0')}`;updateStats();if(elapsed>=dur)finishTyping()},150)}else state.timer=setInterval(updateStats,250)}
function pressVisual(k){const key=k===' '?'espaço':k.toLowerCase();const el=document.querySelector(`.key[data-key="${CSS.escape(key)}"]`);if(el){el.classList.add('press');setTimeout(()=>el.classList.remove('press'),100)}}

els.typingBox.addEventListener('keydown',e=>{if(state.finished||isGame())return;if(['Tab','CapsLock'].includes(e.key)){e.preventDefault();return}if(e.key==='Backspace'){e.preventDefault();playKeySound(.7);state.typed=state.typed.slice(0,-1);renderText();updateStats();return}if(e.key.length!==1)return;e.preventDefault();startTimer();const text=current().text,correct=e.key===text[state.typed.length];if(!correct)state.errors++;state.typed+=e.key;playKeySound(correct?1:.8);pressVisual(e.key);renderText();updateStats();if(!isFluency()&&state.typed.length>=text.length)finishTyping()});

function pickTarget(){const keys=current().keys;let next=keys[Math.floor(Math.random()*keys.length)];if(keys.length>1&&next===state.target)next=keys[(keys.indexOf(next)+1)%keys.length];state.target=next;els.gameTarget.textContent=next.toUpperCase();highlightTarget(next)}
function startGame(){state.startedAt=Date.now();state.timer=setInterval(updateStats,250);pickTarget();els.gameHits.textContent='0';els.gameMisses.textContent='0';els.gameCombo.textContent='0';setTimeout(()=>els.gamePanel.focus(),80)}
function gameKey(e){if(!isGame()||state.finished||e.key.length!==1)return;e.preventDefault();state.round++;const ok=e.key.toLowerCase()===state.target.toLowerCase();if(ok){state.hits++;state.combo++;state.bestCombo=Math.max(state.bestCombo,state.combo)}else{state.misses++;state.errors++;state.combo=0}playKeySound(ok?1:.8);els.gameHits.textContent=state.hits;els.gameMisses.textContent=state.misses;els.gameCombo.textContent=state.combo;els.lessonProgress.style.width=`${Math.round(state.round/current().rounds*100)}%`;pressVisual(e.key);updateStats();if(state.round>=current().rounds)finishGame();else pickTarget()}
document.addEventListener('keydown',gameKey);

function launchCelebration(){els.celebration.innerHTML='';for(let i=0;i<55;i++){const c=document.createElement('span');c.className='confetti';c.textContent=['★','●','◆','✦'][Math.floor(Math.random()*4)];c.style.left=`${Math.random()*100}%`;c.style.animationDelay=`${Math.random()*.45}s`;c.style.color=`hsl(${Math.floor(Math.random()*360)} 80% 65%)`;els.celebration.appendChild(c)}setTimeout(()=>els.celebration.innerHTML='',2200)}
function keepBest(index,result){const old=saved.completed[index];if(!old)return result;const oldScore=rankScore(old.rank)*100000+(old.acc||0)*100+(old.wpm||0),newScore=rankScore(result.rank)*100000+result.acc*100+result.wpm;return newScore>=oldScore?result:old}
async function complete(result){saved.completed[state.lesson]=keepBest(state.lesson,result);saved.best[state.lesson]=Math.max(saved.best[state.lesson]||0,result.wpm||0);if(state.lesson<lessons.length-1)saved.unlocked=Math.max(saved.unlocked,state.lesson+1);await saveCloud();els.finishStars.textContent='★'.repeat(result.stars)+'☆'.repeat(3-result.stars);els.finishText.innerHTML=result.text;els.finishRank.textContent=rankLabel(result.rank);els.finishCard.classList.remove('hidden');els.nextBtn.classList.toggle('hidden',state.lesson===lessons.length-1);renderList();launchCelebration();setTimeout(()=>els.finishCard.scrollIntoView({behavior:'smooth',block:'center'}),200)}
function finishTyping(){if(state.finished)return;state.finished=true;clearInterval(state.timer);const s=stats(),rank=rankFor(s.acc,s.wpm,current().mode),stars=starsFor(rank);complete({wpm:s.wpm,acc:s.acc,rank,stars,text:`<b>${s.wpm} PPM</b> · <b>${s.acc}% de precisão</b> · <b>${state.errors} erro${state.errors===1?'':'s'}</b>`})}
function finishGame(){if(state.finished)return;state.finished=true;clearInterval(state.timer);const s=stats(),rank=rankFor(s.acc,s.wpm,'game',state.bestCombo),stars=starsFor(rank);complete({wpm:s.wpm,acc:s.acc,rank,stars,bestCombo:state.bestCombo,text:`<b>${state.hits} acertos</b> · <b>${s.acc}% de precisão</b> · combo máximo <b>${state.bestCombo}</b>`})}

els.resetBtn.onclick=()=>loadLesson(state.lesson);els.retryBtn.onclick=()=>loadLesson(state.lesson);els.nextBtn.onclick=()=>loadLesson(Math.min(state.lesson+1,lessons.length-1));els.logoutBtn.onclick=()=>signOut(auth);
function authMsg(t,type=''){els.authMessage.textContent=t;els.authMessage.className='auth-message'+(type?` ${type}`:'')}
function friendly(e){const m={'auth/invalid-credential':'E-mail ou senha incorretos.','auth/invalid-email':'Digite um e-mail válido.','auth/email-already-in-use':'Este e-mail já possui uma conta.','auth/weak-password':'A senha precisa ter pelo menos 6 caracteres.','auth/operation-not-allowed':'O login por e-mail ainda precisa ser ativado no Firebase. Use o Google por enquanto.','auth/popup-closed-by-user':'Login com Google cancelado.','auth/popup-blocked':'Permita pop-ups para entrar com Google.','auth/unauthorized-domain':'Este domínio precisa ser autorizado no Firebase Authentication.','auth/too-many-requests':'Muitas tentativas. Tente novamente mais tarde.'};return m[e?.code]||e?.message||'Não foi possível concluir.'}
els.loginBtn.onclick=async()=>{try{authMsg('Entrando...');await signInWithEmailAndPassword(auth,els.email.value.trim(),els.password.value)}catch(e){authMsg(friendly(e),'error')}};
els.createBtn.onclick=async()=>{const name=els.name.value.trim(),email=els.email.value.trim(),pass=els.password.value;if(!name){authMsg('Digite o nome do aluno.','error');return}try{authMsg('Criando conta...');const cred=await createUserWithEmailAndPassword(auth,email,pass);await updateProfile(cred.user,{displayName:name});await setDoc(doc(db,'users',cred.user.uid),{name,email,digitacao:{completed:{},best:{},unlocked:0},createdAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true});authMsg('Conta criada.','ok')}catch(e){authMsg(friendly(e),'error')}};
els.googleBtn.onclick=async()=>{try{authMsg('Abrindo Google...');const p=new GoogleAuthProvider();p.setCustomParameters({prompt:'select_account'});await signInWithPopup(auth,p)}catch(e){authMsg(friendly(e),'error')}};
els.resetPasswordBtn.onclick=async()=>{const email=els.email.value.trim();if(!email){authMsg('Digite seu e-mail primeiro.','error');return}try{await sendPasswordResetEmail(auth,email);authMsg('Link de redefinição enviado.','ok')}catch(e){authMsg(friendly(e),'error')}};

onAuthStateChanged(auth,async u=>{user=u;if(!u){clearInterval(state.timer);els.app.classList.add('hidden');els.authGate.classList.remove('hidden');return}try{authMsg('Carregando progresso...');const ref=doc(db,'users',u.uid),snap=await getDoc(ref),data=snap.exists()?snap.data():{};const d=data.digitacao||{};saved.completed=d.completed||{};saved.best=d.best||{};saved.unlocked=Number.isFinite(d.unlocked)?d.unlocked:0;const name=data.name||u.displayName||u.email?.split('@')[0]||'Aluno';await setDoc(ref,{name,email:u.email||'',digitacao:{completed:saved.completed,best:saved.best,unlocked:saved.unlocked},updatedAt:serverTimestamp(),...(snap.exists()?{}:{createdAt:serverTimestamp()})},{merge:true});els.studentName.textContent=name;els.studentEmail.textContent=u.email||'';els.authGate.classList.add('hidden');els.app.classList.remove('hidden');setCloud('Salvo ✓','ok');buildKeyboard();loadLesson(Math.min(saved.unlocked,lessons.length-1));authMsg('')}catch(e){console.error(e);authMsg('Login funcionou, mas o progresso não pôde ser carregado.','error')}});