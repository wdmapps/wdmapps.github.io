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

async function ensureProfile(user) {
  const userRef = doc(db, 'users', user.uid);
  const current = await getDoc(userRef);
  const data = {
    name: clean(user.displayName) || 'Lojista',
    email: clean(user.email).toLowerCase(),
    provider: 'google',
    updatedAt: serverTimestamp()
  };
  if (!current.exists()) data.createdAt = serverTimestamp();
  await setDoc(userRef, data, { merge: true });
}

function errorText(error) {
  const code = error?.code || '';
  if (code === 'auth/popup-closed-by-user') return 'Login cancelado.';
  if (code === 'auth/popup-blocked') return 'O navegador bloqueou a janela do Google. Permita pop-ups e tente novamente.';
  if (code === 'auth/unauthorized-domain') return 'Este domínio ainda precisa ser autorizado no Firebase Authentication.';
  if (code === 'auth/account-exists-with-different-credential') return 'Este e-mail já possui outra forma de login. Entre com e-mail e senha primeiro.';
  if (code === 'permission-denied') return 'O login funcionou, mas o Firestore bloqueou o acesso ao perfil.';
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
      await ensureProfile(result.user);
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
