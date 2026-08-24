const installBtn = document.querySelector('#installBtn');
const toast = document.querySelector('#toast');
let deferredPrompt = null;

function standalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function message(text, ms = 5200) {
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(message.t);
  message.t = setTimeout(() => toast.classList.remove('show'), ms);
}

function updateButton() {
  if (!installBtn) return;
  installBtn.hidden = standalone();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      await registration.update();
    } catch (err) {
      console.warn('Service worker:', err);
    }
  });
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredPrompt = event;
  if (installBtn) {
    installBtn.hidden = false;
    installBtn.classList.add('primary');
  }
});

installBtn?.addEventListener('click', async () => {
  if (standalone()) {
    installBtn.hidden = true;
    return;
  }

  if (deferredPrompt) {
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (result.outcome === 'accepted') installBtn.hidden = true;
    else installBtn.classList.remove('primary');
    return;
  }

  const ua = navigator.userAgent || '';
  const isiOS = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);

  if (isiOS) {
    message('No iPhone: abra no Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”.', 7000);
  } else if (isAndroid) {
    message('No Android: abra o menu ⋮ do navegador e escolha “Instalar app” ou “Adicionar à tela inicial”.', 7000);
  } else {
    message('No menu do navegador, procure “Instalar WDM Leitor” ou “Instalar app”.', 6000);
  }
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  if (installBtn) installBtn.hidden = true;
  message('WDM Leitor instalado com sucesso! 📚');
});

window.matchMedia('(display-mode: standalone)').addEventListener?.('change', updateButton);
updateButton();
