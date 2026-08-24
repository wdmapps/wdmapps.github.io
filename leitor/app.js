import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
import 'https://cdn.jsdelivr.net/npm/foliate-js@1.0.1/view.js';
import {
  fileId, getBook, listBooks, putBook, deleteBook,
  getProgress, listProgress, putProgress, deleteProgress,
  requestPersistentStorage
} from './storage.js';
import { extractComic, imageDimensions, makeThumbnail } from './comic.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const $ = s => document.querySelector(s);
const input = $('#fileInput'), welcome = $('#welcome'), reader = $('#reader'), dropzone = $('#dropzone');
const librarySection = $('#librarySection'), libraryGrid = $('#libraryGrid');
const pageBook = $('#pageBook'), ebookShell = $('#ebookShell'), ebookPaper = $('#ebookPaper'), ebookView = $('#ebookView');
const prevBtn = $('#prevBtn'), nextBtn = $('#nextBtn'), stagePrev = $('#stagePrev'), stageNext = $('#stageNext');
const status = $('#pageStatus'), loader = $('#loader'), loaderText = $('#loaderText'), toast = $('#toast');
const readerStage = $('#readerStage'), bookTitle = $('#bookTitle'), bookType = $('#bookType');

let mode = null, pdfDoc = null, pageFlip = null, ebookLoaded = false;
let renderedPages = new Set(), renderingPages = new Set();
let currentFile = null, currentFileName = '', currentFileId = '', currentExt = '', currentDetails = {};
let comicObjectUrls = [], libraryObjectUrls = [];

const supported = ['pdf','epub','mobi','azw','azw3','cbz','cbr'];
const kindleExts = new Set(['mobi','azw','azw3']);
const comicExts = new Set(['cbz','cbr']);

function showToast(text, ms = 3400) {
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => toast.classList.remove('show'), ms);
}
function setLoading(show, text = 'Preparando livro…') {
  loaderText.textContent = text;
  loader.classList.toggle('show', show);
}
function cleanName(name) { return name.replace(/\.(pdf|epub|mobi|azw3?|kfx|cbz|cbr)$/i, ''); }
function formatMeta(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(formatMeta).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    if (value.name) return formatMeta(value.name);
    const k = Object.keys(value)[0];
    return k ? formatMeta(value[k]) : '';
  }
  return String(value);
}
function typeLabel(ext) {
  if (kindleExts.has(ext)) return `KINDLE · ${ext.toUpperCase()}`;
  if (comicExts.has(ext)) return `HQ · ${ext.toUpperCase()}`;
  return ext.toUpperCase();
}
function legacyKey(kind) { return `wdm-reader:${kind}:${currentFileName}`; }
function prettySize(n) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(n > 10 * 1024 * 1024 ? 0 : 1)} MB`;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function loadSavedProgress(kind) {
  try {
    const p = await getProgress(currentFileId);
    if (p?.kind === kind && p.value != null) return p.value;
  } catch (e) {}
  return localStorage.getItem(legacyKey(kind));
}

function saveReadingProgress(kind, value, percent = null) {
  const id = currentFileId;
  localStorage.setItem(legacyKey(kind), String(value));
  putProgress({ id, kind, value, percent, updatedAt: Date.now() }).catch(() => {});
}

async function saveBookRecord(file, details = {}) {
  if (!file || !currentFileId) return;
  try {
    requestPersistentStorage();
    const old = await getBook(currentFileId).catch(() => null);
    await putBook({
      id: currentFileId,
      file,
      name: file.name,
      ext: currentExt,
      size: file.size,
      addedAt: old?.addedAt || Date.now(),
      lastOpened: Date.now(),
      title: details.title || old?.title || cleanName(file.name),
      author: details.author || old?.author || '',
      cover: details.cover || old?.cover || null
    });
  } catch (e) {
    console.warn('Biblioteca local:', e);
    showToast('O livro abriu, mas o navegador não conseguiu guardar o arquivo na biblioteca. O progresso ainda será lembrado.', 5200);
  }
}

async function canvasThumbnail(canvas) {
  try {
    const scale = Math.min(280 / canvas.width, 380 / canvas.height, 1);
    const thumb = document.createElement('canvas');
    thumb.width = Math.max(1, Math.round(canvas.width * scale));
    thumb.height = Math.max(1, Math.round(canvas.height * scale));
    thumb.getContext('2d').drawImage(canvas, 0, 0, thumb.width, thumb.height);
    return await new Promise(resolve => thumb.toBlob(resolve, 'image/jpeg', .8));
  } catch (e) { return null; }
}

async function renderLibrary() {
  libraryObjectUrls.forEach(URL.revokeObjectURL);
  libraryObjectUrls = [];
  let books = [];
  try { books = await listBooks(); }
  catch (e) { librarySection.hidden = true; return; }

  books.sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));
  libraryGrid.innerHTML = '';
  librarySection.hidden = !books.length;
  if (!books.length) return;

  const progresses = await listProgress().catch(() => []);
  const pmap = new Map(progresses.map(p => [p.id, p]));

  for (const b of books) {
    const p = pmap.get(b.id);
    const card = document.createElement('article');
    card.className = 'book-card';
    let cover;
    if (b.cover) {
      const url = URL.createObjectURL(b.cover);
      libraryObjectUrls.push(url);
      cover = `<img src="${url}" alt="">`;
    } else {
      cover = `<div class="book-cover-fallback">${esc(typeLabel(b.ext))}</div>`;
    }
    const pct = Number.isFinite(p?.percent) ? Math.max(0, Math.min(100, p.percent)) : 0;
    card.innerHTML = `
      <button class="delete-book" title="Excluir da biblioteca" aria-label="Excluir">×</button>
      <div class="book-cover">${cover}<span class="book-format">${esc(typeLabel(b.ext))}</span></div>
      <div class="book-card-body">
        <strong title="${esc(b.title || b.name)}">${esc(b.title || cleanName(b.name))}</strong>
        <small>${esc(b.author || prettySize(b.size))}</small>
        <div class="book-progress"><i style="width:${pct}%"></i></div>
      </div>`;
    card.onclick = () => openSavedBook(b.id);
    card.querySelector('.delete-book').onclick = async e => {
      e.stopPropagation();
      if (!confirm(`Excluir “${b.title || cleanName(b.name)}” da biblioteca deste navegador?`)) return;
      await deleteBook(b.id).catch(() => {});
      await deleteProgress(b.id).catch(() => {});
      renderLibrary();
    };
    libraryGrid.appendChild(card);
  }
}

async function openSavedBook(id) {
  const b = await getBook(id).catch(() => null);
  if (!b?.file) { showToast('Não encontrei mais o arquivo salvo neste navegador.'); return; }
  await openFile(b.file, { id: b.id });
}

async function showLibrary() {
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  await destroyCurrent();
  reader.classList.remove('active');
  welcome.style.display = 'grid';
  await renderLibrary();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('#openTop').onclick = () => input.click();
$('#changeBtn').onclick = () => input.click();
$('#libraryBtn').onclick = showLibrary;
input.addEventListener('change', e => {
  const file = e.target.files?.[0];
  if (file) openFile(file);
  input.value = '';
});
['dragenter','dragover'].forEach(ev => dropzone.addEventListener(ev, e => {
  e.preventDefault(); dropzone.classList.add('drag');
}));
['dragleave','drop'].forEach(ev => dropzone.addEventListener(ev, e => {
  e.preventDefault(); dropzone.classList.remove('drag');
}));
dropzone.addEventListener('drop', e => {
  const file = e.dataTransfer.files?.[0];
  if (file) openFile(file);
});

ebookView.addEventListener('load', ({ detail: { doc } }) => {
  try {
    const style = doc.createElement('style');
    style.textContent = `:root{color-scheme:light!important;background:#f7f4ec!important}html,body{background:#f7f4ec!important;color:#25211d!important}body{font-family:Georgia,'Times New Roman',serif!important;padding:2% 4%!important}p,li,blockquote,dd{line-height:1.65!important;text-align:justify;hyphens:auto}img,svg{max-width:100%!important;height:auto!important}pre{white-space:pre-wrap!important}a{color:#5f52b8!important}`;
    doc.head.append(style);
    doc.addEventListener('keydown', handleReaderKey);
  } catch (e) { console.warn(e); }
});

ebookView.addEventListener('relocate', ({ detail }) => {
  const { fraction, cfi, tocItem, pageItem, location } = detail || {};
  let pct = null;
  if (typeof fraction === 'number' && Number.isFinite(fraction)) {
    pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
    status.textContent = tocItem?.label ? `${pct}% · ${tocItem.label}` : `${pct}% do livro`;
  } else if (pageItem?.label) status.textContent = `Página ${pageItem.label}`;
  else if (location?.current != null) status.textContent = `Posição ${location.current}`;
  else status.textContent = typeLabel(currentExt);
  if (cfi && currentFileId) saveReadingProgress('ebook', cfi, pct);
});

ebookView.addEventListener('external-link', e => {
  e.preventDefault?.();
  const href = e.detail?.href_;
  if (href && confirm('Este link abre uma página externa. Deseja continuar?')) {
    window.open(href, '_blank', 'noopener,noreferrer');
  }
});

async function openFile(file, opts = {}) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'kfx') {
    showToast('KFX não é suportado. Arquivos Kindle KFX normalmente também usam proteção da Amazon.', 5200);
    return;
  }
  if (!supported.includes(ext)) {
    showToast('Escolha PDF, EPUB, MOBI, AZW, AZW3, CBZ ou CBR.');
    return;
  }

  currentFile = file;
  currentFileName = file.name;
  currentFileId = opts.id || fileId(file);
  currentExt = ext;
  currentDetails = { title: cleanName(file.name), author: '', cover: null };
  bookTitle.textContent = currentDetails.title;
  bookType.textContent = typeLabel(ext);
  welcome.style.display = 'none';
  librarySection.hidden = true;
  reader.classList.add('active');
  setLoading(true, ext === 'pdf' ? 'Abrindo PDF…' : comicExts.has(ext) ? `Abrindo ${ext.toUpperCase()}…` : kindleExts.has(ext) ? 'Abrindo livro Kindle…' : 'Abrindo EPUB…');
  await destroyCurrent();

  try {
    if (ext === 'pdf') await openPdf(await file.arrayBuffer());
    else if (comicExts.has(ext)) await openComic(file, ext);
    else await openEbook(file, ext);
    await saveBookRecord(file, currentDetails);
    renderLibrary();
  } catch (err) {
    console.error(err);
    const text = String(err?.message || err || '').toLowerCase();
    if (kindleExts.has(ext)) {
      if (text.includes('drm') || text.includes('encrypt') || text.includes('unsupported') || text.includes('not supported')) {
        showToast('Não consegui abrir este Kindle. Ele pode estar protegido por DRM da Amazon ou usar uma variante não compatível.', 6200);
      } else showToast('Não consegui abrir este arquivo Kindle. Tente MOBI/AZW3 sem DRM.', 5200);
    } else if (ext === 'cbr') showToast('Não consegui abrir este CBR. Verifique se é um arquivo RAR válido e sem senha.', 5200);
    else if (ext === 'cbz') showToast('Não consegui abrir este CBZ. Verifique se ele contém imagens válidas.', 5200);
    else showToast('Não consegui abrir este arquivo. Ele pode estar corrompido ou protegido.', 5000);
    welcome.style.display = 'grid';
    reader.classList.remove('active');
    renderLibrary();
  } finally { setLoading(false); }
}

async function destroyCurrent() {
  try { pageFlip?.destroy(); } catch (e) {}
  pageFlip = null;
  pdfDoc = null;
  renderedPages.clear();
  renderingPages.clear();
  pageBook.innerHTML = '';
  pageBook.style.display = 'none';
  comicObjectUrls.forEach(URL.revokeObjectURL);
  comicObjectUrls = [];
  try { if (ebookLoaded) ebookView.close(); } catch (e) {}
  ebookLoaded = false;
  ebookShell.style.display = 'none';
  mode = null;
}

async function openPdf(buffer) {
  mode = 'pdf';
  pageBook.style.display = 'block';
  ebookShell.style.display = 'none';
  pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pageCount = pdfDoc.numPages;
  for (let i = 1; i <= pageCount; i++) {
    const el = document.createElement('div');
    el.className = 'page fixed-page';
    el.dataset.page = i;
    if (i === 1) el.dataset.density = 'hard';
    el.innerHTML = `<div class="loading-page"><div><div class="spinner"></div>página ${i}</div></div><span class="page-number">${i}</span>`;
    pageBook.appendChild(el);
  }
  pageFlip = new St.PageFlip(pageBook, {
    width:560,height:760,size:'stretch',minWidth:280,maxWidth:900,minHeight:380,maxHeight:1220,
    maxShadowOpacity:.48,showCover:true,mobileScrollSupport:false,usePortrait:true,flippingTime:720,clickEventForward:true,swipeDistance:18
  });
  pageFlip.loadFromHTML(pageBook.querySelectorAll('.page'));
  pageFlip.on('flip', e => {
    const n = e.data + 1, pct = Math.round((Math.min(n, pageCount) / pageCount) * 100);
    status.textContent = `Página ${Math.min(n, pageCount)} de ${pageCount}`;
    saveReadingProgress('pdf', e.data, pct);
    renderAround(n);
  });
  const savedRaw = await loadSavedProgress('pdf');
  const saved = Math.max(0, Math.min(pageCount - 1, Number(savedRaw || 0)));
  status.textContent = `Página ${saved + 1} de ${pageCount}`;
  await renderAround(saved + 1, true);
  const firstCanvas = pageBook.querySelector('[data-page="1"] canvas');
  if (firstCanvas) currentDetails.cover = await canvasThumbnail(firstCanvas);
  if (saved > 0) setTimeout(() => pageFlip.turnToPage(saved), 100);
}

async function renderAround(center, wait = false) {
  if (!pdfDoc) return;
  const jobs = [];
  for (let n = Math.max(1, center - 3); n <= Math.min(pdfDoc.numPages, center + 5); n++) jobs.push(renderPdfPage(n));
  if (wait) await Promise.all(jobs);
}

async function renderPdfPage(n) {
  if (renderedPages.has(n) || renderingPages.has(n) || !pdfDoc) return;
  renderingPages.add(n);
  try {
    const page = await pdfDoc.getPage(n);
    const viewport = page.getViewport({ scale: 1.55 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: ctx, viewport, background: 'rgb(255,255,255)' }).promise;
    const el = pageBook.querySelector(`[data-page="${n}"]`);
    if (el) {
      el.querySelector('.loading-page')?.remove();
      el.insertBefore(canvas, el.firstChild);
    }
    renderedPages.add(n);
  } finally { renderingPages.delete(n); }
}

async function openComic(file, ext) {
  mode = 'comic';
  pageBook.style.display = 'block';
  ebookShell.style.display = 'none';
  const pages = await extractComic(file, ext, (done, total) => {
    if (done === 1 || done % 8 === 0 || done === total) loaderText.textContent = `Extraindo páginas… ${done}/${total}`;
  });
  const dim = await imageDimensions(pages[0].blob);
  const ratio = Math.max(.55, Math.min(1.6, dim.height / dim.width));
  const baseW = 680, baseH = Math.round(baseW * ratio);

  for (let i = 0; i < pages.length; i++) {
    const url = URL.createObjectURL(pages[i].blob);
    comicObjectUrls.push(url);
    const el = document.createElement('div');
    el.className = 'page fixed-page comic-page';
    el.dataset.page = i + 1;
    if (i === 0) el.dataset.density = 'hard';
    el.innerHTML = `<img src="${url}" alt="Página ${i + 1}" draggable="false"><span class="page-number">${i + 1}</span>`;
    pageBook.appendChild(el);
  }
  currentDetails.cover = await makeThumbnail(pages[0].blob);
  pageFlip = new St.PageFlip(pageBook, {
    width:baseW,height:baseH,size:'stretch',minWidth:270,maxWidth:1000,minHeight:380,maxHeight:1400,
    maxShadowOpacity:.55,showCover:true,mobileScrollSupport:false,usePortrait:true,flippingTime:720,clickEventForward:true,swipeDistance:18
  });
  pageFlip.loadFromHTML(pageBook.querySelectorAll('.page'));
  pageFlip.on('flip', e => {
    const n = e.data + 1, pct = Math.round((Math.min(n, pages.length) / pages.length) * 100);
    status.textContent = `Página ${Math.min(n, pages.length)} de ${pages.length}`;
    saveReadingProgress('comic', e.data, pct);
  });
  const savedRaw = await loadSavedProgress('comic');
  const saved = Math.max(0, Math.min(pages.length - 1, Number(savedRaw || 0)));
  status.textContent = `Página ${saved + 1} de ${pages.length}`;
  if (saved > 0) setTimeout(() => pageFlip.turnToPage(saved), 100);
}

async function openEbook(file, ext) {
  mode = 'ebook';
  pageBook.style.display = 'none';
  ebookShell.style.display = 'block';
  await ebookView.open(file);
  ebookLoaded = true;
  ebookView.renderer.setAttribute('flow', 'paginated');
  ebookView.renderer.setStyles?.(`@namespace epub "http://www.idpf.org/2007/ops";html{color-scheme:light!important;background:#f7f4ec!important;color:#25211d!important}body{background:#f7f4ec!important;color:#25211d!important;font-family:Georgia,'Times New Roman',serif!important;padding:2% 4%!important}p,li,blockquote,dd{line-height:1.65!important;text-align:justify;hyphens:auto}img,svg{max-width:100%!important;height:auto!important}pre{white-space:pre-wrap!important}a{color:#5f52b8!important}`);

  const metadata = ebookView.book?.metadata || {};
  const title = formatMeta(metadata.title), author = formatMeta(metadata.author);
  if (title) { bookTitle.textContent = title; currentDetails.title = title; }
  if (author) currentDetails.author = author;
  bookType.textContent = author ? `${typeLabel(ext)} · ${author}` : typeLabel(ext);
  try {
    const cover = await Promise.resolve(ebookView.book?.getCover?.());
    if (cover) currentDetails.cover = await makeThumbnail(cover);
  } catch (e) {}

  const saved = await loadSavedProgress('ebook');
  status.textContent = kindleExts.has(ext) ? 'Preparando Kindle…' : 'Preparando EPUB…';
  await ebookView.init({ lastLocation: saved || undefined, showTextStart: !saved });
}

function animateEbook(direction) {
  if (!ebookLoaded || ebookPaper.classList.contains('turn-next') || ebookPaper.classList.contains('turn-prev')) return;
  const cls = direction === 'next' ? 'turn-next' : 'turn-prev';
  ebookPaper.classList.add(cls);
  setTimeout(() => {
    try { direction === 'next' ? ebookView.goRight() : ebookView.goLeft(); } catch (e) {}
  }, 205);
  setTimeout(() => ebookPaper.classList.remove(cls), 500);
}
function goPrev() { if (mode === 'pdf' || mode === 'comic') pageFlip?.flipPrev(); else if (mode === 'ebook') animateEbook('prev'); }
function goNext() { if (mode === 'pdf' || mode === 'comic') pageFlip?.flipNext(); else if (mode === 'ebook') animateEbook('next'); }
prevBtn.onclick = goPrev; nextBtn.onclick = goNext; stagePrev.onclick = goPrev; stageNext.onclick = goNext;

function handleReaderKey(e) {
  if (!reader.classList.contains('active')) return;
  if (['ArrowRight','PageDown',' '].includes(e.key)) { e.preventDefault(); goNext(); }
  if (['ArrowLeft','PageUp'].includes(e.key)) { e.preventDefault(); goPrev(); }
}
document.addEventListener('keydown', handleReaderKey);

$('#fullscreenBtn').onclick = async () => {
  try {
    if (!document.fullscreenElement) await readerStage.requestFullscreen();
    else await document.exitFullscreen();
  } catch (e) { showToast('Tela cheia não disponível neste navegador.'); }
};
document.addEventListener('fullscreenchange', () => setTimeout(() => {
  try { ebookView.renderer?.setAttribute('flow', 'paginated'); } catch (e) {}
}, 120));

renderLibrary();
