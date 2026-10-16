(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('arena'), ctx = canvas.getContext('2d', { alpha: false });
  const W = 1800, H = 1200, TAU = Math.PI * 2, TOTAL_PHASES = 15;
  const sectors = [
    {name:'FERRO-VELHO',boss:'O COMPACTADOR',rgb:[17,29,37],light:'#32cba7',accent:'#9cffe0',label:'FERRO VELHO // 01'},
    {name:'FUNDIÇÃO',boss:'FORNALHA',rgb:[38,25,22],light:'#ff702e',accent:'#ffbc79',label:'FUNDIÇÃO // 02'},
    {name:'NÚCLEO DE RECICLAGEM',boss:'O SENTINELA',rgb:[24,23,42],light:'#9270ff',accent:'#c3b2ff',label:'NÚCLEO // 03'}
  ];
  let sectorIndex = 0;
  const mint = '#9cffe0', orange = '#ff7546';
  let width, height, dpr, scale, ox, oy, state = 'menu', previousState, clock = 0, last = 0;
  let enemies = [], bullets = [], particles = [], pickups = [], marks = [], rings = [], queue = [];
  let wave = 0, waveTotal = 0, kills = 0, score = 0, elapsed = 0, spawnTimer = 0, waveDelay = -1, shake = 0;
  let announcementTimer = 0, toastTimer = 0, soundOn = true, audio, best = 0, upgradeChoices = [], runToken = 0;
  let masterBus, sfxBus, musicBus, noiseBuffer, musicStep = 0, nextBeat = 0;
  let player = makePlayer();
  const keys = new Set(), touch = { x: 0, y: 0, id: null }, pointer = { x: 0, y: 0 };
  const coarse = () => matchMedia('(pointer:coarse)').matches || innerWidth < 700;
  try { best = +localStorage.getItem('sucata-best') || 0; } catch {}
  $('best').textContent = String(best).padStart(5, '0');
  const rand = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const timeString = t => `${Math.floor(t / 60).toString().padStart(2, '0')}:${Math.floor(t % 60).toString().padStart(2, '0')}`;
  const obstacles = [
    { x: 265, y: 330, w: 160, h: 77, kind: 0 }, { x: 1280, y: 315, w: 190, h: 90, kind: 1 },
    { x: 440, y: 865, w: 180, h: 82, kind: 1 }, { x: 1260, y: 850, w: 155, h: 78, kind: 0 },
    { x: 855, y: 300, w: 100, h: 70, kind: 2 }, { x: 880, y: 920, w: 95, h: 68, kind: 2 }
  ];
  const layouts = [obstacles.map(o=>({...o})),
    [{x:330,y:300,w:210,h:80,kind:1},{x:1210,y:300,w:210,h:80,kind:1},{x:330,y:850,w:210,h:80,kind:1},{x:1210,y:850,w:210,h:80,kind:1},{x:780,y:420,w:95,h:68,kind:2},{x:990,y:730,w:95,h:68,kind:2}],
    [{x:300,y:380,w:145,h:85,kind:0},{x:1350,y:710,w:145,h:85,kind:0},{x:740,y:280,w:265,h:75,kind:1},{x:740,y:920,w:265,h:75,kind:1},{x:440,y:820,w:95,h:68,kind:2},{x:1240,y:320,w:95,h:68,kind:2}]
  ];
  function makePlayer() { return { x: 900, y: 620, r: 22, hp: 100, maxHp: 100, speed: 235, damage: 22, fireRate: .26, fireTimer: 0, angle: -.7, moveAngle: 0, dash: 0, dashCooldown: 0, dashMax: 3, invincible: 0, multi: 1, regen: 0, magnet: 140, kills: 0 }; }
  function resize() {
    width = innerWidth; height = innerHeight; dpr = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    scale = Math.max(width / W, height / H);
    if (state !== 'menu') scale = width < 700 ? Math.max(width / 1000, height / 1550) : Math.min((width - 30) / W, (height - 155) / H);
    ox = (width - W * scale) / 2; oy = state === 'menu' ? (height - H * scale) / 2 : 165 + (height - 180 - H * scale) / 2;
  }
  addEventListener('resize', resize); resize();

  // The static floor is cached once; dynamic lights and particles stay inexpensive.
  const floor = document.createElement('canvas'); floor.width = W; floor.height = H;
  const f = floor.getContext('2d');
  let seed = 711;
  function seeded() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  function polygon(c, points, fill, stroke) { c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.stroke(); } }
  function rounded(c, x, y, w, h, r, color, stroke) { c.beginPath(); c.roundRect(x, y, w, h, r); if (color) { c.fillStyle = color; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.stroke(); } }
  function makeFloor() {
    seed = 711 + sectorIndex * 97;
    const theme = sectors[sectorIndex];
    f.fillStyle = '#111c24'; f.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 100) for (let x = 0; x < W; x += 100) {
      f.fillStyle = `rgb(${theme.rgb[0] + seeded() * 6},${theme.rgb[1] + seeded() * 6},${theme.rgb[2] + seeded() * 7})`; f.fillRect(x + 1, y + 1, 98, 98);
      f.strokeStyle = '#25343b'; f.lineWidth = 1; f.strokeRect(x + 4, y + 4, 92, 92);
      f.fillStyle = '#34434a'; for (const a of [[8, 8], [92, 8], [8, 92], [92, 92]]) f.fillRect(x + a[0], y + a[1], 2, 2);
    }
    for (let i = 0; i < 1900; i++) {
      const x = seeded() * W, y = seeded() * H;
      f.strokeStyle = seeded() > .5 ? '#6b7c7b12' : '#00000035'; f.beginPath(); f.moveTo(x, y); f.lineTo(x + seeded() * 35, y - seeded() * 8); f.stroke();
    }
    f.strokeStyle = '#75948f0c'; f.lineWidth = 5; f.beginPath(); f.arc(900, 600, 310, 0, TAU); f.stroke();
    f.beginPath(); f.arc(900, 600, 260, 0, TAU); f.stroke();
    f.setLineDash([12, 22]); f.strokeStyle = '#a8d0bd18'; f.lineWidth = 2; f.strokeRect(130, 160, 1540, 880); f.setLineDash([]);
    f.save(); f.translate(900, 610); f.rotate(-Math.PI / 2); f.font = 'bold 56px Arial'; f.textAlign = 'center'; f.fillStyle = theme.accent+'16'; f.fillText(theme.label, 0, 18); f.restore();
    if(sectorIndex === 1){ for(const y of [190,1000]){f.fillStyle='#120d09';f.fillRect(520,y,720,18);f.fillStyle='#ff773b';f.fillRect(530,y+5,700,5);} }
    if(sectorIndex === 2){ f.strokeStyle='#a383ff35';f.lineWidth=3; for(const x of [240,1560]){f.beginPath();f.moveTo(x,180);f.lineTo(x,1000);f.lineTo(x+(x<900?180:-180),1000);f.stroke();} }
    for (const x of [65, 1710]) { f.fillStyle = '#080f14'; f.fillRect(x, 130, 25, 940); for (let y = 138; y < 1060; y += 14) { f.fillStyle = '#31404a'; f.fillRect(x + 4, y, 17, 5); } }
    for (const y of [90, 1080]) { f.fillStyle = '#090e13'; f.fillRect(90, y, 1620, 26); for (let x = 100; x < 1700; x += 28) polygon(f, [[x, y], [x + 12, y], [x + 27, y + 26], [x + 15, y + 26]], '#947b3a66'); }
    for (let i = 0; i < 90; i++) { const x = seeded() * 1650 + 75, y = seeded() * 960 + 120; if (Math.hypot(x - 900, y - 600) < 180) continue; f.save(); f.translate(x, y); f.rotate(seeded() * TAU); f.fillStyle = '#080f1480'; f.fillRect(-3, -3, 14, 7); f.fillStyle = ['#46514c', '#624d36', '#293b44'][i % 3]; f.fillRect(-5, -5, 13, 6); f.restore(); }
    for (const o of obstacles) drawObstacle(f, o);
  }
  function drawObstacle(c, o) {
    c.fillStyle = '#0007'; c.fillRect(o.x + 10, o.y + 15, o.w, o.h);
    if (o.kind === 2) {
      for (let i = 0; i < 3; i++) { const x = o.x + 17 + i * 29; c.fillStyle = '#0b1217'; c.beginPath(); c.ellipse(x + 4, o.y + 55, 16, 9, 0, 0, TAU); c.fill(); rounded(c, x - 13, o.y, 27, 54, 6, '#584a32', '#7b6742'); c.fillStyle = '#917b49'; c.fillRect(x - 12, o.y + 13, 25, 4); c.fillRect(x - 12, o.y + 37, 25, 4); c.fillStyle = '#c2a35b'; c.fillRect(x - 3, o.y + 22, 7, 8); }
      return;
    }
    const col = o.kind ? '#3c4b4d' : '#41463c';
    rounded(c, o.x, o.y, o.w, o.h, 4, '#1c282c', '#64716a'); rounded(c, o.x, o.y - 12, o.w, o.h, 4, col, '#748078');
    c.fillStyle = '#111d24'; c.fillRect(o.x + 8, o.y, o.w - 16, o.h - 26);
    for (let x = o.x + 14; x < o.x + o.w - 10; x += 14) { c.fillStyle = '#506061'; c.fillRect(x, o.y + 3, 6, o.h - 31); }
    c.fillStyle = '#ab9773'; c.fillRect(o.x + 8, o.y + o.h - 20, 36, 5); c.fillStyle = '#ff7546'; c.fillRect(o.x + o.w - 18, o.y + o.h - 20, 8, 4);
  }
  makeFloor();
  function setSector(index) {
    sectorIndex=index; obstacles.splice(0,obstacles.length,...layouts[index].map(o=>({...o}))); makeFloor();
    $('sectorName').textContent=`0${index+1} / ${sectors[index].name}`;
  }
  function glow(x, y, r, color, alpha = 1) { ctx.save(); ctx.globalAlpha = alpha; const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, color.slice(0, 7) + '00'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore(); }
  function tone(freq, duration, type = 'sine', volume = .04, endFreq = freq) {
    if (!soundOn || !audio) return;
    try { const o = audio.createOscillator(), g = audio.createGain(); o.type = type; o.frequency.setValueAtTime(freq, audio.currentTime); o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), audio.currentTime + duration); g.gain.setValueAtTime(volume, audio.currentTime); g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration); o.connect(g); g.connect(sfxBus || audio.destination); o.start(); o.stop(audio.currentTime + duration); } catch {}
  }
  function startAudio() {
    try {
      if (!audio) {
        audio = new (window.AudioContext || window.webkitAudioContext)();
        masterBus=audio.createGain();masterBus.gain.value=soundOn?.65:0;
        const limiter=audio.createDynamicsCompressor();limiter.threshold.value=-12;limiter.ratio.value=8;
        masterBus.connect(limiter);limiter.connect(audio.destination);
        sfxBus=audio.createGain();sfxBus.gain.value=.8;sfxBus.connect(masterBus);
        musicBus=audio.createGain();musicBus.gain.value=.34;musicBus.connect(masterBus);
        noiseBuffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*.6),audio.sampleRate);
        const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,2);
      }
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      nextBeat=audio.currentTime+.05;
    } catch {}
  }
  function noise(duration=.2,volume=.08,frequency=800,time){
    if(!soundOn||!audio||!noiseBuffer)return;
    try{const at=time??audio.currentTime,src=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();src.buffer=noiseBuffer;filter.type='lowpass';filter.frequency.value=frequency;gain.gain.setValueAtTime(volume,at);gain.gain.exponentialRampToValueAtTime(.001,at+duration);src.connect(filter);filter.connect(gain);gain.connect(sfxBus);src.start(at);src.stop(at+duration);}catch{}
  }
  function musicNote(frequency,at,duration,volume,type='triangle'){
    const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=frequency;g.gain.setValueAtTime(.001,at);g.gain.exponentialRampToValueAtTime(volume,at+.012);g.gain.exponentialRampToValueAtTime(.001,at+duration);o.connect(g);g.connect(musicBus);o.start(at);o.stop(at+duration+.02);
  }
  function updateMusic(){
    if(audio&&musicBus)musicBus.gain.setTargetAtTime(soundOn&&state==='playing'?.34:0,audio.currentTime,.04);
    if(!soundOn||!audio||audio.state!=='running'||state!=='playing')return;
    if(nextBeat<audio.currentTime-.2)nextBeat=audio.currentTime+.03;
    const interval=60/(104+sectorIndex*10)/4;
    while(nextBeat<audio.currentTime+.12){
      const at=nextBeat,step=musicStep%32,root=[55,65.406,73.416][sectorIndex],notes=[0,0,7,0,10,7,3,7];
      if(step%2===0){const ratio=Math.pow(2,notes[Math.floor(step/2)%8]/12);musicNote(root*ratio,at,interval*1.65,.13,'sawtooth');musicNote(root*2*ratio,at,interval*.7,.025,'triangle');}
      if(step%4===0){musicNote(49,at,.17,.26,'sine');noise(.045,.035,100,at);}
      if(step%8===4)noise(.13,.06,1700,at);
      if(step%2===1)noise(.035,.018,6500,at);
      if(step%4===2){const melody=[12,19,15,22,19,15,10,14][Math.floor(step/4)%8];musicNote(root*4*Math.pow(2,melody/12),at,.22,.026,'sine');}
      if(step===0){musicNote(root,at,interval*30,.035,'sine');musicNote(root*1.5,at,interval*28,.014,'sine');}
      musicStep++;nextBeat+=interval;
    }
  }
  function show(id, visible) { $(id).classList.toggle('hidden', !visible); }
  function hideModals() { ['upgrade', 'pauseScreen', 'endScreen', 'helpScreen'].forEach(id => show(id, false)); }
  function controls(visible) { show('hud', visible); show('pause', visible); show('touchControls', visible && coarse()); show('gameHint', visible && !coarse()); }
  function resetInputs() { keys.clear(); touch.x = 0; touch.y = 0; touch.id = null; $('stick').style.transform = ''; }
  function start() {
    runToken++; startAudio(); resetInputs(); player = makePlayer(); enemies = []; bullets = []; particles = []; pickups = []; marks = []; rings = []; queue = [];
    wave = 0; score = 0; elapsed = 0; kills = 0; waveDelay = -1; shake = 0; setSector(0);
    hideModals(); show('menu', false); controls(true); state = 'playing'; resize(); nextWave(); updateHUD();
  }
  function goMenu() { runToken++; state = 'menu'; enemies=[];bullets=[];particles=[];pickups=[];rings=[];marks=[];hideModals(); controls(false); show('menu', true); show('announcement', false); show('toast', false); resetInputs(); setSector(0); resize(); }
  function announce(title, sub) { $('announceTitle').textContent = title; $('announceSub').textContent = sub; show('announcement', false); void $('announcement').offsetWidth; show('announcement', true); announcementTimer = 2.8; }
  function toast(text) { $('toast').textContent = text; show('toast', true); toastTimer = 3; }
  function nextWave() {
    wave++; waveDelay = -1; queue = [];
    const nextSector = Math.min(2,Math.floor((wave-1)/5));
    if(nextSector!==sectorIndex){setSector(nextSector);player.x=900;player.y=620;enemies=[];bullets=[];pickups=[];marks=[];player.hp=player.maxHp;toast(`SETOR 0${nextSector+1} DESBLOQUEADO · BLINDAGEM RESTAURADA`);}
    const localWave=(wave-1)%5+1, bossWave=wave%5===0;
    const count = [0, 8, 12, 17, 21, 16][localWave]+sectorIndex*5;
    for (let i = 0; i < count; i++) queue.push(wave >= 3 && i % 5 === 0 ? 'shooter' : wave >= 2 && i % 4 === 0 ? 'brute' : 'scout');
    if (bossWave) queue.push('boss');
    waveTotal = queue.length; spawnTimer = 1.7;
    announce(bossWave ? sectors[sectorIndex].boss : `FASE ${String(wave).padStart(2, '0')}`, bossWave ? `CHEFE DO SETOR 0${sectorIndex+1} // AMEAÇA CRÍTICA` : `${sectors[sectorIndex].name} // ${localWave===1?'NOVO SETOR':'SINAL HOSTIL DETECTADO'}`);
    tone(120, .5, 'sawtooth', .025, 60);
    if(bossWave){tone(330,.8,'sawtooth',.025,165);noise(.5,.14,360);}
  }
  function spawn(type) {
    const side = Math.floor(rand(0, 4)); let x, y;
    for (let i = 0; i < 12; i++) { x = side % 2 === 0 ? (side === 0 ? 100 : W - 100) : rand(120, W - 120); y = side % 2 ? (side === 1 ? 140 : H - 120) : rand(160, H - 140); if (Math.hypot(x - player.x, y - player.y) > 330) break; }
    const config = { scout: [19, 43 + wave * 6, 96 + Math.min(wave,10) * 6], brute: [30, 150 + wave * 17, 58 + Math.min(wave,10) * 3], shooter: [22, 75 + wave * 9, 80+sectorIndex*8], boss: [65+sectorIndex*5, 2200+sectorIndex*2000, 48+sectorIndex*7] }[type];
    enemies.push({ x, y, type, r: config[0], hp: config[1], maxHp: config[1], speed: config[2], angle: 0, hit: 0, cooldown: rand(1.2, 2.5), spawn: .6, phase: rand(0, TAU) });
    rings.push({ x, y, r: 5, max: type === 'boss' ? 110 : 55, life: .65, maxLife: .65, color: orange });
  }
  function collide(e) {
    e.x = clamp(e.x, 105 + e.r, W - 105 - e.r); e.y = clamp(e.y, 135 + e.r, H - 120 - e.r);
    for (const o of obstacles) {
      const nx = clamp(e.x, o.x, o.x + o.w), ny = clamp(e.y, o.y - 12, o.y + o.h), dx = e.x - nx, dy = e.y - ny, d = Math.hypot(dx, dy);
      if (d > 0 && d < e.r) { e.x += dx / d * (e.r - d); e.y += dy / d * (e.r - d); }
      else if (d === 0) { const edges = [e.x - o.x, o.x + o.w - e.x, e.y - (o.y - 12), o.y + o.h - e.y], index = edges.indexOf(Math.min(...edges)); if (index === 0) e.x = o.x - e.r; if (index === 1) e.x = o.x + o.w + e.r; if (index === 2) e.y = o.y - 12 - e.r; if (index === 3) e.y = o.y + o.h + e.r; }
    }
  }
  function burst(x, y, color, n = 12, power = 140) { for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(power * .2, power); particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(.18, .65), max: .65, size: rand(1.5, 4.5), color }); } if (particles.length > 330) particles.splice(0, particles.length - 330); }
  function damagePlayer(amount) {
    if (player.invincible > 0 || state !== 'playing') return;
    player.hp -= amount; player.invincible = .65; shake = 8; burst(player.x, player.y, orange, 16); tone(85, .2, 'sawtooth', .05, 35);noise(.2,.12,1500);
    if (player.hp <= 0) finish(false);
  }
  function kill(e) {
    if (e.dead) return; e.dead = true; kills++; player.kills++;
    const value = { scout: 15, brute: 40, shooter: 30, boss: 500 }[e.type];
    score += Math.floor(value / 3); burst(e.x, e.y, orange, e.type === 'boss' ? 65 : 22, e.type === 'boss' ? 330 : 190); burst(e.x, e.y, '#bbc9b7', 6, 110);
    rings.push({ x: e.x, y: e.y, r: 10, max: e.type === 'boss' ? 230 : 65, life: .4, maxLife: .4, color: orange });
    marks.push({ x: e.x, y: e.y, r: e.r * 1.5, angle: rand(0, TAU) }); if (marks.length > 65) marks.shift();
    const n = e.type === 'boss' ? 18 : e.type === 'brute' ? 5 : 3;
    for (let i = 0; i < n; i++) pickups.push({ x: e.x + rand(-25, 25), y: e.y + rand(-25, 25), value: Math.ceil(value * .7 / n), phase: rand(0, TAU) });
    if (e.type === 'boss') shake = 16; else shake = Math.max(shake, 2.5);
    tone(e.type === 'boss' ? 70 : 115, .16, 'triangle', .045, 30);
    noise(e.type==='boss'?.58:.2,e.type==='boss'?.23:.075,e.type==='boss'?350:850);
  }
  function fire() {
    const target = enemies.filter(e => !e.dead && e.spawn <= 0).reduce((a, b) => !a || dist(player, b) < dist(player, a) ? b : a, null);
    if (!target) return;
    const a = Math.atan2(target.y - player.y, target.x - player.x); player.angle = a;
    for (let i = 0; i < player.multi; i++) {
      const angle = a + (i - (player.multi - 1) / 2) * .13;
      bullets.push({ x: player.x + Math.cos(angle) * 34, y: player.y + Math.sin(angle) * 34 - 4, vx: Math.cos(angle) * 740, vy: Math.sin(angle) * 740, life: 1.35, damage: player.damage, enemy: false });
    }
    burst(player.x + Math.cos(a) * 40, player.y + Math.sin(a) * 40 - 4, mint, 3, 60); tone(550 + rand(-50, 50), .045, 'square', .012, 130);
  }
  function enemyFire(e) {
    const count = e.type === 'boss' ? 10+sectorIndex*3 : 1, base = Math.atan2(player.y - e.y, player.x - e.x);
    for (let i = 0; i < count; i++) { const a = count === 1 ? base : base + i * TAU / count; bullets.push({ x: e.x + Math.cos(a) * (e.r + 10), y: e.y + Math.sin(a) * (e.r + 10), vx: Math.cos(a) * (count === 1 ? 220 : 155), vy: Math.sin(a) * (count === 1 ? 220 : 155), life: 5, damage: count === 1 ? 12 : 17, enemy: true }); }
    tone(240, .08, 'sawtooth', .016, 100);
  }
  function dash() {
    if (state !== 'playing' || player.dashCooldown > 0) return;
    player.dash = .19; player.dashCooldown = player.dashMax; player.invincible = .3;
    if (!touch.x && !touch.y && !keys.size) player.moveAngle = player.angle;
    burst(player.x, player.y, mint, 14, 140); tone(210, .14, 'sawtooth', .025, 750);
  }
  function update(dt) {
    elapsed += dt; player.dashCooldown = Math.max(0, player.dashCooldown - dt); player.invincible = Math.max(0, player.invincible - dt); player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);
    let mx = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')) + touch.x;
    let my = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup')) + touch.y;
    let mag = Math.hypot(mx, my); if (mag > 1) { mx /= mag; my /= mag; }
    if (mag > .1) player.moveAngle = Math.atan2(my, mx);
    if (player.dash > 0) { player.dash -= dt; mx = Math.cos(player.moveAngle) * 4; my = Math.sin(player.moveAngle) * 4; if (Math.random() < .8) burst(player.x, player.y, mint, 2, 30); }
    player.x += mx * player.speed * dt; player.y += my * player.speed * dt; collide(player);
    if (mag > .1 && Math.random() < dt * 24) particles.push({ x: player.x + rand(-10, 10), y: player.y + 15, vx: -mx * 12, vy: -my * 12, life: .4, max: .4, size: 3, color: '#57767d' });
    spawnTimer -= dt; if (queue.length && spawnTimer <= 0) { spawn(queue.shift()); spawnTimer = wave === 1 ? .8 : .58; }
    player.fireTimer -= dt; if (player.fireTimer <= 0 && enemies.length) { fire(); player.fireTimer = player.fireRate; }
    for (const e of enemies) {
      if (e.dead) continue; e.hit = Math.max(0, e.hit - dt); e.spawn = Math.max(0, e.spawn - dt); if (e.spawn > 0) continue;
      const dx = player.x - e.x, dy = player.y - e.y, d = Math.hypot(dx, dy) || 1; e.angle = Math.atan2(dy, dx);
      let speed = e.speed; if (e.type === 'shooter') speed *= d > 370 ? 1 : d < 250 ? -1 : 0;
      e.x += dx / d * speed * dt; e.y += dy / d * speed * dt;
      // A tangent nudge lets enemies walk around crates instead of sticking to them.
      const bx = e.x, by = e.y; collide(e);
      if (Math.abs(e.x - bx) + Math.abs(e.y - by) > .2) { e.x += -dy / d * e.speed * dt * 1.7; e.y += dx / d * e.speed * dt * 1.7; collide(e); }
      if (d < e.r + player.r && player.dash <= 0) damagePlayer(e.type === 'boss' ? 24 : e.type === 'brute' ? 18 : 10);
      if (e.type === 'shooter' || e.type === 'boss') { e.cooldown -= dt; if (e.cooldown <= 0) { enemyFire(e); e.cooldown = e.type === 'boss' ? 2.2-sectorIndex*.3 : 2.7; } }
    }
    for (let i = 0; i < enemies.length; i++) for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i], b = enemies[j]; if (a.dead || b.dead) continue; const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, overlap = a.r + b.r - d;
      if (overlap > 0) { a.x -= dx / d * overlap * .35; a.y -= dy / d * overlap * .35; b.x += dx / d * overlap * .35; b.y += dy / d * overlap * .35; }
    }
    for (const b of bullets) {
      b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < 90 || b.x > W - 90 || b.y < 120 || b.y > H - 100) b.life = 0;
      if (obstacles.some(o => b.x > o.x && b.x < o.x + o.w && b.y > o.y - 12 && b.y < o.y + o.h)) { b.life = 0; burst(b.x, b.y, b.enemy ? orange : mint, 3, 60); }
      if (b.life <= 0) continue;
      if (b.enemy) { if (Math.hypot(player.x - b.x, player.y - b.y) < player.r + 5) { damagePlayer(b.damage); b.life = 0; } }
      else for (const e of enemies) { if (!e.dead && e.spawn <= 0 && Math.hypot(e.x - b.x, e.y - b.y) < e.r + 5) { e.hp -= b.damage; e.hit = .09; b.life = 0; burst(b.x, b.y, '#e8ecbb', 5, 90); if (e.hp <= 0) kill(e); break; } }
    }
    bullets = bullets.filter(b => b.life > 0); enemies = enemies.filter(e => !e.dead);
    for (const p of pickups) { const d = dist(player, p); if (d < player.magnet || !queue.length && !enemies.length) { const s = 300 + 18000 / (d + 30); p.x += (player.x - p.x) / (d || 1) * Math.min(d, s * dt); p.y += (player.y - p.y) / (d || 1) * Math.min(d, s * dt); } if (d < 30) { score += p.value; p.dead = true; tone(900 + rand(0, 400), .035, 'sine', .009, 1500); } }
    pickups = pickups.filter(p => !p.dead);
    if (!queue.length && !enemies.length && waveDelay < 0) waveDelay = 1.4;
    if (waveDelay >= 0) { waveDelay -= dt; if (waveDelay <= 0 && state === 'playing') { if (wave === TOTAL_PHASES) finish(true); else openUpgrade(); } }
    if (state !== 'playing') resetInputs();
    updateHUD();
  }
  const upgrades = [
    { name: 'Munição de demolição', type: 'PODER DE FOGO', icon: '⌁', text: '+35% de dano por disparo.', apply: () => { player.damage *= 1.35; } },
    { name: 'Gatilho nervoso', type: 'CADÊNCIA', icon: 'ϟ', text: 'Dispare 25% mais rápido.', apply: () => { player.fireRate *= .8; } },
    { name: 'Chapas reforçadas', type: 'BLINDAGEM', icon: '⬡', text: '+35 de blindagem máxima e reparo de 45 HP.', apply: () => { player.maxHp += 35; player.hp = Math.min(player.maxHp, player.hp + 45); } },
    { name: 'Motor clandestino', type: 'MOBILIDADE', icon: '»', text: '+18% de velocidade e impulso recarrega mais rápido.', apply: () => { player.speed *= 1.18; player.dashMax *= .82; } },
    { name: 'Cano duplo', type: 'ARMAMENTO', icon: 'Ⅱ', text: '+1 projétil em cada disparo. Até 7 projéteis.', apply: () => { player.multi=Math.min(7,player.multi+1); } },
    { name: 'Oficina portátil', type: 'REPARO', icon: '✚', text: 'Recupere 1,5 HP por segundo e atraia sucata de mais longe.', apply: () => { player.regen += 1.5; player.magnet += 80; } }
  ];
  function openUpgrade() {
    state = 'upgrade'; player.hp = Math.min(player.maxHp, player.hp + 22); bullets = []; controls(false); show('upgrade', true); tone(440, .35, 'sine', .035, 880);
    $('workshopLabel').textContent=`FASE ${String(wave).padStart(2,'0')} CONCLUÍDA // OFICINA DISPONÍVEL`;
    $('workshopDescription').textContent=wave%5===0 ? `Próximo destino: ${sectors[sectorIndex+1].name}. Instale uma melhoria antes de partir.` : 'Escolha uma melhoria. A próxima fase não vai pegar leve.';
    upgradeChoices = upgrades.filter(u=>u.name!=='Cano duplo'||player.multi<7).sort(() => Math.random() - .5).slice(0, 3);
    $('upgradeCards').replaceChildren(...upgradeChoices.map((u, i) => {
      const button = document.createElement('button'); button.className = 'upgrade-card';
      button.innerHTML = `<span class="upgrade-icon">${u.icon}</span><span class="upgrade-type">${u.type}</span><h3>${u.name}</h3><p>${u.text}</p><span class="choose">INSTALAR MELHORIA <b>↗</b></span>`;
      button.addEventListener('click', () => selectUpgrade(i)); return button;
    }));
    $('upgradeCards').firstElementChild.focus();
  }
  function selectUpgrade(index) { if (state !== 'upgrade' || !upgradeChoices[index]) return; upgradeChoices[index].apply();tone(660,.2,'triangle',.045,1320);toast(upgradeChoices[index].name.toUpperCase() + ' INSTALADO'); show('upgrade', false); state = 'playing'; controls(true); resetInputs(); nextWave(); }
  function updateHUD() {
    $('hpText').textContent = `${Math.ceil(Math.max(0, player.hp))} / ${player.maxHp}`;
    $('hpBar').style.width = `${Math.max(0, player.hp / player.maxHp * 100)}%`; $('hpBar').style.background = player.hp < player.maxHp * .3 ? orange : mint;
    $('dashText').textContent = player.dashCooldown > 0 ? `IMPULSO RECARREGANDO · ${player.dashCooldown.toFixed(1)}s` : coarse() ? 'IMPULSO PRONTO · ↯' : 'IMPULSO PRONTO · ESPAÇO';
    $('dashButton').disabled = player.dashCooldown > 0; $('score').textContent = String(score).padStart(5, '0'); $('timer').textContent = timeString(elapsed);
    $('waveLabel').textContent = `FASE ${String(wave).padStart(2, '0')} / ${TOTAL_PHASES}`;
    const remaining = enemies.length + queue.length; $('enemyText').textContent = remaining ? `${remaining} HOSTI${remaining === 1 ? 'L' : 'S'} NO SETOR` : 'SETOR LIMPO';
    $('waveBar').style.width = `${waveTotal ? (1 - remaining / waveTotal) * 100 : 0}%`;
  }
  function finish(win) {
    if (state !== 'playing') return; state = win ? 'victory' : 'dead'; controls(false); show('announcement', false); show('endScreen', true);
    $('endEyebrow').textContent = win ? 'PROTOCOLO CONCLUÍDO // SETOR RECUPERADO' : 'CONEXÃO COM A UNIDADE PERDIDA';
    $('endTitle').innerHTML = win ? 'REI DO<br>FERRO-VELHO.' : 'ATÉ A ÚLTIMA<br>PEÇA.';
    $('endDescription').textContent = win ? 'Quinze fases. Três setores. Uma unidade de pé.' : `Você chegou à fase ${wave}, em ${sectors[sectorIndex].name.toLowerCase()}. Reconstrua e vá além.`;
    $('endScore').textContent = score; $('endWave').textContent = `${wave}/${TOTAL_PHASES}`; $('endTime').textContent = timeString(elapsed);
    if (score > best) { best = score; try { localStorage.setItem('sucata-best', String(best)); } catch {} $('best').textContent = String(best).padStart(5, '0'); }
    if (win) { burst(player.x, player.y, mint, 70, 400);[392,494,587,784].forEach(f=>tone(f,1.2,'triangle',.025,f)); }else{tone(220,.7,'sawtooth',.045,35);noise(.5,.13,500);}
    resetInputs(); $('restart').focus();
  }
  function pause() { if (state !== 'playing') return; state = 'paused'; resetInputs(); show('pauseScreen', true); controls(false); $('resume').focus(); }
  function resume() { if (state !== 'paused') return; state = 'playing'; show('pauseScreen', false); controls(true); resetInputs(); }

  function robot(x, y, angle, type, hit = 0, phase = 0, alpha = 1) {
    const isPlayer = type === 'player', boss = type === 'boss', brute = type === 'brute', shooter = type === 'shooter';
    const s = boss ? 2.75 : brute ? 1.35 : 1, accent = isPlayer ? mint : shooter ? '#ffbd69' : orange;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.fillStyle = '#0007'; ctx.beginPath(); ctx.ellipse(x + 8 * s, y + 15 * s, 29 * s, 17 * s, 0, 0, TAU); ctx.fill();
    glow(x, y + 4, 55 * s, isPlayer ? '#43e8c5' : '#ff5428', .08);
    ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(angle + Math.PI / 2);
    const tread = (Math.floor(clock * 12 + phase) % 3) * 3;
    for (const sign of [-1, 1]) {
      rounded(ctx, sign < 0 ? -28 : 15, -20, 13, 41, 4, '#091015', '#405059');
      for (let yy = -17; yy < 19; yy += 7) { ctx.fillStyle = '#2c3b43'; ctx.fillRect(sign < 0 ? -26 : 17, yy + tread % 3, 9, 3); }
      ctx.fillStyle = '#11191e'; ctx.fillRect(sign < 0 ? -17 : 11, -10, 6, 20);
    }
    polygon(ctx, [[-18,-20],[12,-23],[21,-12],[18,20],[-15,23],[-21,11]], hit ? '#e4e8cd' : isPlayer ? '#718d82' : brute || boss ? '#8b5841' : '#6a6560', '#9aa89a');
    polygon(ctx, [[-14,-16],[10,-19],[15,-10],[13,14],[-10,17],[-16,8]], isPlayer ? '#334d4a' : '#4a332b', '#121b20');
    ctx.fillStyle = '#111d22'; ctx.fillRect(-10, 8, 21, 8); ctx.fillStyle = '#738177'; for(let i = 0; i < 4; i++) ctx.fillRect(-8 + i * 5, 10, 2, 4);
    for (const xx of [-15, 12]) { ctx.fillStyle = '#afbaa1'; ctx.fillRect(xx, -12, 3, 3); ctx.fillRect(xx, 13, 3, 3); }
    if (shooter) { ctx.strokeStyle = '#a8ada0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(12, -15); ctx.lineTo(24, -31); ctx.stroke(); ctx.fillStyle = accent; ctx.fillRect(22, -34, 4, 4); }
    rounded(ctx, -8, -35, 16, 26, 3, '#18292f', '#6e8487'); ctx.fillStyle = '#536a69'; ctx.fillRect(-5, -32, 3, 19); ctx.fillStyle = '#08141a'; ctx.fillRect(-7, -37, 14, 7); ctx.fillStyle = accent; ctx.fillRect(-4, -37, 8, 3);
    rounded(ctx, -12, -12, 24, 18, 4, hit ? '#fff5cc' : '#16292d', '#82958b');
    ctx.shadowBlur = 13; ctx.shadowColor = accent; ctx.fillStyle = accent; ctx.fillRect(-8, -7, 16, 4); ctx.shadowBlur = 0;
    if (boss) { ctx.fillStyle = '#141e22'; ctx.fillRect(-36,-6,12,20); ctx.fillRect(24,-6,12,20); ctx.fillStyle = '#ffd07e'; ctx.fillRect(-34,-4,8,3); ctx.fillRect(26,-4,8,3); }
    ctx.restore();
  }
  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#080e13'; ctx.fillRect(0, 0, width, height);
    ctx.save();
    let cx = ox, cy = oy;
    if (width < 700 && state !== 'menu') { cx = clamp(width / 2 - player.x * scale, width - W * scale - 10, 10); cy = clamp(height * .5 - player.y * scale, height - H * scale - 60, 180); }
    const sx = shake ? rand(-shake, shake) : 0, sy = shake ? rand(-shake, shake) : 0;
    ctx.translate(cx + sx, cy + sy); ctx.scale(scale, scale); ctx.drawImage(floor, 0, 0);
    for (const m of marks) { ctx.fillStyle = '#03080b65'; ctx.beginPath(); ctx.ellipse(m.x, m.y, m.r, m.r * .6, m.angle, 0, TAU); ctx.fill(); ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.angle); ctx.fillStyle = '#544b3c'; ctx.fillRect(-8, -4, 9, 6); ctx.fillStyle = '#263a41'; ctx.fillRect(9, 6, 10, 7); ctx.restore(); }
    for (const [x, y] of [[105, 190], [1690, 220], [105, 1000], [1690, 970]]) { glow(x, y, 180, sectors[sectorIndex].light, .12 + Math.sin(clock * 2 + x) * .02); ctx.fillStyle = sectors[sectorIndex].accent; ctx.fillRect(x - 2, y - 25, 4, 50); }
    glow(980, 460, 360, '#47a5a5', .07); glow(1300, 800, 280, '#e85d2a', .065);
    for (const p of pickups) { const pulse = .7 + Math.sin(clock * 4 + p.phase) * .3; glow(p.x, p.y, 24, '#56ffc6', .18 * pulse); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(clock + p.phase); polygon(ctx, [[0,-5],[5,0],[0,5],[-5,0]], mint); ctx.restore(); }
    if (state === 'menu') {
      const demoX = width < 700 ? 1100 : 1125, demoY = width < 700 ? 650 : 570;
      ctx.save(); ctx.translate(demoX, demoY); ctx.scale(2.7, 2.7); robot(0, 0, -.9 + Math.sin(clock * .25) * .05, 'player'); ctx.restore();
      glow(demoX, demoY, 240, '#60ffcf', .1);
      ctx.strokeStyle = '#9cffe033'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(demoX, demoY, 155, -.3, 1.9); ctx.stroke(); ctx.beginPath(); ctx.arc(demoX, demoY, 170, 2.3, 4.4); ctx.stroke();
      ctx.fillStyle = '#9cffe066'; ctx.font = '11px Consolas'; ctx.fillText('MK–01 // CHASSI DE COMBATE', demoX - 85, demoY + 200);
      for (let i = 0; i < 30; i++) { const px = (i * 131 + clock * (5 + i % 4)) % W, py = (i * 91 - clock * 12 + H * 10) % H; ctx.fillStyle = i % 3 ? '#9cffe025' : '#ff986766'; ctx.fillRect(px, py, 2, 2); }
    } else {
      const actors = [...enemies, { ...player, type: 'player' }].sort((a, b) => a.y - b.y);
      for (const a of actors) {
        const isPlayer = a.type === 'player'; if (isPlayer && player.hp <= 0) continue;
        robot(a.x, a.y, a.angle, a.type, a.hit, a.phase, a.spawn > 0 ? .4 : isPlayer && a.invincible > 0 ? .55 + Math.sin(clock * 40) * .3 : 1);
        if (isPlayer) { ctx.strokeStyle = player.dashCooldown <= 0 ? '#9cffe05c' : '#6e859f35'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(a.x, a.y + 4, 34, 24, 0, 0, TAU); ctx.stroke(); }
        else if (a.hp < a.maxHp || a.type === 'boss') { const bw = a.type === 'boss' ? 125 : a.r * 2; ctx.fillStyle = '#071017'; ctx.fillRect(a.x - bw / 2, a.y - a.r - 20, bw, 4); ctx.fillStyle = orange; ctx.fillRect(a.x - bw / 2, a.y - a.r - 20, bw * Math.max(0, a.hp / a.maxHp), 4); if (a.type === 'boss') { ctx.font = '9px Consolas'; ctx.textAlign = 'center'; ctx.fillText(sectors[sectorIndex].boss, a.x, a.y - a.r - 27); ctx.textAlign = 'left'; } }
      }
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const b of bullets) { ctx.strokeStyle = b.enemy ? orange : '#baffde'; ctx.lineWidth = b.enemy ? 5 : 3; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * .021, b.y - b.vy * .021); ctx.stroke(); glow(b.x, b.y, b.enemy ? 18 : 12, b.enemy ? '#ff5d2e' : '#7dffcc', .35); }
    for (const p of particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); if (p.size > 3) { ctx.strokeStyle = p.color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * .035, p.y - p.vy * .035); ctx.stroke(); } }
    ctx.globalAlpha = 1;
    for (const r of rings) { ctx.globalAlpha = Math.max(0, r.life / r.maxLife) * .6; ctx.strokeStyle = r.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke(); }
    ctx.restore(); ctx.restore();
    if (state === 'playing' && player.hp < player.maxHp * .3) { const g = ctx.createRadialGradient(width / 2, height / 2, height * .2, width / 2, height / 2, height * .8); g.addColorStop(0, '#ff331100'); g.addColorStop(1, '#ff33112a'); ctx.fillStyle = g; ctx.fillRect(0, 0, width, height); }
  }
  function frame(now) {
    const dt = Math.min((now - last) / 1000 || 0, .033); last = now; clock += dt;
    if (state === 'playing') update(dt);
    if (state === 'playing' || state === 'dead' || state === 'victory') {
      for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(.12, dt); p.vy *= Math.pow(.12, dt); }
      particles = particles.filter(p => p.life > 0); for (const r of rings) { r.life -= dt; r.r += (r.max - r.r) * dt * 9; } rings = rings.filter(r => r.life > 0); shake *= Math.pow(.002, dt); if (shake < .1) shake = 0;
      if (announcementTimer > 0) { announcementTimer -= dt; if (announcementTimer <= 0) show('announcement', false); }
      if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) show('toast', false); }
    }
    updateMusic();render(); requestAnimationFrame(frame);
  }
  $('start').addEventListener('click', start); $('restart').addEventListener('click', start); $('backMenu').addEventListener('click', goMenu); $('quit').addEventListener('click', goMenu);
  $('brand').addEventListener('click', e => { e.preventDefault(); if (state === 'menu') return; if (state === 'playing') pause(); });
  $('pause').addEventListener('click', pause); $('resume').addEventListener('click', resume);
  $('sound').addEventListener('click', () => { soundOn = !soundOn; startAudio();if(masterBus)masterBus.gain.setTargetAtTime(soundOn?.65:0,audio.currentTime,.03);$('soundLabel').textContent = soundOn ? 'ON' : 'OFF'; $('sound').setAttribute('aria-label', soundOn ? 'Desativar som' : 'Ativar som'); $('sound').title = soundOn ? 'Desativar som' : 'Ativar som'; if (soundOn) tone(600, .13, 'sine', .05, 900); });
  $('help').addEventListener('click', () => { if (state === 'help') return; previousState = state; if (state === 'playing') pause(); state = 'help'; show('helpScreen', true); $('closeHelp').focus(); });
  function closeHelp() { if (state !== 'help') return; show('helpScreen', false); if (previousState === 'playing') { state = 'paused'; resume(); } else state = previousState; }
  $('closeHelp').addEventListener('click', closeHelp);
  addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','escape'].includes(key) && state !== 'menu') e.preventDefault();
    if (e.repeat && (key === ' ' || key === 'escape')) return;
    if (key === 'escape') { if (state === 'help') closeHelp(); else if (state === 'playing') pause(); else if (state === 'paused') resume(); }
    if (key === ' ' && state === 'playing') dash(); if (state === 'playing') keys.add(key);
    if (state === 'upgrade' && ['1','2','3'].includes(key)) selectUpgrade(+key - 1);
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase())); addEventListener('blur', () => { resetInputs(); pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { resetInputs(); pause(); } });
  $('dashButton').addEventListener('pointerdown', e => { e.preventDefault(); dash(); });
  const joy = $('joystick');
  function moveStick(e) { const r = joy.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2, d = Math.hypot(dx, dy), limit = 35; touch.x = dx / Math.max(limit, d); touch.y = dy / Math.max(limit, d); $('stick').style.transform = `translate(${touch.x * limit}px,${touch.y * limit}px)`; }
  joy.addEventListener('pointerdown', e => { if (touch.id !== null) return; e.preventDefault(); touch.id = e.pointerId; joy.setPointerCapture(e.pointerId); moveStick(e); });
  joy.addEventListener('pointermove', e => { if (touch.id === e.pointerId) { e.preventDefault(); moveStick(e); } });
  function releaseStick(e) { if (touch.id === e.pointerId) { touch.id = null; touch.x = touch.y = 0; $('stick').style.transform = ''; } }
  joy.addEventListener('pointerup', releaseStick); joy.addEventListener('pointercancel', releaseStick); joy.addEventListener('lostpointercapture', releaseStick);
  requestAnimationFrame(frame);
})();
