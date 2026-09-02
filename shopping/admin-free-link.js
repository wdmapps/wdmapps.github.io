(() => {
  let timer = 0;

  function installLink() {
    clearInterval(timer);
    let tries = 0;

    timer = setInterval(() => {
      tries += 1;

      if (!location.hash.startsWith('#admin')) {
        clearInterval(timer);
        return;
      }

      // Espera o painel administrativo terminar a renderização final.
      // Assim o link não é inserido na tela intermediária que depois é substituída.
      const adminReady = document.querySelector('.adminStats');
      const nav = document.querySelector('.adminWrap .side nav');
      if (!adminReady || !nav) {
        if (tries >= 50) clearInterval(timer);
        return;
      }

      if (!nav.querySelector('[data-wdm-free-link]')) {
        const link = document.createElement('a');
        link.href = 'admin-free.html';
        link.textContent = '🎁 Parceiros FREE';
        link.dataset.wdmFreeLink = '1';

        const before = nav.querySelector('a[href="#painel/loja"]');
        nav.insertBefore(link, before || nav.querySelector('button') || null);
      }

      clearInterval(timer);
    }, 120);
  }

  window.addEventListener('hashchange', installLink);
  installLink();
})();
