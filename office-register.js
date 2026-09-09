(() => {
  try {
    icons.docs = icon(['#3b82f6','#1d4ed8'],'<path d="M18 12h22l8 8v32H18z" fill="#fff"/><path d="M40 12v10h10" fill="#bfdbfe"/><path d="M24 29h18M24 36h18M24 43h13" stroke="#2563eb" stroke-width="3" stroke-linecap="round"/>');
    icons.sheets = icon(['#22c55e','#15803d'],'<rect x="15" y="13" width="34" height="38" rx="4" fill="#fff"/><path d="M15 25h34M15 36h34M27 13v38M39 13v38" stroke="#16a34a" stroke-width="2.5"/><path d="M19 18h7v4h-7z" fill="#bbf7d0"/>');

    apps.docs = {title:'WDM Docs',label:'Docs',url:'https://wdmapps.com.br/office/',icon:'docs',mode:'iframe'};
    apps.sheets = {title:'WDM Planilhas',label:'Planilhas',url:'https://wdmapps.com.br/office/?app=sheets',icon:'sheets',mode:'iframe'};

    function add(key) {
      if (document.querySelector(`.desktop-icon[data-open="${key}"]`)) return;
      const app = apps[key];
      const d = document.createElement('button');
      d.className = 'desktop-icon';
      d.dataset.open = key;
      d.innerHTML = iconHtml(app.icon) + `<span class="label">${app.label}</span>`;
      d.addEventListener('click', () => {
        document.querySelectorAll('.desktop-icon').forEach(x => x.classList.remove('selected'));
        d.classList.add('selected');
      });
      d.addEventListener('dblclick', () => makeWindow(key));
      desktopIcons.appendChild(d);

      const p = document.createElement('button');
      p.className = 'pin';
      p.dataset.open = key;
      p.innerHTML = iconHtml(app.icon) + `<span>${app.label}</span>`;
      p.addEventListener('click', () => {
        makeWindow(key);
        startMenu.classList.remove('show');
      });
      pinGrid.appendChild(p);
    }

    add('docs');
    add('sheets');
  } catch (err) {
    console.error('WDM Office register error:', err);
  }
})();