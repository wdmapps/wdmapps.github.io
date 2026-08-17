import { getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js';

window.wdmSubscriptionPanelAccess = false;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
while (!getApps().length) await sleep(25);

const firebaseApp = getApp();
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp);
const appRoot = document.getElementById('app');

const WDM_OWNER_UID = 'cNUIxdJzXIaut7VnoGBx9EAzgRM2';
const PLAN_PRICE = 'R$ 29,90';
const STRIPE_PRICE_ID = 'price_1U5E6WHA6Fom0zgZsj3LMmXu';
const ADULT_CATEGORY = 'Sex Shop (18+)';
const STORE_CATEGORIES = ['Tecnologia','Alimentação','Casa','Moda','Beleza','Serviços','Sex Shop (18+)','Outros'];
const PROVIDER_CATEGORIES = ['Eletricista','Pintor','Técnico de informática','Pedreiro','Encanador','Montador de móveis','Manutenção residencial','Limpeza','Jardinagem','Fotografia','Beleza e estética','Outros serviços'];
const checkoutResult = new URLSearchParams(location.search).get('stripe');
let busy = false;
let refreshTimer = 0;
let checkoutPolling = false;

const createCheckoutSession = httpsCallable(functions, 'createStripeCheckoutSession');
const createPortalSession = httpsCallable(functions, 'createStripePortalSession');

const clean = value => String(value || '').trim();
const digits = value => String(value || '').replace(/\D/g, '');
const whats = value => {
  let d = digits(value);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d.length >= 10 ? '55' + d : d;
};
const slug = value => clean(value || 'minha-loja')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '') || 'minha-loja';
const initials = value => clean(value || 'Minha Loja').split(/\s+/).slice(0, 2)
  .map(part => part[0] || '').join('').toUpperCase() || 'ML';
const phone = value => {
  let d = digits(value);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2), rest = d.slice(2);
  if (d.length <= 10) return `(${ddd}) ${rest.slice(0, 4)}${rest.length > 4 ? '-' + rest.slice(4, 8) : ''}`;
  return `(${ddd}) ${rest.slice(0, 1)}${rest.length > 1 ? ' ' + rest.slice(1, 5) : ''}${rest.length > 5 ? '-' + rest.slice(5, 9) : ''}`;
};

function addStyles() {
  if (document.getElementById('wdmSubscriptionStyles')) return;
  const style = document.createElement('style');
  style.id = 'wdmSubscriptionStyles';
  style.textContent = `
    .subWrap{max-width:860px;margin:48px auto 110px;padding:0 18px}
    .subCard{background:linear-gradient(180deg,#0c1829,#08111f);border:1px solid #243650;border-radius:22px;padding:28px;box-shadow:0 20px 60px #0005}
    .subTop{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;flex-wrap:wrap}
    .subPrice{font-size:2.15rem;font-weight:900;line-height:1;color:#fff}.subPrice small{font-size:.9rem;color:#91a3bb;font-weight:700}
    .subList{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:22px 0}
    .subItem{padding:13px 14px;border:1px solid #20334e;background:#091625;border-radius:14px;color:#c9d6e7}
    .subStatus{padding:12px 14px;border-radius:12px;background:#101f32;color:#b9cbe1;margin:14px 0;line-height:1.45}
    .subStatus.good{background:#0e2a20;color:#a9e9c9}.subStatus.warn{background:#30230d;color:#f2d59a}
    .subActions{display:flex;gap:10px;flex-wrap:wrap}.subActions .btn,.subActions .btn2{min-height:48px;display:inline-flex;align-items:center;justify-content:center}
    .subNote{font-size:.82rem;color:#8193aa;margin-top:12px;line-height:1.5}
    .onboard{max-width:760px;margin:42px auto 110px;padding:0 18px}.onboard .auth{max-width:none}
    .billingBar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 18px;padding:14px 16px;border:1px solid #20334e;background:#0a1728;border-radius:14px;color:#b9cbe1}
    .billingBar strong{color:#b9f5d4}.billingBar button{margin:0}
    @media(max-width:680px){.subList{grid-template-columns:1fr}.subCard{padding:20px}.subPrice{font-size:1.8rem}}
  `;
  document.head.appendChild(style);
}
addStyles();

async function subscription(uid) {
  const snap = await getDoc(doc(db, 'subscriptions', uid));
  return snap.exists() ? snap.data() : null;
}

function entitled(data) {
  if (!data) return false;
  if (data.provider === 'manual' && data.currentPeriodEnd?.toMillis?.() <= Date.now()) return false;
  if (data.entitled === true) return true;
  return ['active', 'grace_period'].includes(String(data.status || '').toLowerCase());
}

async function isAdultAccount(uid) {
  const [storeSnap, userSnap] = await Promise.all([
    getDoc(doc(db, 'stores', uid)),
    getDoc(doc(db, 'users', uid))
  ]);
  if (storeSnap.exists()) {
    const store = storeSnap.data() || {};
    const category = store.primaryRole === 'provider' && store.accountType === 'both'
      ? store.storeProfile?.category
      : store.category;
    if (clean(category).toLowerCase() === ADULT_CATEGORY.toLowerCase()) return true;
  }
  const pendingCategory = userSnap.exists() ? userSnap.data()?.pendingStore?.category : '';
  return clean(pendingCategory).toLowerCase() === ADULT_CATEGORY.toLowerCase();
}

function statusLabel(data) {
  const s = String(data?.status || 'inactive').toLowerCase();
  return ({
    active: 'Assinatura ativa',
    grace_period: 'Pagamento em período de tolerância',
    cancelled: 'Assinatura cancelada',
    canceled: 'Assinatura cancelada',
    on_hold: 'Pagamento pendente',
    paused: 'Assinatura pausada',
    expired: 'Assinatura vencida',
    pending: 'Pagamento em processamento',
    inactive: 'Sem assinatura ativa'
  })[s] || 'Sem assinatura ativa';
}

function cleanCheckoutQuery() {
  if (!location.search) return;
  history.replaceState({}, '', `${location.pathname}${location.hash || '#painel'}`);
}

async function openStripeCheckout(messageElement) {
  if (!auth.currentUser) return;
  messageElement.textContent = 'Abrindo o pagamento seguro da Stripe...';
  try {
    const result = await createCheckoutSession();
    const url = result?.data?.url;
    if (!url) throw new Error('A Stripe não retornou o endereço do Checkout.');
    location.href = url;
  } catch (error) {
    console.error('Stripe Checkout:', error);
    const code = String(error?.code || '');
    messageElement.textContent = code.includes('failed-precondition')
      ? 'Esta conta já possui uma assinatura ativa. Clique em verificar.'
      : 'Não foi possível abrir o pagamento agora. Tente novamente em instantes.';
  }
}

async function openBillingPortal(messageElement) {
  if (!auth.currentUser) return;
  if (messageElement) messageElement.textContent = 'Abrindo o gerenciamento da assinatura...';
  try {
    const result = await createPortalSession();
    const url = result?.data?.url;
    if (!url) throw new Error('A Stripe não retornou o endereço do portal.');
    location.href = url;
  } catch (error) {
    console.error('Stripe Portal:', error);
    if (messageElement) messageElement.textContent = 'O portal da assinatura ainda não está disponível. Tente novamente mais tarde.';
  }
}

function renderPaywall(data) {
  if (appRoot.dataset.wdmSubscriptionView === 'paywall') return;
  appRoot.dataset.wdmSubscriptionView = 'paywall';
  const label = statusLabel(data);
  const cls = data?.status === 'pending' || data?.status === 'on_hold' ? 'warn' : '';
  const checkoutMessage = checkoutResult === 'success'
    ? 'Pagamento concluído. Estamos aguardando a confirmação automática da Stripe...'
    : checkoutResult === 'cancel'
      ? 'Pagamento cancelado. Nenhuma assinatura foi iniciada.'
      : `Pagamento seguro processado pela Stripe. Plano mensal ${PLAN_PRICE}.`;
  const hasStripeCustomer = Boolean(data?.stripeCustomerId);

  appRoot.innerHTML = `
    <div class="subWrap">
      <section class="subCard">
        <div class="subTop">
          <div>
            <span class="ey">WDM Shopping para negócios locais</span>
            <h1>Publique sua loja ou perfil profissional</h1>
            <p class="muted">Seu cadastro é gratuito. Para publicar e administrar sua página é necessária uma assinatura mensal.</p>
          </div>
          <div class="subPrice">${PLAN_PRICE}<small>/mês</small></div>
        </div>
        <div class="subList">
          <div class="subItem">✓ Loja ou perfil no WDM Shopping</div>
          <div class="subItem">✓ Produtos e serviços com fotos</div>
          <div class="subItem">✓ Contatos direto pelo WhatsApp</div>
          <div class="subItem">✓ Página profissional personalizada</div>
        </div>
        <div class="subStatus ${cls}"><strong>${label}</strong><br>O painel é liberado automaticamente depois que a Stripe confirmar a assinatura.</div>
        <div class="subActions">
          <button id="subscribeStripe" class="btn" type="button">Assinar ${PLAN_PRICE}/mês</button>
          <button id="checkSubscription" class="btn2" type="button">Já paguei · verificar</button>
          ${hasStripeCustomer ? '<button id="manageStripe" class="btn2" type="button">Gerenciar assinatura</button>' : ''}
          <button id="subscriptionLogout" class="btn2" type="button">Sair</button>
        </div>
        <div id="subscriptionMsg" class="subNote">${checkoutMessage}</div>
      </section>
    </div>`;

  const msg = document.getElementById('subscriptionMsg');
  document.getElementById('subscribeStripe').onclick = () => openStripeCheckout(msg);

  document.getElementById('checkSubscription').onclick = async () => {
    msg.textContent = 'Verificando sua assinatura na conta...';
    const latest = await subscription(auth.currentUser.uid).catch(() => null);
    if (entitled(latest)) {
      msg.textContent = 'Assinatura confirmada. Liberando sua loja...';
      cleanCheckoutQuery();
      appRoot.dataset.wdmSubscriptionView = '';
      await guardPanel(true);
    } else {
      msg.textContent = 'A Stripe ainda não confirmou uma assinatura ativa para esta conta.';
    }
  };

  const manage = document.getElementById('manageStripe');
  if (manage) manage.onclick = () => openBillingPortal(msg);

  document.getElementById('subscriptionLogout').onclick = async () => {
    await signOut(auth);
    location.hash = '#home';
  };

  if (checkoutResult === 'success') pollCheckoutConfirmation();
}

function renderAdultManualGate(data) {
  if (appRoot.dataset.wdmSubscriptionView === 'adult-manual') return;
  appRoot.dataset.wdmSubscriptionView = 'adult-manual';
  appRoot.innerHTML = `
    <div class="subWrap">
      <section class="subCard adultManualCard">
        <span class="ey">Cadastro de loja 18+</span>
        <h1>Liberação manual do administrador</h1>
        <p class="muted">Por regras do processador de pagamentos, lojas Sex Shop não assinam pela Stripe. Fale com o suporte para combinar o pagamento e a análise da loja.</p>
        <div class="subStatus warn"><strong>${statusLabel(data)}</strong><br>Depois da confirmação, o administrador libera seu painel e sua vitrine manualmente.</div>
        <div class="subActions">
          <a class="btn" href="https://wa.me/5511969188837?text=${encodeURIComponent('Olá! Cadastrei uma loja Sex Shop no WDM Shopping e preciso solicitar a liberação manual.')}" target="_blank" rel="noreferrer">Solicitar liberação no WhatsApp</a>
          <button id="adultSubscriptionLogout" class="btn2" type="button">Sair</button>
        </div>
        <div class="subNote">Anúncios de produtos adultos passam por aprovação individual antes de aparecerem na home.</div>
      </section>
    </div>`;
  document.getElementById('adultSubscriptionLogout').onclick = async () => {
    await signOut(auth);
    location.hash = '#home';
  };
}

async function pollCheckoutConfirmation() {
  if (checkoutPolling || !auth.currentUser) return;
  checkoutPolling = true;
  const msg = () => document.getElementById('subscriptionMsg');
  for (let attempt = 0; attempt < 10; attempt++) {
    await sleep(attempt === 0 ? 800 : 1800);
    const latest = await subscription(auth.currentUser.uid).catch(() => null);
    if (entitled(latest)) {
      if (msg()) msg().textContent = 'Assinatura confirmada ✓ Liberando sua loja...';
      cleanCheckoutQuery();
      appRoot.dataset.wdmSubscriptionView = '';
      checkoutPolling = false;
      await guardPanel(true);
      return;
    }
  }
  if (msg()) msg().textContent = 'O pagamento foi concluído, mas a confirmação está demorando um pouco. Clique em “Já paguei · verificar” em alguns instantes.';
  checkoutPolling = false;
}

async function uniqueSlug(baseName) {
  const base = slug(baseName);
  let candidate = base;
  let n = 2;
  while ((await getDoc(doc(db, 'slugs', candidate))).exists()) candidate = `${base}-${n++}`;
  return candidate;
}

async function renderOnboarding(user) {
  if (appRoot.dataset.wdmSubscriptionView === 'onboarding') return;
  appRoot.dataset.wdmSubscriptionView = 'onboarding';
  const profileSnap = await getDoc(doc(db, 'users', user.uid));
  const profile = profileSnap.exists() ? profileSnap.data() : {};
  const pending = profile.pendingStore || {};
  const providerAccount = pending.accountType === 'provider';
  const adultPending = !providerAccount && clean(pending.category).toLowerCase() === ADULT_CATEGORY.toLowerCase();
  const categories = providerAccount ? PROVIDER_CATEGORIES : STORE_CATEGORIES;
  appRoot.innerHTML = `
    <div class="onboard">
      <section class="auth">
        <span class="ey">Assinatura confirmada ✓</span>
        <h1>${providerAccount ? 'Agora vamos criar seu perfil profissional' : 'Agora vamos criar sua loja'}</h1>
        <p class="muted">Esses dados poderão ser alterados depois no painel.</p>
        <form id="storeOnboarding" class="form">
          <div class="two">
            <div class="field"><label>${providerAccount ? 'Nome profissional ou empresa' : 'Nome do negócio'}</label><input name="business" required value="${clean(pending.business).replace(/"/g, '&quot;')}"></div>
            <div class="field"><label>${providerAccount ? 'Profissão ou categoria' : 'Categoria'}</label><select name="category" ${adultPending ? 'disabled' : ''}>${categories.map(x => `<option ${x === pending.category ? 'selected' : ''}>${x}</option>`).join('')}</select>${adultPending ? '<small class="muted">Categoria 18+ confirmada no cadastro.</small>' : ''}</div>
          </div>
          <div class="field"><label>WhatsApp</label><input id="onboardPhone" name="phone" inputmode="tel" value="${phone(pending.phone || '')}" placeholder="(11) 9 9999-9999"></div>
          ${providerAccount ? `<div class="field"><label>Cidade e bairro onde atende</label><input name="location" value="${clean(pending.location).replace(/"/g, '&quot;')}" placeholder="Ex.: Salto — São Pedro e São Paulo"></div>` : ''}
          <div class="field"><label>${providerAccount ? 'Apresentação profissional' : 'Descrição'}</label><textarea name="description" placeholder="${providerAccount ? 'Conte sua experiência e especialidades' : 'Conte um pouco sobre sua loja'}"></textarea></div>
          <div id="onboardStatus" class="status"></div>
          <button class="btn" type="submit">${providerAccount ? 'Criar meu perfil profissional' : 'Criar minha loja'}</button>
        </form>
      </section>
    </div>`;

  const form = document.getElementById('storeOnboarding');
  const phoneField = document.getElementById('onboardPhone');
  phoneField.oninput = e => e.target.value = phone(e.target.value);
  form.onsubmit = async event => {
    event.preventDefault();
    const st = document.getElementById('onboardStatus');
    const f = new FormData(form);
    const business = clean(f.get('business'));
    if (!business) return;
    st.className = 'status';
    st.textContent = providerAccount ? 'Criando seu perfil profissional...' : 'Criando sua loja...';
    try {
      const sid = await uniqueSlug(business);
      await setDoc(doc(db, 'stores', user.uid), {
        ownerId: user.uid,
        slug: sid,
        accountType: providerAccount ? 'provider' : 'store',
        primaryRole: providerAccount ? 'provider' : 'store',
        name: business,
        category: adultPending ? ADULT_CATEGORY : (clean(f.get('category')) || 'Outros'),
        initials: initials(business),
        primary: '#2f7df6',
        description: clean(f.get('description')) || (providerAccount ? 'Profissional disponível para atender você.' : 'Bem-vindo à nossa vitrine no WDM Shopping.'),
        location: clean(f.get('location')),
        whatsapp: whats(f.get('phone')),
        instagram: '',
        promo: providerAccount ? 'Solicite seu orçamento pelo WhatsApp.' : 'Confira nossas novidades!',
        published: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      await setDoc(doc(db, 'slugs', sid), { storeId: user.uid, ownerId: user.uid, createdAt: serverTimestamp() });
      await setDoc(doc(db, 'users', user.uid), { accountType: providerAccount ? 'provider' : 'store', storeId: user.uid, pendingStore: null, updatedAt: serverTimestamp() }, { merge: true });
      appRoot.dataset.wdmSubscriptionView = '';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      st.className = 'status err';
      st.textContent = error?.code === 'permission-denied'
        ? 'A assinatura ainda não foi liberada pelas regras do sistema.'
        : (error?.message || 'Não foi possível criar a loja.');
    }
  };
}

async function installBillingBar() {
  if (!location.hash.startsWith('#painel') || appRoot.dataset.wdmSubscriptionView || !auth.currentUser || auth.currentUser.uid === WDM_OWNER_UID) return;
  if (document.getElementById('wdmBillingBar')) return;
  const firstPanel = document.querySelector('.panelWrap .panel');
  if (!firstPanel) return;
  const data = await subscription(auth.currentUser.uid).catch(() => null);
  if (!entitled(data) || document.getElementById('wdmBillingBar')) return;
  const bar = document.createElement('div');
  bar.id = 'wdmBillingBar';
  bar.className = 'billingBar';
  const manual = data?.provider === 'manual';
  const end = data?.currentPeriodEnd?.toDate?.();
  bar.innerHTML = manual
    ? `<span><strong>Acesso manual liberado ✓</strong><br><small>${end ? `Válido até ${end.toLocaleDateString('pt-BR')}` : 'Liberação administrada pelo WDM Shopping'}</small></span><a class="btn2" href="suporte.html">Falar com o suporte</a>`
    : '<span><strong>Assinatura Stripe ativa ✓</strong><br><small>Plano WDM Shopping · R$ 29,90/mês</small></span><button class="btn2" type="button">Gerenciar pagamento</button>';
  if (!manual) bar.querySelector('button').onclick = () => openBillingPortal(bar.querySelector('small'));
  firstPanel.prepend(bar);
}

async function guardPanel(force = false) {
  if (!location.hash.startsWith('#painel') || !auth.currentUser || busy) return;
  busy = true;
  try {
    const isOwner = auth.currentUser.uid === WDM_OWNER_UID;
    const sub = isOwner ? null : await subscription(auth.currentUser.uid).catch(() => null);
    if (!isOwner && !entitled(sub)) {
      window.wdmSubscriptionPanelAccess = false;
      if (await isAdultAccount(auth.currentUser.uid)) renderAdultManualGate(sub);
      else renderPaywall(sub);
      return;
    }
    const shouldRefreshPanel = window.wdmSubscriptionPanelAccess !== true || force;
    window.wdmSubscriptionPanelAccess = true;
    const storeSnap = await getDoc(doc(db, 'stores', auth.currentUser.uid));
    if (!storeSnap.exists()) {
      cleanCheckoutQuery();
      await renderOnboarding(auth.currentUser);
      return;
    }
    if (appRoot.dataset.wdmSubscriptionView) {
      appRoot.dataset.wdmSubscriptionView = '';
      cleanCheckoutQuery();
    }
    if (shouldRefreshPanel) window.dispatchEvent(new HashChangeEvent('hashchange'));
    setTimeout(installBillingBar, 80);
  } finally {
    busy = false;
  }
}

function scheduleGuard() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => guardPanel(false), 40);
}

function installRegistrationInterceptor() {
  if (!location.hash.startsWith('#cadastro')) return;
  const form = document.getElementById('authForm');
  if (!form || form.dataset.subscriptionIntercepted) return;
  form.dataset.subscriptionIntercepted = '1';
  form.addEventListener('submit', async event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const status = document.getElementById('status');
    const f = new FormData(form);
    const email = clean(f.get('email')).toLowerCase();
    const password = String(f.get('password') || '');
    status.className = 'status';
    status.textContent = 'Criando sua conta...';
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        name: clean(f.get('name')),
        email,
        provider: 'password',
        pendingStore: {
          accountType: clean(f.get('accountType')) === 'provider' ? 'provider' : 'store',
          business: clean(f.get('business')),
          category: clean(f.get('category')) || 'Outros',
          phone: clean(f.get('phone')),
          location: clean(f.get('location'))
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
      location.hash = '#painel';
    } catch (error) {
      const code = error?.code || '';
      const messages = {
        'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
        'auth/invalid-email': 'Digite um e-mail válido.',
        'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
        'auth/operation-not-allowed': 'Ative E-mail/Senha no Firebase Authentication.'
      };
      status.className = 'status err';
      status.textContent = messages[code] || error?.message || 'Não foi possível criar sua conta.';
    }
  }, true);
}

const observer = new MutationObserver(() => {
  installRegistrationInterceptor();
  scheduleGuard();
  setTimeout(installBillingBar, 100);
});
observer.observe(appRoot, { childList: true, subtree: true });
window.addEventListener('hashchange', () => {
  if (!location.hash.startsWith('#painel')) window.wdmSubscriptionPanelAccess = false;
  installRegistrationInterceptor();
  scheduleGuard();
  setTimeout(installBillingBar, 100);
});
onAuthStateChanged(auth, () => {
  window.wdmSubscriptionPanelAccess = false;
  scheduleGuard();
});
installRegistrationInterceptor();
scheduleGuard();

window.wdmSubscriptionRefresh = () => guardPanel(true);
window.wdmStripePortal = () => openBillingPortal(null);
window.wdmStripePriceId = STRIPE_PRICE_ID;
