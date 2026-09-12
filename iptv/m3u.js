import { parseM3U, httpUrl, proxyMediaUrl, MAX_PLAYLIST_BYTES } from './m3u-core.mjs?v=1';

const $ = (id) => document.getElementById(id);
const video = $('video');
let entries = [], filtered = [], visible = 100, selected = null;
let hls = null, ts = null, generation = 0, loading = false;
let activeRequest = null;
$('backLink').href = precisaLogin() ? 'player.html' : 'painel.html';

function message(text, error = false) {
    $('importStatus').textContent = text;
    $('importStatus').classList.toggle('error', error);
}
function playStatus(text, error = false) {
    $('playStatus').textContent = text;
    $('playStatus').classList.toggle('error', error);
}
function setLoading(value) {
    loading = value;
    $('loadUrl').disabled = $('playlistFile').disabled = value;
    $('clearList').disabled = value || !entries.length;
    $('loadUrl').textContent = value ? 'Carregando...' : 'Abrir link';
}

function storage(mode, value) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('wdm-iptv-m3u', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('playlists');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction('playlists', mode === 'read' ? 'readonly' : 'readwrite');
            const store = transaction.objectStore('playlists');
            const operation = mode === 'read' ? store.get('last') : mode === 'clear' ? store.delete('last') : store.put(value, 'last');
            transaction.oncomplete = () => { db.close(); resolve(operation.result); };
            transaction.onerror = transaction.onabort = () => { db.close(); reject(transaction.error); };
        };
    });
}

async function readText(response) {
    if (!response.ok) throw new Error('Não foi possível abrir esse link. Confira o endereço e a validade da lista.');
    if (!response.body) throw new Error('O servidor devolveu uma lista vazia.');
    const reader = response.body.getReader(), decoder = new TextDecoder();
    // O envelope JSON do proxy pode escapar quebras de linha e aspas.
    const max = MAX_PLAYLIST_BYTES * 2 + 8192;
    let size = 0, result = '';
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > max) throw new Error('A lista deve ter no máximo 20 MB.');
            result += decoder.decode(value, { stream: true });
        }
        return result + decoder.decode();
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

async function loadUrl(url) {
    const ctrl = new AbortController();
    activeRequest = ctrl;
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
        const endpoint = new URL(proxyMediaUrl(url, CONFIG.worker, getServer()));
        endpoint.searchParams.set('playlist', '1');
        const response = await fetch(endpoint, { signal: ctrl.signal, cache: 'no-store' });
        const text = await readText(response);
        if (text.trim().startsWith('{')) {
            const result = JSON.parse(text);
            if (typeof result.text !== 'string') throw new Error('O servidor não devolveu uma lista M3U.');
            return { text: result.text, baseUrl: httpUrl(result.baseUrl) || url };
        }
        return { text, baseUrl: url };
    } finally { clearTimeout(timer); if (activeRequest === ctrl) activeRequest = null; }
}

async function importList(read, name) {
    if (loading) return;
    generation++;
    setLoading(true);
    message('Carregando e organizando sua lista...');
    try {
        const data = await read();
        const parsed = parseM3U(data.text, { baseUrl: data.baseUrl, name });
        // Só substitui a lista anterior após validar completamente a nova.
        stopPlayer();
        entries = parsed.entries;
        $('listName').textContent = name;
        populateCategories();
        $('search').value = '';
        filter();
        $('playlistUrl').value = '';
        const suffix = parsed.skipped ? ` ${parsed.skipped} link(s) repetido(s) ou inválido(s) ignorado(s).` : '';
        try {
            await storage('write', { entries, name });
            message(`${entries.length.toLocaleString('pt-BR')} itens carregados.${suffix}`);
        } catch {
            message(`Lista carregada.${suffix} Não foi possível salvar neste aparelho; mantenha esta página aberta.`);
        }
    } catch (error) {
        message(error.name === 'AbortError' ? 'A lista demorou para responder. Tente novamente.' : error.message || 'Não foi possível ler a lista.', true);
    } finally { setLoading(false); $('playlistFile').value = ''; }
}

$('urlForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const url = httpUrl($('playlistUrl').value.trim());
    if (!url) { message('Informe um link HTTP ou HTTPS válido.', true); return; }
    importList(() => loadUrl(url), 'Lista por link');
});
$('playlistFile').addEventListener('change', () => {
    const file = $('playlistFile').files[0];
    if (!file) return;
    if (file.size > MAX_PLAYLIST_BYTES) { message('O arquivo deve ter no máximo 20 MB.', true); $('playlistFile').value = ''; return; }
    importList(async () => ({ text: await file.text(), baseUrl: '' }), file.name);
});

function populateCategories() {
    const groups = [...new Set(entries.map((entry) => entry.group))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    $('category').replaceChildren(new Option('Todas as categorias', ''), ...groups.map((group) => new Option(group, group)));
    $('search').disabled = $('category').disabled = !entries.length;
}
function filter() {
    const query = $('search').value.toLocaleLowerCase('pt-BR').trim();
    const category = $('category').value;
    filtered = entries.filter((entry) => (!category || entry.group === category) && (!query || entry.name.toLocaleLowerCase('pt-BR').includes(query)));
    visible = 100;
    render();
}
function render() {
    const list = $('channelList');
    list.replaceChildren();
    $('count').textContent = `${filtered.length.toLocaleString('pt-BR')} de ${entries.length.toLocaleString('pt-BR')} itens`;
    $('showMore').hidden = visible >= filtered.length;
    if (!filtered.length) {
        const empty = document.createElement('p'); empty.className = 'empty';
        empty.textContent = entries.length ? 'Nenhum item encontrado para esta busca.' : 'Importe sua lista para começar.';
        list.append(empty); return;
    }
    const fragment = document.createDocumentFragment();
    for (const entry of filtered.slice(0, visible)) {
        const button = document.createElement('button');
        button.className = 'channel'; button.type = 'button'; button.dataset.id = entry.id;
        button.classList.toggle('active', selected?.id === entry.id);
        button.setAttribute('aria-pressed', String(selected?.id === entry.id));
        const logo = document.createElement('span'); logo.className = 'logo'; logo.textContent = '▶'; logo.setAttribute('aria-hidden', 'true');
        if (entry.logo) {
            const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
            img.src = proxyMediaUrl(entry.logo, CONFIG.worker, getServer());
            img.onerror = () => { logo.textContent = '▶'; };
            logo.replaceChildren(img);
        }
        const info = document.createElement('span'); info.className = 'info';
        const title = document.createElement('span'); title.className = 'title'; title.textContent = entry.name;
        const group = document.createElement('span'); group.className = 'group'; group.textContent = entry.group;
        info.append(title, group); button.append(logo, info);
        button.addEventListener('click', () => play(entry)); fragment.append(button);
    }
    list.append(fragment);
}
$('search').addEventListener('input', filter);
$('category').addEventListener('change', filter);
$('showMore').addEventListener('click', () => { const scroll = $('channelList').scrollTop; visible += 100; render(); $('channelList').scrollTop = scroll; });

function stopPlayer() {
    selected = null;
    if (hls) { hls.destroy(); hls = null; }
    if (ts) { ts.destroy(); ts = null; }
    video.pause(); video.removeAttribute('src'); video.load();
    $('videoEmpty').hidden = false;
    $('nowPlaying').textContent = 'Nenhum item selecionado';
    $('retry').disabled = true;
    playStatus('');
}
function startPlayback() {
    video.play().catch((error) => {
        if (error.name === 'NotAllowedError') playStatus('Toque em reproduzir para iniciar o vídeo.');
    });
}
function play(entry) {
    stopPlayer(); selected = entry;
    $('videoEmpty').hidden = true;
    $('nowPlaying').textContent = entry.name;
    $('retry').disabled = false;
    playStatus('Conectando...');
    for (const button of document.querySelectorAll('.channel')) {
        const active = button.dataset.id === entry.id;
        button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    }
    const fail = () => { if (selected === entry) playStatus('Não foi possível reproduzir. Tente novamente ou confira o formato de vídeo.', true); };
    try {
        const url = proxyMediaUrl(entry.url, CONFIG.worker, getServer());
        const type = $('format').value === 'auto' ? entry.type : $('format').value;
        if (type === 'hls') {
            if (window.Hls?.isSupported()) {
                const player = new Hls({ enableWorker: true, maxBufferLength: 45 }); hls = player;
                let recovered = false;
                player.on(Hls.Events.MANIFEST_PARSED, () => { if (hls === player) startPlayback(); });
                player.on(Hls.Events.ERROR, (_, data) => {
                    if (hls !== player || !data.fatal) return;
                    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) { recovered = true; player.recoverMediaError(); }
                    else { player.stopLoad(); fail(); }
                });
                player.loadSource(url); player.attachMedia(video);
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = url; startPlayback(); }
            else playStatus('Este navegador não oferece suporte a HLS. Tente um navegador compatível.', true);
        } else if (type === 'mpegts') {
            if (!window.mpegts?.isSupported()) { playStatus('Este navegador não oferece suporte a MPEG-TS. Use uma lista HLS / M3U8.', true); return; }
            const player = mpegts.createPlayer({ type: 'mpegts', isLive: entry.isLive, url }, { enableWorker: true, lazyLoad: !entry.isLive, autoCleanupSourceBuffer: true });
            ts = player;
            player.on(mpegts.Events.ERROR, () => { if (ts === player) { player.unload(); fail(); } });
            player.attachMediaElement(video); player.load();
            player.play()?.catch(() => playStatus('Toque em reproduzir para iniciar o vídeo.'));
        } else { video.src = url; startPlayback(); }
    } catch { fail(); }
}
video.addEventListener('playing', () => { if (selected) playStatus(''); });
video.addEventListener('error', () => { if (selected && !hls && !ts) playStatus('O vídeo está indisponível ou usa um formato não compatível com o navegador.', true); });
$('retry').addEventListener('click', () => { if (selected) play(selected); });
$('format').addEventListener('change', () => { if (selected) play(selected); });

$('clearList').addEventListener('click', async () => {
    generation++;
    setLoading(true);
    try {
        await storage('clear');
        stopPlayer(); entries = []; filtered = [];
        $('listName').textContent = 'Minha lista'; $('search').value = '';
        populateCategories(); render(); message('Lista removida deste aparelho.');
    } catch { message('Não foi possível remover a lista salva. Tente novamente.', true); }
    finally { setLoading(false); }
});

const restoreGeneration = generation;
storage('read').then((saved) => {
    if (generation !== restoreGeneration || !Array.isArray(saved?.entries) || !saved.entries.length) return;
    entries = saved.entries.filter((entry) => httpUrl(entry.url) && typeof entry.name === 'string' && typeof entry.group === 'string');
    if (!entries.length) return;
    $('listName').textContent = saved.name || 'Minha lista';
    populateCategories(); filter(); setLoading(false); message('Sua última lista está pronta para assistir.');
}).catch(() => {});
window.addEventListener('pagehide', () => { activeRequest?.abort(); stopPlayer(); });
