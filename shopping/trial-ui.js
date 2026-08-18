import { getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
while (!getApps().length) await sleep(25);

const firebaseApp = getApp();
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp);
const appRoot = document.getElementById('app');
const WDM_OWNER_UID = 'cNUIxdJzXIaut7VnoGBx9EAzgRM2';
const startFreeTrial = httpsCallable(functions, 'startFreeTrial');
const expireOwnTrial = httpsCallable(functions, 'expireOwnTrial');

let checking = false;
let syncTimer = 0;
let refreshTimer = 0;
let expiryTimer = 0;
let lastUser = '';

function endMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (Number.isFinite(value.seconds)) return Number(value.seconds) * 1000;
  return Number(value) || 0;
}

function refreshPanel(delay = 220) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    window.wdmSubscriptionPanelAccess = false;
    if (typeof window.wdmSubscriptionRefresh === 'function') {
      window.wdmSubscriptionRefresh();
    } else {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  }, delay);
}

function patchActiveTrial(data) {
  const bar = document.getElementById('wdmBillingBar');
  if (!bar) return;
  const end = endMillis(data.currentPeriodEnd);
  const remainingMs = Math.max(0, end - Date.now());
  const remainingDays = Math.max(1, Math.ceil(remainingMs / 86400000));
  const date = end ? new Date(end).toLocaleDateString('pt-BR') : '';
  const key = `${end}:${remainingDays}`;
  if (bar.dataset.trialUi === key) return;
  bar.dataset.trialUi = key;
  bar.innerHTML = `
    <span>
      <strong>🎁 Teste grátis ativo</strong><br>
      <small>${remainingDays} ${remainingDays === 1 ? 'dia restante' : 'dias restantes'}${date ? ` · válido até ${date}` : ''}</small>
    </span>
    <span class="btn2" style="cursor:default">5 dias grátis</span>`;
}

function patchExpiredTrial() {
  if (appRoot?.dataset?.wdmSubscriptionView !== 'paywall') return;
  const status = appRoot.querySelector('.subStatus');
  if (!status || status.dataset.trialExpired === '1') return;
  status.dataset.trialExpired = '1';
  status.classList.remove('good');
  status.classList.add('warn');
  status.innerHTML = '<strong>Seu teste grátis de 5 dias terminou.</strong><br>Assine por R$ 29,90/mês para continuar publicando e administrando sua página.';
  const note = appRoot.querySelector('.subNote');
  if (note) note.textContent = 'Você só será cobrado após escolher assinar. Seu teste grátis não gera cobrança automática.';
}

async function readSubscription(uid) {
  const snap = await getDoc(doc(db, 'subscriptions', uid));
  return snap.exists() ? snap.data() : null;
}

async function syncTrial() {
  if (checking || !location.hash.startsWith('#painel')) return;
  const user = auth.currentUser;
  if (!user || user.uid === WDM_OWNER_UID) return;

  checking = true;
  try {
    let data = await readSubscription(user.uid).catch(() => null);

    // Conta nova sem assinatura: solicita automaticamente os 5 dias grátis.
    if (!data) {
      try {
        const result = await startFreeTrial();
        if (result?.data?.started || result?.data?.alreadyActive) {
          await sleep(120);
          data = await readSubscription(user.uid).catch(() => null);
          refreshPanel(120);
        }
      } catch (error) {
        // Lojas 18+ continuam no fluxo de liberação manual e contas que já
        // utilizaram o benefício seguem normalmente para a tela de assinatura.
        const code = String(error?.code || '');
        if (!code.includes('failed-precondition') && !code.includes('not-found')) {
          console.warn('Teste grátis:', error);
        }
      }
    }

    if (!data || data.provider !== 'trial') return;

    const end = endMillis(data.currentPeriodEnd);
    const expired = !end || end <= Date.now() || data.entitled !== true || String(data.status || '').toLowerCase() === 'expired';

    if (expired) {
      if (data.entitled === true && end && end <= Date.now()) {
        try {
          await expireOwnTrial();
          refreshPanel(100);
        } catch (error) {
          console.warn('Encerramento do teste grátis:', error);
        }
      }
      patchExpiredTrial();
      return;
    }

    patchActiveTrial(data);
    clearTimeout(expiryTimer);
    const wait = Math.max(1000, Math.min(end - Date.now() + 800, 2147483000));
    expiryTimer = setTimeout(() => {
      checking = false;
      syncTrial();
    }, wait);
  } finally {
    checking = false;
  }
}

function scheduleSync(delay = 80) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncTrial, delay);
}

const observer = new MutationObserver(() => {
  const user = auth.currentUser;
  if (user && user.uid !== WDM_OWNER_UID && location.hash.startsWith('#painel')) {
    const bar = document.getElementById('wdmBillingBar');
    if (!bar || !bar.dataset.trialUi) scheduleSync(90);
  }
});
observer.observe(appRoot, { childList: true, subtree: true });

window.addEventListener('hashchange', () => scheduleSync(80));
onAuthStateChanged(auth, user => {
  const uid = user?.uid || '';
  if (uid !== lastUser) {
    lastUser = uid;
    clearTimeout(expiryTimer);
  }
  scheduleSync(120);
});

scheduleSync(150);
