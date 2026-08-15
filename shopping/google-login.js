import { getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
while (!getApps().length) await sleep(25);

const firebaseApp = getApp();
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

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

async function uniqueSlug(baseName) {
  const base = slug(baseName);
  let candidate = base;
  let n = 2;
  while ((await getDoc(doc(db, 'slugs', candidate))).exists()) candidate = `${base}-${n++}`;
  return candidate;
}

async function ensureStore(user) {
  // Primeiro verificamos o perfil do próprio usuário. Esta leitura é permitida
  // pelas regras mesmo quando o documento ainda não existe.
  const userRef = doc(db, 'users', user.uid);
  const profile = await getDoc(userRef);
  if (profile.exists()) return;

  const storeRef = doc(db, 'stores', user.uid);
  const businessField = document.querySelector('#authForm [name="business"]');
  const categoryField = document.querySelector('#authForm [name="category"]');
  const phoneField = document.querySelector('#authForm [name="phone"]');
  const business = clean(businessField?.value) || clean(user.displayName) || 'Minha Loja';
  const category = clean(categoryField?.value) || 'Outros';
  const sid = await uniqueSlug(business);

  await setDoc(storeRef, {
    ownerId: user.uid,
    slug: sid,
    name: business,
    category,
    initials: initials(business),
    primary: '#2f7df6',
    description: 'Bem-vindo à nossa vitrine no WDM Shopping.',
    whatsapp: whats(phoneField?.value),
    instagram: '',
    promo: 'Confira nossas novidades!',
    published: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await setDoc(doc(db, 'slugs', sid), {
    storeId: user.uid,
    ownerId: user.uid,
    createdAt: serverTimestamp()
  });

  await setDoc(userRef, {
    name: clean(user.displayName) || business,
    email: clean(user.email).toLowerCase(),
    storeId: user.uid,
    provider: 'google',
    createdAt: serverTimestamp()
  }, { merge: true });
}

function errorText(error) {
  const code = error?.code || '';
  if (code === 'auth/popup-closed-by-user') return 'Login cancelado.';
  if (code === 'auth/popup-blocked') return 'O navegador bloqueou a janela do Google. Permita pop-ups e tente novamente.';
  if (code === 'auth/unauthorized-domain') return 'Este domínio ainda precisa ser autorizado no Firebase Authentication.';
  if (code === 'auth/account-exists-with-different-credential') return 'Este e-mail já possui outra forma de login. Entre com e-mail e senha primeiro.';
  if (code === 'permission-denied') return 'O login funcionou, mas o Firestore bloqueou a criação da loja. Atualize as regras e tente novamente.';
  return error?.message || 'Não foi possível entrar com Google.';
}

function openPanel() {
  if (location.hash === '#painel') {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = '#painel';
  }
}

function addGoogleButton() {
  const form = document.getElementById('authForm');
  if (!form || document.getElementById('googleLogin')) return;

  const button = document.createElement('button');
  button.id = 'googleLogin';
  button.type = 'button';
  button.className = 'btn2';
  button.style.cssText = 'width:100%;min-height:48px;display:flex;align-items:center;justify-content:center;gap:10px;margin-top:4px;background:#fff;color:#172033;border-color:#d7deea';
  button.innerHTML = '<span style="font-size:1.15rem;font-weight:900;color:#4285f4">G</span><span>Continuar com Google</span>';

  const separator = document.createElement('div');
  separator.style.cssText = 'display:flex;align-items:center;gap:10px;color:#71839a;font-size:.75rem;margin:2px 0';
  separator.innerHTML = '<span style="height:1px;background:#263a56;flex:1"></span><span>ou</span><span style="height:1px;background:#263a56;flex:1"></span>';

  form.prepend(separator);
  form.prepend(button);

  button.addEventListener('click', async () => {
    const status = document.getElementById('status');
    button.disabled = true;
    button.querySelector('span:last-child').textContent = 'Entrando...';
    if (status) { status.className = 'status'; status.textContent = ''; }
    try {
      const result = await signInWithPopup(auth, provider);
      await ensureStore(result.user);
      openPanel();
    } catch (error) {
      if (status) { status.className = 'status err'; status.textContent = errorText(error); }
    } finally {
      button.disabled = false;
      const label = button.querySelector('span:last-child');
      if (label) label.textContent = 'Continuar com Google';
    }
  });
}

const observer = new MutationObserver(addGoogleButton);
observer.observe(document.getElementById('app'), { childList: true, subtree: true });
addGoogleButton();
