import { getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
while (!getApps().length) await sleep(25);

const firebaseApp = getApp();
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);
const appRoot = document.getElementById('app');
const states = new WeakMap();

const digits = value => String(value ?? '').replace(/\D/g, '');
const priceNumber = value => {
  const d = digits(value);
  return d ? Number(d) / 100 : 0;
};
const formatBytes = bytes => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
};

function addStyles() {
  if (document.getElementById('wdmPhotoStyles')) return;
  const style = document.createElement('style');
  style.id = 'wdmPhotoStyles';
  style.textContent = `
    .photoBox{border:1px solid var(--line);border-radius:15px;background:#07111f;padding:14px;display:grid;gap:10px}
    .photoBox>label{font-size:.77rem;color:#b8c7da;font-weight:800}
    .photoActions{display:flex;gap:8px;flex-wrap:wrap}
    .photoActions button{flex:1;min-width:145px}
    .photoPreview{display:none;grid-template-columns:110px 1fr;gap:12px;align-items:center;padding-top:4px}
    .photoPreview.on{display:grid}
    .photoPreview img{width:110px;height:88px;object-fit:cover;border-radius:12px;border:1px solid var(--line);background:#0b182b}
    .photoInfo{color:var(--muted);font-size:.82rem;line-height:1.5}
    .photoInfo strong{display:block;color:#bfe5ff;margin-bottom:3px}
    .productPhoto{display:block;width:calc(100% + 32px);height:180px;margin:-16px -16px 14px;object-fit:cover;background:#0c192c;border-bottom:1px solid var(--line)}
    .prodThumb{width:62px;height:52px;object-fit:cover;border-radius:10px;border:1px solid var(--line);margin:0 10px 0 0;float:left;background:#0c192c}
    @media(max-width:560px){.photoPreview{grid-template-columns:90px 1fr}.photoPreview img{width:90px;height:74px}.productPhoto{height:210px}}
  `;
  document.head.appendChild(style);
}

async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { try { return await createImageBitmap(file); } catch {} }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Não foi possível ler esta imagem.'));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível preparar a foto.')), type, quality);
  });
}

async function compressImage(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
  if (file.size > 25 * 1024 * 1024) throw new Error('A foto original é muito grande. Escolha uma imagem de até 25 MB.');

  const bitmap = await loadBitmap(file);
  const width = bitmap.width || bitmap.naturalWidth;
  const height = bitmap.height || bitmap.naturalHeight;
  if (!width || !height) throw new Error('Não foi possível identificar o tamanho da foto.');

  // Fotos que já estão leves e em tamanho adequado não sofrem nova perda de qualidade.
  if (file.size <= 700 * 1024 && Math.max(width, height) <= 1600 && /image\/(jpeg|webp)/i.test(file.type)) {
    if (bitmap.close) bitmap.close();
    return { blob: file, width, height, changed: false };
  }

  const attempts = [
    { max: 1600, quality: .86 },
    { max: 1600, quality: .80 },
    { max: 1400, quality: .80 },
    { max: 1280, quality: .78 }
  ];
  let best = null;

  for (const attempt of attempts) {
    const scale = Math.min(1, attempt.max / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);

    let blob;
    try { blob = await canvasBlob(canvas, 'image/webp', attempt.quality); }
    catch { blob = await canvasBlob(canvas, 'image/jpeg', attempt.quality); }
    best = { blob, width: w, height: h, changed: true };
    if (blob.size <= 900 * 1024) break;
  }

  if (bitmap.close) bitmap.close();
  if (!best) throw new Error('Não foi possível reduzir a foto.');

  // Nunca envia uma versão comprimida maior que o arquivo original.
  if (best.blob.size >= file.size && file.size <= 2 * 1024 * 1024) {
    return { blob: file, width, height, changed: false };
  }
  return best;
}

function stateFor(form) {
  let state = states.get(form);
  if (!state) {
    state = { blob: null, original: null, existingUrl: '', existingPath: '', remove: false, previewUrl: '', processing: false };
    states.set(form, state);
  }
  return state;
}

function clearPreviewUrl(state) {
  if (state.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = '';
}

function renderPreview(form) {
  const state = stateFor(form);
  const box = form.querySelector('[data-photo-preview]');
  const img = form.querySelector('[data-photo-img]');
  const info = form.querySelector('[data-photo-info]');
  const removeBtn = form.querySelector('[data-photo-remove]');
  const url = state.blob ? state.previewUrl : (!state.remove ? state.existingUrl : '');

  if (!url) {
    box?.classList.remove('on');
    if (img) img.removeAttribute('src');
    if (info) info.innerHTML = 'Adicione uma foto para destacar o produto na vitrine.';
    if (removeBtn) removeBtn.style.display = 'none';
    return;
  }

  box?.classList.add('on');
  if (img) img.src = url;
  if (removeBtn) removeBtn.style.display = '';
  if (info && state.blob && state.original) {
    const reduced = state.blob.size < state.original.size;
    info.innerHTML = `<strong>${reduced ? 'Foto otimizada antes do envio' : 'Foto pronta para envio'}</strong>${formatBytes(state.original.size)} → ${formatBytes(state.blob.size)}${reduced ? ' · menos espaço, boa qualidade' : ' · sem recompressão desnecessária'}`;
  } else if (info) {
    info.innerHTML = '<strong>Foto atual do produto</strong>Escolha outra imagem para substituir ou remova a atual.';
  }
}

async function chooseFile(form, file) {
  const status = form.querySelector('#prodSt');
  const button = form.querySelector('button[type="submit"]');
  const state = stateFor(form);
  state.processing = true;
  if (button) button.disabled = true;
  try {
    if (status) { status.className = 'status'; status.textContent = 'Otimizando foto...'; }
    const result = await compressImage(file);
    clearPreviewUrl(state);
    state.original = file;
    state.blob = result.blob;
    state.remove = false;
    state.previewUrl = URL.createObjectURL(result.blob);
    renderPreview(form);
    if (status) status.textContent = '';
  } catch (error) {
    if (status) { status.className = 'status err'; status.textContent = error.message || 'Não foi possível preparar a foto.'; }
  } finally {
    state.processing = false;
    if (button) button.disabled = false;
  }
}

function enhanceProductForm() {
  const form = document.getElementById('prodForm');
  if (!form || form.dataset.photoReady === '1') return;
  form.dataset.photoReady = '1';
  const state = stateFor(form);

  const box = document.createElement('div');
  box.className = 'photoBox';
  box.innerHTML = `
    <label>Foto do produto</label>
    <div class="photoActions">
      <button type="button" class="btn2" data-photo-camera>📷 Tirar foto</button>
      <button type="button" class="btn2" data-photo-gallery>🖼️ Escolher foto</button>
      <button type="button" class="mini danger" data-photo-remove style="display:none">Remover foto</button>
    </div>
    <input data-camera-input type="file" accept="image/*" capture="environment" hidden>
    <input data-gallery-input type="file" accept="image/*" hidden>
    <div class="photoPreview" data-photo-preview>
      <img data-photo-img alt="Prévia da foto do produto">
      <div class="photoInfo" data-photo-info></div>
    </div>
  `;

  const status = form.querySelector('#prodSt');
  form.insertBefore(box, status || form.lastElementChild);
  const camera = box.querySelector('[data-camera-input]');
  const gallery = box.querySelector('[data-gallery-input]');
  box.querySelector('[data-photo-camera]').onclick = () => camera.click();
  box.querySelector('[data-photo-gallery]').onclick = () => gallery.click();
  camera.onchange = () => camera.files?.[0] && chooseFile(form, camera.files[0]);
  gallery.onchange = () => gallery.files?.[0] && chooseFile(form, gallery.files[0]);
  box.querySelector('[data-photo-remove]').onclick = () => {
    clearPreviewUrl(state);
    state.blob = null;
    state.original = null;
    state.remove = true;
    renderPreview(form);
  };
  renderPreview(form);
}

function extensionFor(blob) {
  if (blob.type === 'image/webp') return 'webp';
  if (blob.type === 'image/png') return 'png';
  return 'jpg';
}

function storageMessage(error) {
  const code = error?.code || '';
  if (code === 'storage/unauthorized') return 'O Storage bloqueou o envio. Publique as regras do Storage do WDM Shopping.';
  if (code === 'storage/bucket-not-found' || code === 'storage/object-not-found') return 'Ative o Cloud Storage no projeto WDM Shopping e tente novamente.';
  if (code === 'storage/quota-exceeded') return 'O limite do Storage foi atingido.';
  return error?.message || 'Não foi possível enviar a foto.';
}

async function saveProductWithImage(form) {
  if (!auth.currentUser) throw new Error('Entre novamente na sua conta.');
  const state = stateFor(form);
  const f = new FormData(form);
  const productId = String(f.get('id') || '');
  const refDoc = productId ? doc(db, 'stores', auth.currentUser.uid, 'products', productId) : doc(collection(db, 'stores', auth.currentUser.uid, 'products'));
  const name = String(f.get('name') || '').trim();
  const price = priceNumber(f.get('price'));
  if (!name || price <= 0) throw new Error('Informe nome e preço maior que zero.');

  let oldPath = '';
  if (productId) {
    const old = await getDoc(refDoc);
    if (old.exists()) oldPath = old.data().imagePath || '';
  }

  const data = {
    name,
    price,
    oldPrice: priceNumber(f.get('oldPrice')),
    description: String(f.get('description') || '').trim(),
    featured: f.get('featured') === 'on',
    active: f.get('active') === 'on',
    updatedAt: serverTimestamp()
  };

  let newPath = '';
  if (state.blob) {
    const ext = extensionFor(state.blob);
    newPath = `stores/${auth.currentUser.uid}/products/${refDoc.id}/cover-${Date.now()}.${ext}`;
    const imageRef = storageRef(storage, newPath);
    await uploadBytes(imageRef, state.blob, {
      contentType: state.blob.type || 'image/jpeg',
      cacheControl: 'public,max-age=31536000,immutable',
      customMetadata: { ownerId: auth.currentUser.uid, productId: refDoc.id }
    });
    data.imageUrl = await getDownloadURL(imageRef);
    data.imagePath = newPath;
    data.imageBytes = state.blob.size;
  } else if (state.remove) {
    data.imageUrl = '';
    data.imagePath = '';
    data.imageBytes = 0;
  }

  if (!productId) data.createdAt = serverTimestamp();
  await setDoc(refDoc, data, { merge: true });

  if (oldPath && (newPath || state.remove) && oldPath !== newPath) {
    deleteObject(storageRef(storage, oldPath)).catch(() => {});
  }
}

// Assume o salvamento do produto para incluir a foto no mesmo documento do Firestore.
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.id !== 'prodForm' || form.dataset.photoReady !== '1') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const status = form.querySelector('#prodSt');
  const button = form.querySelector('button[type="submit"]');
  if (stateFor(form).processing) {
    if (status) { status.className = 'status'; status.textContent = 'Aguarde a foto ficar pronta antes de salvar.'; }
    return;
  }
  if (button) button.disabled = true;
  if (status) { status.className = 'status'; status.textContent = stateFor(form).blob ? 'Enviando foto otimizada...' : 'Salvando produto...'; }
  try {
    await saveProductWithImage(form);
    if (status) status.textContent = 'Produto salvo';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (error) {
    if (status) { status.className = 'status err'; status.textContent = error?.code?.startsWith('storage/') ? storageMessage(error) : (error.message || 'Não foi possível salvar o produto.'); }
  } finally {
    if (button) button.disabled = false;
  }
}, true);

// Carrega a foto atual quando o lojista clica em Editar.
document.addEventListener('click', async event => {
  const edit = event.target.closest?.('[data-edit]');
  if (!edit || !auth.currentUser) return;
  const form = document.getElementById('prodForm');
  if (!form) return;
  try {
    const snap = await getDoc(doc(db, 'stores', auth.currentUser.uid, 'products', edit.dataset.edit));
    if (!snap.exists()) return;
    const data = snap.data();
    const state = stateFor(form);
    clearPreviewUrl(state);
    state.blob = null;
    state.original = null;
    state.remove = false;
    state.existingUrl = data.imageUrl || '';
    state.existingPath = data.imagePath || '';
    renderPreview(form);
  } catch {}
});

// Excluir produto também remove a foto correspondente do Storage.
document.addEventListener('click', async event => {
  const del = event.target.closest?.('[data-del]');
  if (!del || !auth.currentUser) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const uid = auth.currentUser.uid;
  try {
    const refDoc = doc(db, 'stores', uid, 'products', del.dataset.del);
    const snap = await getDoc(refDoc);
    const imagePath = snap.exists() ? (snap.data().imagePath || '') : '';
    await deleteDoc(refDoc);
    if (imagePath) await deleteObject(storageRef(storage, imagePath)).catch(() => {});
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (error) {
    console.error('Falha ao excluir produto:', error);
  }
}, true);

async function decorateStoreProducts() {
  const match = (location.hash || '').match(/^#loja\/(.+)$/);
  const cards = [...document.querySelectorAll('.productGrid .product')];
  if (!match || !cards.length || cards.some(card => card.dataset.photoDecorated === '1')) return;

  const slugId = decodeURIComponent(match[1]);
  try {
    const slugSnap = await getDoc(doc(db, 'slugs', slugId));
    if (!slugSnap.exists()) return; // lojas de demonstração não possuem fotos reais
    const storeId = slugSnap.data().storeId;
    const snaps = await getDocs(query(collection(db, 'stores', storeId, 'products'), where('active', '==', true)));
    const products = snaps.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => Number(b.featured) - Number(a.featured));
    cards.forEach((card, index) => {
      card.dataset.photoDecorated = '1';
      const product = products[index];
      if (!product?.imageUrl) return;
      const img = document.createElement('img');
      img.className = 'productPhoto';
      img.src = product.imageUrl;
      img.alt = `Foto de ${product.name || 'produto'}`;
      img.loading = 'lazy';
      card.prepend(img);
    });
  } catch (error) {
    console.warn('Não foi possível carregar fotos dos produtos:', error?.code || error);
  }
}

async function decoratePanelProducts() {
  if (location.hash !== '#painel' || !auth.currentUser) return;
  const rows = [...document.querySelectorAll('#plist .prod')];
  if (!rows.length || rows.some(row => row.dataset.photoDecorated === '1')) return;
  try {
    const snaps = await getDocs(collection(db, 'stores', auth.currentUser.uid, 'products'));
    const products = snaps.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => Number(b.featured) - Number(a.featured));
    rows.forEach((row, index) => {
      row.dataset.photoDecorated = '1';
      const product = products[index];
      if (!product?.imageUrl) return;
      const img = document.createElement('img');
      img.className = 'prodThumb';
      img.src = product.imageUrl;
      img.alt = '';
      img.loading = 'lazy';
      row.firstElementChild?.prepend(img);
    });
  } catch {}
}

let timer;
function enhance() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    enhanceProductForm();
    decorateStoreProducts();
    decoratePanelProducts();
  }, 40);
}

addStyles();
const observer = new MutationObserver(enhance);
observer.observe(appRoot, { childList: true, subtree: true });
window.addEventListener('hashchange', enhance);
enhance();
