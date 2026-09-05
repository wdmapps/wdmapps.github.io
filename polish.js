(() => {
  icons.contash = icon(['#38bdf8','#1d4ed8'],'<rect x="14" y="14" width="36" height="36" rx="8" fill="#fff"/><path d="M22 26h8M26 22v8M36 22h8M36 30h8M22 39h8M37 36l7 7M44 36l-7 7" stroke="#2563eb" stroke-width="3" stroke-linecap="round"/>');
  icons.telhas = icon(['#0ea5e9','#0f3b66'],'<path d="M11 31L32 16l21 15-5 7-16-11-16 11z" fill="#fff"/><rect x="20" y="33" width="24" height="16" rx="3" fill="#dbeafe"/><path d="M20 38h24M20 43h24" stroke="#2563eb" stroke-width="2"/>');

  const original = {...apps};
  const enhanced = {
    shopping: original.shopping,
    digitacao: original.digitacao,
    leitor: original.leitor,
    iptv: original.iptv,
    jogos: original.jogos,
    encontrapet: {...original.encontrapet, mode:'showcase', image:'assets/encontrapet-portfolio.webp', badge:'APLICATIVO ANDROID', meta:['Pets','Comunidade','Google Play']},
    vendezap: {...original.vendezap, mode:'showcase', image:'assets/vendezap-portfolio.webp', badge:'APLICATIVO ANDROID', meta:['Vendas','WhatsApp','Google Play']},
    contash: {title:'ContasH',label:'ContasH',url:'https://play.google.com/store/apps/details?id=com.wdmgames.contash',icon:'contash',mode:'showcase',image:'assets/contash-portfolio.jpg',badge:'JOGO EDUCATIVO',description:'Um jogo educativo de matemática criado para praticar contas de forma simples, divertida e interativa.',meta:['Android','Matemática','Educação']},
    telhas: {title:'Telhas Porto',label:'Telhas Porto',url:'https://telhasporto.com.br/',icon:'telhas',mode:'showcase',image:'assets/telhas-porto-logo.png',logoMode:true,badge:'SITE INSTITUCIONAL',description:'Projeto web desenvolvido para a Telhas Porto, com presença digital profissional para apresentar produtos, serviços e facilitar o contato com clientes.',meta:['Website','Responsivo','Projeto WDM']},
    admin: original.admin,
    sobre: {title:'Sobre a WDM Apps',label:'Sobre a WDM',url:'https://wdmapps.com.br/',icon:'sobre',mode:'about'},
    contato: original.contato
  };

  Object.keys(apps).forEach(k => delete apps[k]);
  Object.assign(apps, enhanced);

  const renderAbout = () => `
    <div class="browserview"><div class="about-page"><div class="about-shell">
      <section class="about-hero">
        <div class="about-brand"><img src="assets/logo.png" alt="WDM Apps"><div><small>DESENVOLVIMENTO DIGITAL</small><strong>WDM Apps</strong></div></div>
        <h2>Ideias que viram produtos digitais de verdade.</h2>
        <p>A WDM Apps desenvolve aplicativos, sites, sistemas e experiências digitais com foco em utilidade, simplicidade e identidade. Projetos próprios e soluções criadas para negócios fazem parte do mesmo ecossistema.</p>
        <div class="about-tags"><span>ANDROID</span><span>WEB & PWA</span><span>FIREBASE</span><span>SISTEMAS</span><span>AUTOMAÇÃO</span></div>
      </section>
      <section class="about-section">
        <div class="about-section-title"><h3>O que a WDM constrói</h3><span>do conceito ao lançamento</span></div>
        <div class="about-grid">
          <article class="about-card"><b>Aplicativos</b><p>Apps Android, experiências mobile e produtos publicados para uso real.</p></article>
          <article class="about-card"><b>Sites & plataformas</b><p>Sites responsivos, PWAs e áreas online pensadas para funcionar em qualquer tela.</p></article>
          <article class="about-card"><b>Sistemas & cloud</b><p>Firebase, autenticação, banco de dados, integrações e ferramentas sob medida.</p></article>
        </div>
      </section>
      <section class="about-section">
        <div class="about-section-title"><h3>Projetos em destaque</h3><span>abra sem sair do desktop</span></div>
        <div class="about-projects">
          <button class="about-project" data-launch="encontrapet"><span class="mini-project-icon">${icons.encontrapet}</span><span><strong>EncontraPet</strong><span>Aplicativo para pets perdidos</span></span></button>
          <button class="about-project" data-launch="vendezap"><span class="mini-project-icon">${icons.vendezap}</span><span><strong>VendeZap</strong><span>Anúncios rápidos para WhatsApp</span></span></button>
          <button class="about-project" data-launch="contash"><span class="mini-project-icon">${icons.contash}</span><span><strong>ContasH</strong><span>Jogo educativo de matemática</span></span></button>
          <button class="about-project" data-launch="telhas"><span class="mini-project-icon">${icons.telhas}</span><span><strong>Telhas Porto</strong><span>Site institucional desenvolvido pela WDM</span></span></button>
        </div>
      </section>
      <div class="about-contact"><div><strong>Tem uma ideia para tirar do papel?</strong><span>Fale diretamente com a WDM Apps.</span></div><a href="https://wa.me/5511969188837?text=Ol%C3%A1%2C%20vim%20pelo%20site%20da%20WDM%20Apps." target="_blank" rel="noreferrer">Falar no WhatsApp ↗</a></div>
    </div></div></div>`;

  const renderShowcase = app => `
    <div class="browserview"><div class="showcase-page"><section class="showcase-shell">
      <div class="showcase-media ${app.logoMode?'logo-mode':''}"><img src="${app.image}" alt="${app.title}"></div>
      <div class="showcase-copy"><span class="showcase-badge">${app.badge||'PROJETO WDM'}</span><h2>${app.title}</h2><p>${app.description||''}</p>
      <div class="showcase-meta">${(app.meta||[]).map(x=>`<span>${x}</span>`).join('')}</div>
      <div class="showcase-actions"><a href="${app.url}" target="_blank" rel="noreferrer">Abrir projeto ↗</a><button type="button" data-close-showcase>Voltar ao desktop</button></div></div>
    </section></div></div>`;

  makeWindow = function(appKey){
    const app=apps[appKey]; if(!app) return;
    if(openWindows.has(appKey)){const d=openWindows.get(appKey);d.win.classList.remove('hidden');focusWindow(d.win,appKey);return}
    const win=document.createElement('section');win.className='window';const offset=(cascade++%7)*26;win.style.left=180+offset+'px';win.style.top=70+offset+'px';win.style.zIndex=++z;win.dataset.id=appKey;
    let body='';
    if(app.mode==='iframe') body=`<div class="browserview"><div class="loading">Carregando ${app.title}...</div><iframe src="${app.url}" title="${app.title}" loading="eager"></iframe></div>`;
    else if(app.mode==='about') body=renderAbout();
    else if(app.mode==='showcase') body=renderShowcase(app);
    else body=`<div class="browserview"><div class="external-card"><div class="external-panel"><div class="big-icon">${icons[app.icon]}</div><h2>${app.title}</h2><p>${app.description||''}</p><a href="${app.url}" target="_blank" rel="noreferrer">Abrir ${app.label} ↗</a></div></div></div>`;
    const address=app.mode==='about'?'wdm://sobre':app.url;
    win.innerHTML=`<div class="titlebar"><span class="app-mini">${icons[app.icon]}</span><strong>${app.title}</strong><div class="controls"><button class="min" title="Minimizar">—</button><button class="max" title="Maximizar">□</button><button class="close" title="Fechar">×</button></div></div><div class="browserbar"><button class="browserbtn" title="Voltar" disabled>←</button><button class="browserbtn" title="Avançar" disabled>→</button><button class="browserbtn reload" title="Atualizar">↻</button><div class="address"><span class="lock">🔒</span><span>${address}</span></div><button class="open-external">${app.mode==='about'?'Site WDM ↗':'Abrir fora ↗'}</button></div>${body}`;
    desktop.appendChild(win);const task=taskButton(appKey,app);openWindows.set(appKey,{win,task});
    const iframe=win.querySelector('iframe'),reload=win.querySelector('.reload');
    if(iframe){iframe.addEventListener('load',()=>win.querySelector('.loading')?.classList.add('hide'));reload.onclick=()=>{win.querySelector('.loading')?.classList.remove('hide');iframe.src=iframe.src}} else reload.disabled=true;
    win.querySelector('.open-external').onclick=()=>window.open(app.url,'_blank');
    win.querySelector('.min').onclick=()=>minimize(appKey);win.querySelector('.max').onclick=()=>{win.classList.toggle('maximized');focusWindow(win,appKey)};win.querySelector('.close').onclick=()=>closeWindow(appKey);win.querySelector('[data-close-showcase]')?.addEventListener('click',()=>closeWindow(appKey));
    win.querySelectorAll('[data-launch]').forEach(btn=>btn.addEventListener('click',()=>makeWindow(btn.dataset.launch)));
    win.addEventListener('mousedown',()=>focusWindow(win,appKey));makeDraggable(win,win.querySelector('.titlebar'),appKey)
  };

  function rebuildShortcuts(){
    desktopIcons.innerHTML='';pinGrid.innerHTML='';
    Object.entries(apps).forEach(([key,app])=>{
      const d=document.createElement('button');d.className='desktop-icon';d.dataset.open=key;d.innerHTML=iconHtml(app.icon)+`<span class="label">${app.label}</span>`;
      d.addEventListener('click',()=>{document.querySelectorAll('.desktop-icon').forEach(x=>x.classList.remove('selected'));d.classList.add('selected')});d.addEventListener('dblclick',()=>makeWindow(key));desktopIcons.appendChild(d);
      const p=document.createElement('button');p.className='pin';p.dataset.open=key;p.innerHTML=iconHtml(app.icon)+`<span>${app.label}</span>`;p.addEventListener('click',()=>{makeWindow(key);startMenu.classList.remove('show')});pinGrid.appendChild(p);
    });
  }
  rebuildShortcuts();
})();