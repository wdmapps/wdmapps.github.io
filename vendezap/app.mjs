import { STATUSES, MAX_ADS, MAX_PHOTOS, MAX_BACKUP_BYTES, blankProfile, escapeHtml as esc, validateAd, validateBackup, validateProfile, buildShareText, filterAds, mergeAds } from './core.mjs?v=20261027.1';
import { readState, writeState } from './storage.mjs?v=20261027.1';

const $ = selector => document.querySelector(selector);
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
let state = { ads: [], profile: blankProfile() };
let ready = false, editingId = null, selectedId = null, photos = [], editorDirty = false, photoBusy = false, photoSession = 0;
let toastTimer, pendingConfirmation;
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('wdm-vendezap-web') : null;
function notify(message, error = false) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.toggle('error', error);
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, error ? 10000 : 6500);
}
function report(error) {
  console.error('VendeZap:', error?.name || 'Erro');
  notify(error?.name === 'QuotaExceededError' ? 'Armazenamento cheio. Exporte um backup e remova anúncios antigos para liberar espaço.' : error?.message || 'Não foi possível concluir. Tente novamente.', true);
}
function run(task) { return Promise.resolve().then(task).catch(report); }
function ensureReady() { if (!ready) throw new Error('O armazenamento não está disponível. Recarregue ou use outro navegador.'); }
async function commit(change) {
  ensureReady();
  const execute = async () => {
    const latest = await readState() || state;
    const next = structuredClone(latest);
    change(next);
    if (new Blob([JSON.stringify({ format: 'vendezap-web', version: 1, exportedAt: new Date().toISOString(), ...next })]).size > MAX_BACKUP_BYTES) {
      throw new Error('Seu acervo atingiu o limite de 100 MB. Exporte um backup e remova anúncios antigos para liberar espaço.');
    }
    await writeState(next);
    state = next;
    render();
    channel?.postMessage('changed');
  };
  if (navigator.locks) await navigator.locks.request('wdm-vendezap-write', execute);
  else await execute();
}
channel?.addEventListener('message', () => run(async () => {
  const latest = await readState();
  if (latest) { state = latest; render(); }
}));

function render() {
  const categories = [...new Set(state.ads.map(ad => ad.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const currentCategory = $('#categoryFilter').value;
  $('#categoryFilter').innerHTML = '<option value="">Todas as categorias</option>' + categories.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
  $('#categoryFilter').value = categories.includes(currentCategory) ? currentCategory : '';
  $('#categorySuggestions').innerHTML = categories.map(value => `<option value="${esc(value)}"></option>`).join('');
  const filtered = filterAds(state.ads, { query: $('#search').value, status: $('#statusFilter').value, category: $('#categoryFilter').value });
  $('#totalCount').textContent = $('#navCount').textContent = $('#headingCount').textContent = state.ads.length;
  $('#availableCount').textContent = state.ads.filter(ad => ['available', 'last_units'].includes(ad.status)).length;
  $('#sharedCount').textContent = state.ads.filter(ad => ad.lastSharedAt > 0).length;
  $('#emptyState').hidden = state.ads.length > 0;
  $('#noResults').hidden = !state.ads.length || filtered.length > 0;
  $('#adGrid').innerHTML = filtered.map(ad => `<article class="ad-card">
    ${ad.photos[0] ? `<img class="card-cover" src="${esc(ad.photos[0])}" alt="${esc(ad.product)}" loading="lazy">` : `<div class="card-cover card-placeholder">${icon('image')}</div>`}
    <div class="card-content"><div class="card-top"><span class="badge ${esc(ad.status)}">${STATUSES[ad.status]}</span><span class="card-category">${esc(ad.category)}</span></div><h3>${esc(ad.product)}</h3><p class="card-price">${esc(ad.price || 'Preço sob consulta')}</p><div class="card-actions"><button class="text-button" data-detail="${esc(ad.id)}">Ver e compartilhar ↗</button><button class="text-button" data-edit="${esc(ad.id)}">Editar</button></div></div></article>`).join('');
}
function newEditor(ad) {
  ensureReady();
  if (!ad && state.ads.length >= MAX_ADS) throw new Error('Limite de 1.000 anúncios atingido. Exporte um backup antes de organizar seu acervo.');
  const form = $('#adForm');
  form.reset();
  editingId = ad?.id ?? null;
  photos = [...(ad?.photos || [])];
  photoSession++;
  photoBusy = false;
  $('#photoInput').disabled = false;
  $('#saveAd').disabled = false;
  for (const key of ['product', 'price', 'category', 'tagline', 'description', 'status', 'stock', 'variants', 'templateId']) {
    if (ad) form.elements.namedItem(key).value = ad[key] ?? '';
  }
  $('#editorTitle').textContent = ad ? 'Editar anúncio' : 'Novo anúncio';
  editorDirty = false;
  renderPhotos();
  updatePreview();
  $('#editorDialog').showModal();
  form.elements.product.focus();
}
function editorValues() {
  const data = new FormData($('#adForm'));
  const values = Object.fromEntries(data.entries());
  return { product: values.product.trim(), price: values.price.trim(), category: values.category.trim(), tagline: values.tagline.trim(), description: values.description.trim(), variants: values.variants.trim(), status: values.status, stock: values.stock === '' ? null : Number(values.stock), templateId: values.templateId, photos: [...photos] };
}
function previewMarkup(ad) {
  return `${ad.photos[0] ? `<img src="${esc(ad.photos[0])}" alt="${esc(ad.product || 'Foto do produto')}">` : `<div class="preview-placeholder">${icon('image')}</div>`}<div class="preview-info"><span class="badge ${esc(ad.status)}">${STATUSES[ad.status]}</span>${ad.tagline ? `<p>${esc(ad.tagline)}</p>` : ''}<h3>${esc(ad.product || 'O nome do seu produto')}</h3><p class="preview-price">${esc(ad.price || 'Preço sob consulta')}</p>${ad.description ? `<p>${esc(ad.description)}</p>` : ''}${ad.variants ? `<p><strong>Opções</strong><br>${esc(ad.variants)}</p>` : ''}${ad.stock !== null ? `<p>Estoque: ${esc(ad.stock)} unidade${ad.stock === 1 ? '' : 's'}</p>` : ''}${state.profile.shopName ? `<p class="preview-shop">${esc(state.profile.shopName)}</p>` : ''}</div>`;
}
function updatePreview() {
  const ad = editorValues();
  $('#editorPreview').className = `preview-card ${ad.templateId}`;
  $('#editorPreview').innerHTML = previewMarkup(ad);
}
function renderPhotos() {
  $('#photoCount').textContent = `${photos.length} de ${MAX_PHOTOS}`;
  $('#photoList').innerHTML = photos.map((photo, index) => `<div class="photo-thumb"><img src="${esc(photo)}" alt="Foto ${index + 1}${index === 0 ? ', capa' : ''}"><button type="button" class="remove-photo" data-remove-photo="${index}" aria-label="Remover foto ${index + 1}">×</button><button type="button" data-cover="${index}" aria-label="${index === 0 ? 'Foto de capa' : `Usar foto ${index + 1} como capa`}">${index === 0 ? '★ Capa' : '☆ Capa'}</button></div>`).join('');
}
async function compressPhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use fotos JPG, PNG ou WebP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Cada foto pode ter até 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (image.width * image.height > 60_000_000) throw new Error('Esta foto é muito grande. Reduza a resolução e tente novamente.');
    const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .86);
  } catch (error) {
    if (error.name === 'EncodingError') throw new Error('Não foi possível abrir esta foto. Tente outra imagem.');
    throw error;
  } finally { URL.revokeObjectURL(url); }
}
function confirmAction(message, label = 'Confirmar') {
  $('#confirmMessage').textContent = message;
  $('#confirmYes').textContent = label;
  $('#confirmTitle').textContent = label === 'Excluir anúncio' ? 'Excluir este anúncio?' : 'Confirmar ação';
  $('#confirmDialog').showModal();
  $('#confirmNo').focus();
  return new Promise(resolve => { pendingConfirmation = resolve; });
}
function answerConfirmation(answer) {
  const resolve = pendingConfirmation;
  pendingConfirmation = null;
  $('#confirmDialog').close();
  resolve?.(answer);
}
async function closeEditor() {
  if (editorDirty && !await confirmAction('As alterações deste anúncio ainda não foram salvas. Deseja descartá-las?', 'Descartar alterações')) return;
  photoSession++;
  editorDirty = false;
  $('#editorDialog').close();
}
function selectedAd() {
  const ad = state.ads.find(item => item.id === selectedId);
  if (!ad) throw new Error('Este anúncio não está mais disponível. Feche a janela e tente novamente.');
  return ad;
}
function showDetail(id) {
  selectedId = id;
  const ad = selectedAd();
  $('#detailTitle').textContent = ad.product;
  $('#detailPreview').className = `preview-card ${ad.templateId}`;
  $('#detailPreview').innerHTML = previewMarkup(ad);
  $('#shareText').textContent = buildShareText(ad, state.profile);
  $('#downloadPhoto').disabled = !ad.photos.length;
  $('#detailDialog').showModal();
}
function openProfile() {
  ensureReady();
  for (const [key, value] of Object.entries(state.profile)) $('#profileForm').elements.namedItem(key).value = value;
  $('#profileDialog').showModal();
}
function safeName(value) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 65) || 'anuncio'; }
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function photoFile(data, name) {
  const [header, encoded] = data.split(',');
  const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  const type = header.match(/^data:(image\/(?:jpeg|png|webp));base64$/)[1];
  return new File([bytes], `${name}.${type === 'image/jpeg' ? 'jpg' : type.split('/')[1]}`, { type });
}
async function markShared(id) {
  await commit(next => { const ad = next.ads.find(item => item.id === id); if (ad) ad.lastSharedAt = Date.now(); });
}
async function shareSelected() {
  const ad = selectedAd();
  const text = buildShareText(ad, state.profile);
  const files = ad.photos.map((photo, index) => photoFile(photo, `${safeName(ad.product)}-${index + 1}`));
  // navigator.share is called before awaiting storage so user activation is retained.
  try {
    if (files.length && navigator.canShare?.({ files }) && navigator.share) {
      await navigator.share({ files, text, title: ad.product });
    } else if (navigator.share) {
      await navigator.share({ text, title: ad.product });
    } else {
      const popup = window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      if (!popup) throw new Error('O navegador bloqueou a abertura do WhatsApp. Permita a janela ou use Copiar texto.');
      popup.opener = null;
      notify('WhatsApp aberto com o texto. Baixe a foto ou a arte para anexar à mensagem.');
    }
    await markShared(ad.id);
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (['NotAllowedError', 'SecurityError'].includes(error.name)) throw new Error('O navegador não permitiu compartilhar. Use Copiar texto e Baixar arte, ou abra o VendeZap fora do desktop.');
    throw error;
  }
}
async function copySelected() {
  const text = buildShareText(selectedAd(), state.profile);
  try { await navigator.clipboard.writeText(text); notify('Texto copiado! Agora é só colar na conversa.'); }
  catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents($('#shareText'));
    selection.removeAllRanges(); selection.addRange(range);
    notify('Selecionei o texto. Use Ctrl+C ou toque e segure para copiar.');
  }
}
async function createArt(ad) {
  const palettes = { clean: ['#f6faf4', '#075e48', '#263f31'], offer: ['#fff6d6', '#bc4a1b', '#4f371b'], boutique: ['#fcf6ee', '#8c6653', '#5e4a3d'], service: ['#f1f8fa', '#216b83', '#294c58'] };
  const [background, accent, ink] = palettes[ad.templateId];
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1350;
  const context = canvas.getContext('2d');
  context.fillStyle = background; context.fillRect(0, 0, 1080, 1350);
  context.fillStyle = accent; context.fillRect(0, 0, 1080, 120);
  context.fillStyle = '#fff'; context.font = 'bold 32px "Segoe UI", sans-serif';
  context.fillText(ellipsize(state.profile.shopName || 'VendeZap', 950, context), 60, 76);
  context.fillStyle = '#e5eee3'; context.fillRect(60, 160, 960, 650);
  if (ad.photos[0]) {
    const image = new Image(); image.src = ad.photos[0]; await image.decode();
    const scale = Math.min(960 / image.width, 650 / image.height);
    context.drawImage(image, 60 + (960 - image.width * scale) / 2, 160 + (650 - image.height * scale) / 2, image.width * scale, image.height * scale);
  } else {
    context.fillStyle = accent; context.font = 'bold 54px "Segoe UI", sans-serif'; context.textAlign = 'center';
    context.fillText(ad.templateId === 'service' ? 'Feito para você.' : 'Seu próximo favorito.', 540, 500); context.textAlign = 'start';
  }
  context.fillStyle = accent; context.font = 'bold 23px "Segoe UI", sans-serif';
  context.fillText(STATUSES[ad.status].toLocaleUpperCase('pt-BR'), 60, 868);
  context.fillStyle = ink; context.font = ad.templateId === 'boutique' ? 'bold 52px Georgia, serif' : 'bold 52px "Segoe UI", sans-serif';
  const lines = wrapText(ad.product, 950, context);
  lines.slice(0, 2).forEach((line, index) => context.fillText(index === 1 && lines.length > 2 ? ellipsize(`${line}…`, 950, context) : line, 60, 942 + index * 65));
  context.fillStyle = accent; context.font = 'bold 66px "Segoe UI", sans-serif';
  context.fillText(ellipsize(ad.price || 'Consulte valores', 950, context), 60, 1110);
  context.fillStyle = ink; context.font = '27px "Segoe UI", sans-serif';
  context.fillText(ellipsize(ad.tagline || state.profile.deliveryInfo || 'Fale com a gente para saber mais.', 950, context), 60, 1175);
  context.fillStyle = accent; context.fillRect(0, 1240, 1080, 110); context.fillStyle = '#fff'; context.font = 'bold 29px "Segoe UI", sans-serif';
  context.fillText(ellipsize(state.profile.phone ? `WhatsApp: ${state.profile.phone}` : state.profile.shopName || 'Entre em contato e faça seu pedido', 950, context), 60, 1306);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível gerar a arte.')), 'image/png'));
}
function ellipsize(text, width, context) {
  if (context.measureText(text).width <= width) return text;
  let value = text;
  while (value && context.measureText(value + '…').width > width) value = value.slice(0, -1);
  return value + '…';
}
function wrapText(text, width, context) {
  const lines = []; let line = '';
  for (const char of text) {
    if (context.measureText(line + char).width > width) { lines.push(line.trim()); line = ''; }
    line += char;
  }
  if (line) lines.push(line.trim());
  return lines;
}

document.querySelectorAll('[data-new]').forEach(button => button.addEventListener('click', () => run(() => newEditor())));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.close === 'editorDialog') run(closeEditor);
  else document.getElementById(button.dataset.close).close();
}));
$('#editorDialog').addEventListener('cancel', event => { event.preventDefault(); run(closeEditor); });
$('#confirmDialog').addEventListener('cancel', event => { event.preventDefault(); answerConfirmation(false); });
$('#confirmNo').onclick = () => answerConfirmation(false);
$('#confirmYes').onclick = () => answerConfirmation(true);
window.addEventListener('beforeunload', event => { if (editorDirty) { event.preventDefault(); event.returnValue = ''; } });
$('#adForm').addEventListener('input', () => { editorDirty = true; updatePreview(); });
$('#adForm').addEventListener('change', () => { editorDirty = true; updatePreview(); });
$('#adForm').addEventListener('submit', event => {
  event.preventDefault();
  run(async () => {
    if (photoBusy) throw new Error('Aguarde o processamento das fotos antes de salvar.');
    $('#saveAd').disabled = true;
    try {
      const old = state.ads.find(item => item.id === editingId);
      const now = Date.now();
      const ad = validateAd({ ...editorValues(), id: editingId || crypto.randomUUID(), createdAt: old?.createdAt ?? now, updatedAt: now, lastSharedAt: old?.lastSharedAt ?? 0 });
      await commit(next => {
        const index = next.ads.findIndex(item => item.id === ad.id);
        if (editingId && index < 0) throw new Error('O anúncio foi excluído em outra aba. Crie um novo anúncio para preservar estas informações.');
        if (index < 0) { if (next.ads.length >= MAX_ADS) throw new Error('Limite de anúncios atingido.'); next.ads.push(ad); }
        else next.ads[index] = ad;
      });
      editorDirty = false;
      photoSession++;
      $('#editorDialog').close();
      notify(editingId ? 'Anúncio atualizado.' : 'Anúncio criado! Sua próxima venda já pode começar.');
    } finally { $('#saveAd').disabled = false; }
  });
});
$('#photoInput').addEventListener('change', event => run(async () => {
  const files = [...event.target.files];
  event.target.value = '';
  if (!files.length) return;
  if (photos.length + files.length > MAX_PHOTOS) throw new Error('Você pode adicionar até 6 fotos por anúncio.');
  const session = photoSession;
  photoBusy = true; editorDirty = true;
  $('#saveAd').disabled = true; $('#photoInput').disabled = true;
  try {
    const added = [];
    for (const file of files) added.push(await compressPhoto(file));
    if (session !== photoSession) return;
    photos.push(...added); renderPhotos(); updatePreview();
  } finally {
    if (session === photoSession) { photoBusy = false; $('#saveAd').disabled = false; $('#photoInput').disabled = false; }
  }
}));
$('#photoList').addEventListener('click', event => {
  if (photoBusy) return;
  const remove = event.target.closest('[data-remove-photo]');
  const cover = event.target.closest('[data-cover]');
  if (remove) photos.splice(Number(remove.dataset.removePhoto), 1);
  else if (cover) photos.unshift(...photos.splice(Number(cover.dataset.cover), 1));
  else return;
  editorDirty = true; renderPhotos(); updatePreview();
});
$('#adGrid').addEventListener('click', event => run(() => {
  const detail = event.target.closest('[data-detail]'), edit = event.target.closest('[data-edit]');
  if (detail) showDetail(detail.dataset.detail);
  if (edit) { const ad = state.ads.find(item => item.id === edit.dataset.edit); if (ad) newEditor(ad); }
}));
for (const selector of ['#search', '#statusFilter', '#categoryFilter']) $(selector).addEventListener(selector === '#search' ? 'input' : 'change', render);
$('#clearFilters').onclick = () => { $('#search').value = $('#statusFilter').value = $('#categoryFilter').value = ''; render(); };
$('#profileButton').onclick = $('#editorProfile').onclick = () => run(openProfile);
$('#profileForm').addEventListener('submit', event => {
  event.preventDefault();
  run(async () => {
    const profile = validateProfile(Object.fromEntries(new FormData(event.target).entries()));
    await commit(next => { next.profile = profile; });
    $('#profileDialog').close();
    if ($('#editorDialog').open) updatePreview();
    notify('Informações da loja salvas.');
  });
});
$('#editAd').onclick = () => run(() => { const ad = selectedAd(); $('#detailDialog').close(); newEditor(ad); });
$('#duplicateAd').onclick = () => run(async () => {
  const original = selectedAd();
  const copy = { ...structuredClone(original), id: crypto.randomUUID(), product: `${original.product.slice(0, 112)} (cópia)`, createdAt: Date.now(), updatedAt: Date.now(), lastSharedAt: 0 };
  await commit(next => { if (next.ads.length >= MAX_ADS) throw new Error('Limite de anúncios atingido.'); next.ads.push(copy); });
  $('#detailDialog').close(); newEditor(copy); notify('Anúncio duplicado. Ajuste o que precisar.');
});
$('#deleteAd').onclick = () => run(async () => {
  const ad = selectedAd();
  if (!await confirmAction(`O anúncio “${ad.product}” e suas fotos serão removidos deste navegador.`, 'Excluir anúncio')) return;
  await commit(next => { next.ads = next.ads.filter(item => item.id !== ad.id); });
  $('#detailDialog').close(); notify('Anúncio excluído.');
});
$('#shareAd').onclick = () => { shareSelected().catch(report); };
$('#copyText').onclick = () => { copySelected().catch(report); };
$('#downloadPhoto').onclick = () => run(() => { const ad = selectedAd(); if (ad.photos[0]) { const file = photoFile(ad.photos[0], safeName(ad.product)); download(file, file.name); } });
$('#downloadArt').onclick = () => run(async () => {
  $('#downloadArt').disabled = true;
  try { const ad = selectedAd(); download(await createArt(ad), `${safeName(ad.product)}-vendezap.png`); notify('Arte gerada! Anexe a imagem à sua divulgação.'); }
  finally { $('#downloadArt').disabled = false; }
});
$('#backupButton').onclick = () => run(async () => {
  ensureReady();
  const latest = await readState() || state;
  download(new Blob([JSON.stringify({ format: 'vendezap-web', version: 1, exportedAt: new Date().toISOString(), ...latest })], { type: 'application/json' }), `vendezap-web-${new Date().toISOString().slice(0, 10)}.json`);
  notify('Backup preparado com seus anúncios, fotos e dados da loja.');
});
$('#importButton').onclick = () => run(() => { ensureReady(); $('#backupInput').click(); });
$('#backupInput').addEventListener('change', event => run(async () => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file) return;
  if (file.size > MAX_BACKUP_BYTES) throw new Error('O arquivo pode ter até 100 MB.');
  let parsed;
  try { parsed = JSON.parse(await file.text()); } catch { throw new Error('Não foi possível ler o backup. Selecione o arquivo JSON exportado pelo VendeZap Web.'); }
  const incoming = validateBackup(parsed);
  if (!await confirmAction(`Adicionar ${incoming.ads.length} anúncio(s) deste backup? Seus anúncios atuais serão preservados. Dados da loja serão preenchidos apenas nos campos vazios.`, 'Importar backup')) return;
  let added = 0;
  await commit(next => {
    const merged = mergeAds(next.ads, incoming.ads, () => crypto.randomUUID());
    next.ads = merged.ads; added = merged.added;
    for (const key of Object.keys(next.profile)) if (!next.profile[key]) next.profile[key] = incoming.profile[key];
  });
  notify(`${added} anúncio(s) importado(s). Seus anúncios anteriores foram preservados.`);
}));

async function init() {
  try {
    const saved = await readState();
    if (saved) state = validateBackup({ format: 'vendezap-web', version: 1, ...saved });
    ready = true; render();
  } catch (error) {
    report(error);
    $('#loading').textContent = 'Não foi possível abrir seus anúncios. Recarregue ou tente outro navegador. Nenhum dado foi removido.';
    document.querySelectorAll('[data-new],#profileButton,#backupButton,#importButton').forEach(button => { button.disabled = true; });
    return;
  }
  $('#loading').hidden = true;
}
init();
