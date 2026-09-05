(() => {
  const themes = [
    {id:'clean',name:'Clean',emoji:'◻️',desc:'Claro, elegante e bem organizado.'},
    {id:'dark',name:'Dark',emoji:'🌙',desc:'Janelas escuras e visual discreto.'},
    {id:'gamer',name:'Gamer',emoji:'🎮',desc:'Neon, contraste e clima cyber.'},
    {id:'funny',name:'Engraçado',emoji:'😄',desc:'Cores vivas, cantos arredondados e diversão.'}
  ];
  const wallpapers = [
    ['w1','Windows Azul'],['w2','Purple Night'],['w3','Neon Grid'],['w4','Oceano'],['w5','Sunset'],
    ['w6','Forest'],['w7','Cyber'],['w8','Minimal'],['w9','Candy'],['w10','Espaço']
  ];

  const savedTheme = localStorage.getItem('wdmTheme') || 'clean';
  const savedWallpaper = localStorage.getItem('wdmWallpaper') || 'w1';
  document.body.dataset.theme = savedTheme;
  document.body.dataset.wallpaper = savedWallpaper;

  const overlay = document.createElement('div');
  overlay.className = 'personalize-overlay';
  overlay.id = 'personalizeOverlay';
  overlay.innerHTML = `
    <section class="personalize-panel" role="dialog" aria-modal="true" aria-labelledby="personalizeTitle">
      <div class="personalize-head">
        <div><h2 id="personalizeTitle">Personalização WDM</h2><p>Escolha o tema do sistema e o papel de parede da sua área de trabalho.</p></div>
        <button class="personalize-close" type="button" aria-label="Fechar">×</button>
      </div>
      <div class="personalize-section"><h3>TEMA</h3><div class="theme-grid"></div></div>
      <div class="personalize-section"><h3>PAPEL DE PAREDE</h3><div class="wallpaper-grid"></div></div>
    </section>`;
  document.body.appendChild(overlay);

  const themeGrid = overlay.querySelector('.theme-grid');
  const wallpaperGrid = overlay.querySelector('.wallpaper-grid');

  themes.forEach(t => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'theme-card';
    b.dataset.themeChoice = t.id;
    b.innerHTML = `<span class="theme-emoji">${t.emoji}</span><strong>${t.name}</strong><small>${t.desc}</small>`;
    b.addEventListener('click', () => setTheme(t.id));
    themeGrid.appendChild(b);
  });

  wallpapers.forEach(([id,name]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `wallpaper-card wp-${id}`;
    b.dataset.wallpaperChoice = id;
    b.title = name;
    b.innerHTML = `<span>${name}</span>`;
    b.addEventListener('click', () => setWallpaper(id));
    wallpaperGrid.appendChild(b);
  });

  function refreshSelected(){
    overlay.querySelectorAll('[data-theme-choice]').forEach(el => el.classList.toggle('selected', el.dataset.themeChoice === document.body.dataset.theme));
    overlay.querySelectorAll('[data-wallpaper-choice]').forEach(el => el.classList.toggle('selected', el.dataset.wallpaperChoice === document.body.dataset.wallpaper));
  }
  function setTheme(id){
    document.body.dataset.theme = id;
    localStorage.setItem('wdmTheme', id);
    refreshSelected();
  }
  function setWallpaper(id){
    document.body.dataset.wallpaper = id;
    localStorage.setItem('wdmWallpaper', id);
    refreshSelected();
  }
  function openPersonalization(){
    refreshSelected();
    overlay.classList.add('show');
    document.getElementById('desktopContext')?.classList.remove('show');
  }
  function closePersonalization(){overlay.classList.remove('show')}

  overlay.querySelector('.personalize-close').addEventListener('click', closePersonalization);
  overlay.addEventListener('mousedown', e => { if(e.target === overlay) closePersonalization(); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape') closePersonalization(); });

  const tray = document.querySelector('.tray');
  if(tray){
    const b = document.createElement('button');
    b.type='button';
    b.className='personalize-tray';
    b.title='Personalizar';
    b.setAttribute('aria-label','Personalizar área de trabalho');
    b.textContent='🎨';
    const clock = tray.querySelector('.clock');
    tray.insertBefore(b, clock || null);
    b.addEventListener('click', e => { e.stopPropagation(); openPersonalization(); });
  }

  const context = document.createElement('div');
  context.id = 'desktopContext';
  context.className = 'desktop-context';
  context.innerHTML = `<button type="button" data-personalize>🎨 &nbsp;Personalizar</button><button type="button" data-next-wallpaper>🖼️ &nbsp;Próximo papel de parede</button>`;
  document.body.appendChild(context);
  context.querySelector('[data-personalize]').addEventListener('click', openPersonalization);
  context.querySelector('[data-next-wallpaper]').addEventListener('click', () => {
    const current = wallpapers.findIndex(x => x[0] === document.body.dataset.wallpaper);
    const next = wallpapers[(current + 1) % wallpapers.length][0];
    setWallpaper(next);
    context.classList.remove('show');
  });

  const desktop = document.getElementById('desktop');
  if(desktop){
    desktop.addEventListener('contextmenu', e => {
      if(e.target.closest('.window') || e.target.closest('.desktop-icon')) return;
      e.preventDefault();
      context.style.left = Math.min(e.clientX, innerWidth - 205) + 'px';
      context.style.top = Math.min(e.clientY, innerHeight - 105) + 'px';
      context.classList.add('show');
    });
  }
  document.addEventListener('click', e => { if(!context.contains(e.target)) context.classList.remove('show'); });

  refreshSelected();
})();
