import { getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const EXTRA_STORE_CATEGORIES = [
  'Pet Shop',
  'Farmácia e Saúde',
  'Automotivo',
  'Presentes',
  'Infantil',
  'Esporte e Fitness',
  'Construção',
  'Papelaria e Livraria',
  'Flores e Decoração',
  'Calçados',
  'Joias e Acessórios',
  'Mercado',
  'Cafés e Doces',
  'Restaurantes e Lanches',
  'Imóveis'
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
while (!getApps().length) await sleep(25);

const app = getApp();
const auth = getAuth(app);
const db = getFirestore(app);

function optionValues(select) {
  return new Set([...select.options].map(option => String(option.value || option.textContent || '').trim()));
}

function isStoreCategorySelect(select) {
  const values = optionValues(select);
  return values.has('Tecnologia') || values.has('Alimentação') || values.has('Moda') || values.has('Sex Shop (18+)');
}

function addExtraOptions(select) {
  const values = optionValues(select);
  const anchor = [...select.options].find(option => option.value === 'Sex Shop (18+)')
    || [...select.options].find(option => option.value === 'Outros')
    || null;

  for (const category of EXTRA_STORE_CATEGORIES) {
    if (values.has(category)) continue;
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    if (anchor) select.insertBefore(option, anchor);
    else select.appendChild(option);
    values.add(category);
  }
}

async function currentStoreCategory() {
  const user = auth.currentUser;
  if (!user) return '';

  const [storeSnap, userSnap] = await Promise.all([
    getDoc(doc(db, 'stores', user.uid)).catch(() => null),
    getDoc(doc(db, 'users', user.uid)).catch(() => null)
  ]);

  if (storeSnap?.exists()) {
    const store = storeSnap.data() || {};
    if (store.accountType === 'both' && store.primaryRole === 'provider') {
      return String(store.storeProfile?.category || '');
    }
    return String(store.category || '');
  }

  if (userSnap?.exists()) {
    const pending = userSnap.data()?.pendingStore || {};
    if (pending.accountType !== 'provider') return String(pending.category || '');
  }

  return '';
}

async function prepareSelect(select) {
  if (select.dataset.wdmExtraCategoryState) return;
  if (!isStoreCategorySelect(select)) return;

  select.dataset.wdmExtraCategoryState = 'preparing';
  addExtraOptions(select);

  const savedCategory = await currentStoreCategory().catch(() => '');
  if (savedCategory && [...select.options].some(option => option.value === savedCategory)) {
    select.value = savedCategory;
  }

  select.dataset.wdmExtraCategoryState = 'ready';
}

function scan(root = document) {
  root.querySelectorAll?.('select[name="category"]').forEach(select => {
    prepareSelect(select).catch(error => console.warn('Categorias extras:', error));
  });
}

const root = document.getElementById('app') || document.body;
const observer = new MutationObserver(() => scan(root));
observer.observe(root, { childList: true, subtree: true });
window.addEventListener('hashchange', () => setTimeout(() => scan(root), 60));
scan(root);
