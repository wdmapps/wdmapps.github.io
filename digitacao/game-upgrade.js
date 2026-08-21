// WDM Digitação — jogos especiais v2
(() => {
  'use strict';

  const STYLE_ID = 'wdm-game-upgrade-style';
  const WRONG_KEY = '§';

  const css = `
  .game-panel.wdm-game-upgraded{position:relative;overflow:hidden;min-height:390px;padding:22px;border:1px solid rgba(78,161,255,.28);background:radial-gradient(circle at 50% 40%,rgba(78,161,255,.12),transparent 40%),linear-gradient(180deg,#0d1b2d,#091321);isolation:isolate}
  .game-panel.wdm-game-upgraded:before{content:"";position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:28px 28px;mask-image:linear-gradient(to bottom,black,transparent 85%);z-index:-1}
  .wdm-game-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px}
  .wdm-game-name{font-weight:900;font-size:18px;letter-spacing:.2px}
  .wdm-game-level{font-size:12px;color:#a9bdd4;padding:6px 9px;border:1px solid rgba(255,255,255,.08);border-radius:999px;background:rgba(0,0,0,.18)}
  .wdm-game-hud{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0 12px}
  .wdm-game-chip{padding:8px 10px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(7,16,29,.72);text-align:center}
  .wdm-game-chip span{display:block;color:#8fa7bf;font-size:10px;text-transform:uppercase;letter-spacing:.7px}.wdm-game-chip b{font-size:17px}
  .wdm-time-track,.wdm-boss-track{height:8px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;margin:8px 0 14px}
  .wdm-time-bar,.wdm-boss-bar{height:100%;width:100%;border-radius:inherit;transform-origin:left center;transition:width .08s linear}
  .wdm-time-bar{background:linear-gradient(90deg,#42d392,#ffd166,#ff6b6b)}
  .wdm-boss-track{display:none;height:12px;margin-top:6px}.wdm-boss-bar{background:linear-gradient(90deg,#ff6b6b,#ffd166)}
  .wdm-game-boss .wdm-boss-track{display:block}
  .wdm-game-arena{position:relative;min-height:220px;margin:10px 0 12px;border:1px solid rgba(255,255,255,.07);border-radius:18px;background:radial-gradient(circle at center,rgba(255,255,255,.035),rgba(0,0,0,.14));overflow:hidden;display:grid;place-items:center}
  .wdm-game-arena:after{content:"";position:absolute;inset:auto 0 0;height:38px;background:linear-gradient(transparent,rgba(66,211,146,.07));pointer-events:none}
  .game-panel.wdm-game-upgraded .game-target{position:relative;z-index:2;width:92px;height:92px;display:grid;place-items:center;margin:0;border-radius:24px;font-size:48px;font-weight:950;line-height:1;background:linear-gradient(145deg,#173454,#10243b);border:2px solid rgba(78,161,255,.5);box-shadow:0 16px 42px rgba(0,0,0,.35),inset 0 0 24px rgba(78,161,255,.08);text-transform:uppercase;user-select:none}
  .wdm-game-instruction{margin:7px 0 10px!important;text-align:center;color:#bed0e2}
  .wdm-game-hunt .game-target{animation:wdmHuntPulse .75s ease-in-out infinite alternate}
  .game-panel.wdm-game-upgraded.wdm-game-balloon .game-target{position:absolute;width:104px;height:118px;border-radius:50% 50% 48% 48%;background:radial-gradient(circle at 35% 25%,#fff7,transparent 13%),linear-gradient(145deg,#ff7eb3,#8a5cff);border-color:#ffc3df;box-shadow:0 18px 42px rgba(138,92,255,.28);left:var(--wdm-x,45%);transform:translateX(-50%);animation:wdmBalloonRise var(--wdm-limit,2800ms) linear forwards;will-change:bottom,transform}
  .game-panel.wdm-game-upgraded.wdm-game-balloon .game-target:after{content:"";position:absolute;bottom:-12px;width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:14px solid #8a5cff}
  .game-panel.wdm-game-upgraded.wdm-game-rain .game-target{position:absolute;left:var(--wdm-x,45%);transform:translateX(-50%);animation:wdmRainFall var(--wdm-limit,2600ms) linear forwards;background:linear-gradient(145deg,#245b8e,#12395e);border-color:#69b7ff;will-change:top,transform}
  .wdm-game-boss .wdm-game-arena{background:radial-gradient(circle at center,rgba(255,88,88,.18),transparent 32%),radial-gradient(circle at center,#152033,#08101d 70%)}
  .wdm-game-boss .game-target{width:126px;height:126px;border-radius:50%;background:radial-gradient(circle at 50% 45%,#ffcc66 0 8%,#ff695e 9% 20%,#591c39 21% 39%,#111d31 40% 100%);border:3px solid #ffbf66;color:#fff;box-shadow:0 0 0 12px rgba(255,105,94,.06),0 0 52px rgba(255,105,94,.35);animation:wdmBossCore .55s ease-in-out infinite alternate}
  .wdm-game-boss .game-target:before{content:"CHEFE";position:absolute;top:-34px;font-size:10px;letter-spacing:2px;color:#ffbf66}
  .wdm-hit-flash{animation:wdmHitFlash .22s ease-out}.wdm-miss-flash{animation:wdmMissFlash .3s ease-out}
  .wdm-pop{animation:wdmPop .22s ease-out!important}
  @keyframes wdmHuntPulse{from{transform:scale(.94);box-shadow:0 10px 30px rgba(0,0,0,.3),0 0 0 0 rgba(78,161,255,.28)}to{transform:scale(1.06);box-shadow:0 16px 44px rgba(0,0,0,.38),0 0 0 14px rgba(78,161,255,0)}}
  @keyframes wdmBalloonRise{from{bottom:-132px;transform:translateX(-50%) rotate(-4deg)}35%{transform:translateX(-50%) rotate(5deg)}70%{transform:translateX(-50%) rotate(-3deg)}to{bottom:112%;transform:translateX(-50%) rotate(3deg)}}
  @keyframes wdmRainFall{from{top:-105px;transform:translateX(-50%) rotate(-3deg)}to{top:calc(100% + 20px);transform:translateX(-50%) rotate(4deg)}}
  @keyframes wdmBossCore{from{transform:scale(.97) rotate(-1deg);filter:brightness(.92)}to{transform:scale(1.04) rotate(1deg);filter:brightness(1.18)}}
  @keyframes wdmHitFlash{0%{box-shadow:inset 0 0 0 0 rgba(66,211,146,0)}35%{box-shadow:inset 0 0 80px 10px rgba(66,211,146,.24)}100%{box-shadow:inset 0 0 0 0 rgba(66,211,146,0)}}
  @keyframes wdmMissFlash{0%{box-shadow:inset 0 0 0 0 rgba(255,107,107,0)}35%{box-shadow:inset 0 0 90px 14px rgba(255,107,107,.24)}100%{box-shadow:inset 0 0 0 0 rgba(255,107,107,0)}}
  @keyframes wdmPop{0%{transform:scale(1)}45%{transform:scale(1.32)}100%{transform:scale(.86);opacity:.6}}
  @media(max-width:760px){.game-panel.wdm-game-upgraded{min-height:360px;padding:16px}.wdm-game-hud{grid-template-columns:1fr 1fr 1fr}.wdm-game-arena{min-height:200px}.game-panel.wdm-game-upgraded .game-target{width:82px;height:82px;font-size:42px}.wdm-game-boss .game-target{width:110px;height:110px}}
  @media(prefers-reduced-motion:reduce){.wdm-game-upgraded *{animation-duration:.01ms!important;animation-iteration-count:1!important}}
  `;

  function installStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style');s.id=STYLE_ID;s.textContent=css;document.head.appendChild(s);
  }

  function init(){
    installStyle();
    const panel=document.getElementById('gamePanel');
    const target=document.getElementById('gameTarget');
    const title=document.getElementById('lessonTitle');
    const desc=document.getElementById('lessonDesc');
    const hits=document.getElementById('gameHits');
    const misses=document.getElementById('gameMisses');
    const combo=document.getElementById('gameCombo');
    const lessonProgress=document.getElementById('lessonProgress');
    const finishCard=document.getElementById('finishCard');
    if(!panel||!target||!title||!hits||!misses||!combo||!lessonProgress) return;

    let active=false,phase=0,theme=null,timeoutId=0,rafId=0,deadline=0,token=0;
    let topEl,hudScore,hudCombo,hudClock,timeBar,bossBar,arena,instruction;

    function phaseFromTitle(){const m=title.textContent.match(/Fase\s+(\d+)/i);return m?Number(m[1]):0}
    function isVisible(){return !panel.classList.contains('hidden')}
    function gameIndexFor(p){const mod=Math.floor((p-1)/25),within=((p-1)%25)+1;return mod*2+(within>=20?1:0)}
    function themeFor(p){
      const gi=gameIndexFor(p),tier=Math.floor(gi/4),kind=gi%4;
      const base=[
        {key:'hunt',name:'🎯 Caça-Teclas',desc:'Acerte a tecla antes que o tempo acabe. Cada acerto mantém o combo vivo.',limit:2500},
        {key:'balloon',name:'🎈 Balão das Letras',desc:'Estoure o balão digitando a letra antes que ele escape pelo alto.',limit:3000},
        {key:'rain',name:'🌧️ Chuva de Letras',desc:'Digite a letra antes que ela toque o chão. Não deixe a chuva vencer.',limit:2800},
        {key:'boss',name:'👾 CHEFE — Núcleo do Teclado',desc:'Ataque o núcleo com as teclas corretas. Aqui a reação precisa ser rápida.',limit:2000}
      ][kind];
      const reduction=tier*(kind==='boss'?80:110);
      return {...base,gi,tier,limit:Math.max(kind==='boss'?1100:1350,base.limit-reduction)};
    }

    function buildUI(){
      if(panel.dataset.wdmUpgraded==='1'){
        topEl=document.getElementById('wdmGameTop');hudScore=document.getElementById('wdmGameScore');hudCombo=document.getElementById('wdmGameCombo');hudClock=document.getElementById('wdmGameClock');timeBar=document.getElementById('wdmGameTimeBar');bossBar=document.getElementById('wdmBossBar');arena=document.getElementById('wdmGameArena');instruction=panel.querySelector('.wdm-game-instruction');return;
      }
      panel.dataset.wdmUpgraded='1';panel.classList.add('wdm-game-upgraded');
      const oldKicker=panel.querySelector('.kicker');if(oldKicker)oldKicker.textContent='JOGO ESPECIAL';
      topEl=document.createElement('div');topEl.id='wdmGameTop';topEl.className='wdm-game-top';
      topEl.innerHTML='<div class="wdm-game-name" id="wdmGameName">Jogo</div><div class="wdm-game-level" id="wdmGameLevel">Nível</div>';
      panel.insertBefore(topEl,target);
      const hud=document.createElement('div');hud.className='wdm-game-hud';hud.innerHTML='<div class="wdm-game-chip"><span>Pontos</span><b id="wdmGameScore">0</b></div><div class="wdm-game-chip"><span>Combo</span><b id="wdmGameCombo">0x</b></div><div class="wdm-game-chip"><span>Tempo</span><b id="wdmGameClock">0.0s</b></div>';
      topEl.insertAdjacentElement('afterend',hud);
      const track=document.createElement('div');track.className='wdm-time-track';track.innerHTML='<div id="wdmGameTimeBar" class="wdm-time-bar"></div>';hud.insertAdjacentElement('afterend',track);
      const bossTrack=document.createElement('div');bossTrack.className='wdm-boss-track';bossTrack.innerHTML='<div id="wdmBossBar" class="wdm-boss-bar"></div>';track.insertAdjacentElement('afterend',bossTrack);
      arena=document.createElement('div');arena.id='wdmGameArena';arena.className='wdm-game-arena';bossTrack.insertAdjacentElement('afterend',arena);arena.appendChild(target);
      instruction=panel.querySelector('p');if(instruction)instruction.classList.add('wdm-game-instruction');
      hudScore=document.getElementById('wdmGameScore');hudCombo=document.getElementById('wdmGameCombo');hudClock=document.getElementById('wdmGameClock');timeBar=document.getElementById('wdmGameTimeBar');bossBar=document.getElementById('wdmBossBar');
    }

    function clearTimers(){clearTimeout(timeoutId);cancelAnimationFrame(rafId);timeoutId=0;rafId=0}
    function markPanel(cls){panel.classList.remove('wdm-hit-flash','wdm-miss-flash');void panel.offsetWidth;panel.classList.add(cls);setTimeout(()=>panel.classList.remove(cls),320)}
    function progressNumber(){const n=parseFloat(lessonProgress.style.width||'0');return Number.isFinite(n)?Math.max(0,Math.min(100,n)):0}
    function updateHud(){
      if(!active)return;
      const h=Number(hits.textContent)||0,m=Number(misses.textContent)||0,c=Number(combo.textContent)||0;
      if(hudScore)hudScore.textContent=String(h*100+c*25);
      if(hudCombo)hudCombo.textContent=`${c}x`;
      if(bossBar)bossBar.style.width=`${Math.max(0,100-progressNumber())}%`;
      if(finishCard&&!finishCard.classList.contains('hidden'))clearTimers();
    }
    function wrongKey(){
      if(!active||!isVisible()||(finishCard&&!finishCard.classList.contains('hidden')))return;
      markPanel('wdm-miss-flash');
      panel.focus({preventScroll:true});
      document.dispatchEvent(new KeyboardEvent('keydown',{key:WRONG_KEY,bubbles:true,cancelable:true}));
      setTimeout(updateHud,0);
    }
    function tick(myToken){
      if(!active||myToken!==token)return;
      const remain=Math.max(0,deadline-performance.now());
      const ratio=Math.max(0,Math.min(1,remain/theme.limit));
      if(timeBar)timeBar.style.width=`${ratio*100}%`;
      if(hudClock)hudClock.textContent=`${(remain/1000).toFixed(1)}s`;
      if(remain>0)rafId=requestAnimationFrame(()=>tick(myToken));
    }
    function armTarget(){
      if(!active||!theme||!isVisible())return;
      clearTimers();token++;
      const mine=token;
      const x=12+Math.random()*76;
      target.style.setProperty('--wdm-x',`${x}%`);target.style.setProperty('--wdm-limit',`${theme.limit}ms`);
      target.classList.remove('wdm-pop');
      // Reinicia a animação a cada nova letra. Sem isso, o balão da fase 70 podia ficar parado.
      target.style.animation='none';
      void target.offsetWidth;
      target.style.removeProperty('animation');
      deadline=performance.now()+theme.limit;
      if(timeBar)timeBar.style.width='100%';
      tick(mine);
      timeoutId=setTimeout(()=>{if(active&&mine===token)wrongKey()},theme.limit+30);
      setTimeout(updateHud,0);
    }

    function applyTheme(p){
      buildUI();phase=p;theme=themeFor(p);active=true;clearTimers();
      panel.classList.remove('wdm-game-hunt','wdm-game-balloon','wdm-game-rain','wdm-game-boss');panel.classList.add(`wdm-game-${theme.key}`);
      const name=document.getElementById('wdmGameName'),lev=document.getElementById('wdmGameLevel');
      if(name)name.textContent=theme.name;if(lev)lev.textContent=`Fase ${p} · dificuldade ${theme.tier+1}`;
      if(instruction)instruction.textContent=theme.desc;
      title.textContent=`Fase ${p}: ${theme.name.replace(/^\S+\s/,'')}`;
      if(desc)desc.textContent=theme.desc;
      updateHud();armTarget();
    }

    function deactivate(){active=false;clearTimers();target.style.removeProperty('--wdm-x');target.style.removeProperty('--wdm-limit')}
    function sync(){
      const p=phaseFromTitle();
      if(!isVisible()){deactivate();return}
      if(!p)return;
      if(!active||p!==phase)applyTheme(p);else updateHud();
    }

    new MutationObserver(()=>sync()).observe(panel,{attributes:true,attributeFilter:['class']});
    new MutationObserver(()=>{if(active)armTarget()}).observe(target,{childList:true,characterData:true,subtree:true});
    new MutationObserver(()=>updateHud()).observe(hits,{childList:true,characterData:true,subtree:true});
    new MutationObserver(()=>updateHud()).observe(misses,{childList:true,characterData:true,subtree:true});
    new MutationObserver(()=>updateHud()).observe(combo,{childList:true,characterData:true,subtree:true});
    new MutationObserver(()=>updateHud()).observe(lessonProgress,{attributes:true,attributeFilter:['style']});
    if(finishCard)new MutationObserver(()=>{if(!finishCard.classList.contains('hidden'))clearTimers()}).observe(finishCard,{attributes:true,attributeFilter:['class']});

    document.addEventListener('keydown',e=>{
      if(!active||!e.isTrusted||e.repeat||e.ctrlKey||e.altKey||e.metaKey||e.key.length!==1)return;
      const before=target.textContent.trim().toLowerCase(),ok=e.key.toLowerCase()===before;
      markPanel(ok?'wdm-hit-flash':'wdm-miss-flash');
      if(ok){target.classList.remove('wdm-pop');void target.offsetWidth;target.classList.add('wdm-pop')}
      setTimeout(updateHud,0);
    },true);

    const observer=new MutationObserver(()=>{
      const p=phaseFromTitle();
      if(isVisible()&&p&&p!==phase)applyTheme(p);
      else if(!isVisible())deactivate();
    });
    observer.observe(title,{childList:true,characterData:true,subtree:true});

    setInterval(()=>{if(isVisible())sync();else if(active)deactivate()},600);
    sync();
  }

  if(document.readyState==='complete')init();else window.addEventListener('load',init,{once:true});
})();