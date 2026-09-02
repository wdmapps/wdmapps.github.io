import { getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js';

const WDM_OWNER_UID = 'cNUIxdJzXIaut7VnoGBx9EAzgRM2';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
while (!getApps().length) await sleep(25);

const firebaseApp = getApp();
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp);
const listAccounts = httpsCallable(functions, 'adminListAccounts');
const setFreeAccess = httpsCallable(functions, 'adminSetFreeAccess');
let loading = false;
let mountTimer = 0;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function addStyles() {
  if (document.getElementById('wdmFreePartnerStyles')) return;
  const style = document.createElement('style');
  style.id = 'wdmFreePartnerStyles';
  style.textContent = `
    .wdmFreePanel{border-color:#285b49!important;background:linear-gradient(180deg,#0b1c1a,#081411)!important}
    .wdmFreeHead{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
    .wdmFreeCount{padding:8px 12px;border-radius:999px;background:#10372b;color:#a9efd2;font-weight:800;font-size:.82rem}
    .wdmFreeGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:18px}
    .wdmFreeCard{border:1px solid #24483e;border-radius:16px;padding:16px;background:#091713}
    .wdmFreeCard h3{margin:4px 0 3px}.wdmFreeCard p{margin:0;color:#91aa9f;font-size:.88rem;word-break:break-word}
    .wdmFreeMeta{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}
    .wdmFreeTag{padding:5px 8px;border-radius:999px;background:#132a24;color:#b5cec4;font-size:.75rem;font-weight:700}
    .wdmFreeTag.on{background:#154b39;color:#b9f5d4}
    .wdmFreeActions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .wdmFreeStatus{min-height:18px;margin-top:8px;color:#9db4aa;font-size:.8rem}
    .wdmFreeError{color:#ffb3b3}.wdmFreeEmpty{padding:16px;border:1px dashed #34584d;border-radius:14px;color:#9db4aa}
    @media(max-width:760px){.wdmFreeGrid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function planLabel(subscription = {}) {
  if (subscription.freePartner) return '🎁 Parceiro FREE';
  if (subscription.provider === 'stripe' && subscription.entitled) return '💳 Assinatura paga';
  if (subscription.provider === 'trial' && subscription.entitled) return '⏳ Teste grátis';
  if (subscription.entitled) return '✅ Liberado';
  return '🔒 Sem acesso';
}

async function renderAdminFreePanel(force = false) {
  if (!location.hash.startsWith('#admin') || auth.currentUser?.uid !== WDM_OWNER_UID || loading) return;
  const host = document.querySelector('.adminWrap section');
  if (!host) return;
  if (!force && document.getElementById('wdmFreeAccountsPanel')) return;

  loading = true;
  let panel = document.getElementById('wdmFreeAccountsPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'wdmFreeAccountsPanel';
    panel.className = 'panel wdmFreePanel';
    const firstPanel = host.querySelector('.panel');
    firstPanel?.insertAdjacentElement('afterend', panel);
  }
  panel.innerHTML = '<span class="ey">Parceiros de lançamento</span><h2>Contas e acesso FREE</h2><p class="muted">Carregando as contas cadastradas...</p>';

  try {
    const result = await listAccounts();
    const accounts = Array.isArray(result?.data?.accounts) ? result.data.accounts : [];
    const freeCount = accounts.filter((item) => item.subscription?.freePartner).length;
    panel.innerHTML = `
      <div class="wdmFreeHead">
        <div><span class="ey">Parceiros de lançamento</span><h2>Contas e acesso FREE</h2><p class="muted">Você escolhe quais contas usam o WDM Shopping gratuitamente.</p></div>
        <span class="wdmFreeCount">${freeCount} parceiro(s) FREE</span>
      </div>
      <div class="wdmFreeGrid">
        ${accounts.map((account) => {
          const sub = account.subscription || {};
          const paid = sub.provider === 'stripe' && sub.entitled === true;
          const action = sub.freePartner ? 'remove' : 'grant';
          return `<article class="wdmFreeCard" data-free-account="${esc(account.uid)}">
            <span class="ey">${esc(account.category || 'Sem categoria')}</span>
            <h3>${esc(account.name || 'Conta sem loja')}</h3>
            <p>${esc(account.email || 'E-mail não informado')}</p>
            <div class="wdmFreeMeta">
              <span class="wdmFreeTag ${sub.freePartner ? 'on' : ''}">${planLabel(sub)}</span>
              <span class="wdmFreeTag">${account.storeExists ? 'Loja criada' : 'Cadastro sem loja'}</span>
              ${account.adminSuspended ? '<span class="wdmFreeTag">Loja suspensa</span>' : ''}
            </div>
            <div class="wdmFreeActions">
              <button class="mini ${sub.freePartner ? 'danger' : 'adminApprove'}" type="button" data-free-action="${action}" ${paid ? 'disabled' : ''}>
                ${paid ? 'Assinatura paga' : sub.freePartner ? 'Remover FREE' : '🎁 Deixar FREE'}
              </button>
            </div>
            <div class="wdmFreeStatus"></div>
          </article>`;
        }).join('') || '<div class="wdmFreeEmpty">Nenhuma conta cadastrada.</div>'}
      </div>`;

    panel.querySelectorAll('[data-free-action]').forEach((button) => {
      button.onclick = async () => {
        const card = button.closest('[data-free-account]');
        const targetUid = card?.dataset.freeAccount;
        const account = accounts.find((item) => item.uid === targetUid);
        if (!account) return;
        const enable = button.dataset.freeAction === 'grant';
        const question = enable
          ? `Deixar ${account.name} como Parceiro FREE? A conta não precisará pagar enquanto o FREE estiver ativo.`
          : `Remover o acesso FREE de ${account.name}? A loja voltará a exigir assinatura.`;
        if (!confirm(question)) return;
        const status = card.querySelector('.wdmFreeStatus');
        button.disabled = true;
        status.className = 'wdmFreeStatus';
        status.textContent = 'Processando...';
        try {
          const response = await setFreeAccess({ targetUid, enabled: enable });
          status.textContent = response?.data?.message || 'Ação concluída.';
          await renderAdminFreePanel(true);
        } catch (error) {
          status.className = 'wdmFreeStatus wdmFreeError';
          status.textContent = error?.message || 'Não foi possível alterar o acesso FREE.';
          button.disabled = false;
        }
      };
    });
  } catch (error) {
    panel.remove();
    console.warn('Painel Parceiro FREE indisponível:', error?.code || error?.message || error);
  } finally {
    loading = false;
  }
}

async function rewritePartnerBillingBar() {
  const user = auth.currentUser;
  if (!user || user.uid === WDM_OWNER_UID || !location.hash.startsWith('#painel')) return;
  const bar = document.getElementById('wdmBillingBar');
  if (!bar || bar.dataset.partnerChecked === user.uid) return;
  bar.dataset.partnerChecked = user.uid;
  try {
    const snapshot = await getDoc(doc(db, 'subscriptions', user.uid));
    if (!snapshot.exists()) return;
    const subscription = snapshot.data() || {};
    const partner = subscription.freePartner === true || subscription.provider === 'partner' || subscription.product === 'wdm-shopping-partner';
    if (!partner || subscription.entitled !== true) return;
    bar.innerHTML = '<span><strong>Parceiro WDM Shopping · acesso gratuito ✓</strong><br><small>Conta FREE liberada pelo administrador.</small></span><a class="btn2" href="suporte.html">Falar com o suporte</a>';
  } catch (error) {
    console.warn('Não foi possível identificar o acesso FREE:', error?.code || error?.message || error);
  }
}

function scheduleMount() {
  clearTimeout(mountTimer);
  mountTimer = setTimeout(() => {
    addStyles();
    renderAdminFreePanel(false);
    rewritePartnerBillingBar();
  }, 80);
}

onAuthStateChanged(auth, scheduleMount);
window.addEventListener('hashchange', scheduleMount);
new MutationObserver(scheduleMount).observe(document.getElementById('app'), { childList: true, subtree: true });
scheduleMount();
