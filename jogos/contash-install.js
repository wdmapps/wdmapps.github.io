const installButton = document.querySelector("#install-button");
const installToast = document.querySelector("#install-toast");
let deferredPrompt = null;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

function showMessage(text, duration = 6500) {
  if (!installToast) return;
  installToast.textContent = text;
  installToast.classList.add("show");
  window.clearTimeout(showMessage.timeout);
  showMessage.timeout = window.setTimeout(() => installToast.classList.remove("show"), duration);
}

function updateButton() {
  if (!installButton) return;
  installButton.hidden = isStandalone();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./contash-sw.js?v=2", {
        scope: "./contash",
        updateViaCache: "none",
      });
      await registration.update();
    } catch (error) {
      console.warn("Contas H service worker:", error);
    }
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  installButton?.classList.add("is-ready");
});

installButton?.addEventListener("click", async () => {
  if (isStandalone()) {
    installButton.hidden = true;
    return;
  }

  if (deferredPrompt) {
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    deferredPrompt = null;
    installButton.classList.remove("is-ready");
    if (result.outcome === "accepted") installButton.hidden = true;
    return;
  }

  const userAgent = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(userAgent)) {
    showMessage("No iPhone: abra no Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”.");
  } else if (/android/i.test(userAgent)) {
    showMessage("No Android: abra o menu ⋮ do navegador e escolha “Instalar app” ou “Adicionar à tela inicial”.");
  } else {
    showMessage("Abra o menu do navegador e escolha “Instalar Contas H” ou “Instalar app”.");
  }
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  if (installButton) installButton.hidden = true;
  showMessage("Contas H instalado com sucesso! 🍎");
});

window.matchMedia("(display-mode: standalone)").addEventListener?.("change", updateButton);
updateButton();
