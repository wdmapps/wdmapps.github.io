// api.js - helpers para falar com o Worker (servidor oculto)
const API = CONFIG.worker || "";

function apiUrl(endpoint, params) {
    const qs = new URLSearchParams(params);
    return `${API}/${endpoint}?${qs.toString()}`;
}

// wrapper de fetch JSON (nunca trava: timeout de 25s e erro tratado)
async function api(endpoint, params) {
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 25000);
        const r = await fetch(apiUrl(endpoint, params), { signal: ctrl.signal });
        clearTimeout(timer);
        return await r.json();
    } catch (e) {
        console.error("Falha de rede no API:", e);
        return { ok: false, message: "Falha de conexão. Tente novamente." };
    }
}

// fetch genérico com timeout (para catálogo/streams, sem parsing de JSON)
async function apiFetch(endpoint, params) {
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 30000);
        const r = await fetch(apiUrl(endpoint, params), { signal: ctrl.signal });
        clearTimeout(timer);
        return r;
    } catch (e) {
        console.error("Falha de rede no apiFetch:", e);
        throw e;
    }
}

// credenciais da sessão
function getCred() {
    return {
        user: localStorage.getItem("username") || "",
        pass: localStorage.getItem("password") || "",
    };
}

function precisaLogin() {
    const { user, pass } = getCred();
    return !user || !pass || user === "null" || pass === "null";
}

// URL de mídia oculta via worker (/m/...)
function mUrl(rel) {
    const clean = String(rel).replace(/^\/+/, "");
    return `${API}/m/${clean}`;
}

// índice do servidor pinado na última autenticação (/auth devolve `server`)
function getServer() {
    const s = parseInt(localStorage.getItem("server") || "0", 10);
    return isNaN(s) ? 0 : s;
}

// URL de stream ao vivo (playlist + segmentos fixados no mesmo servidor)
function liveUrl(streamId) {
    const { user, pass } = getCred();
    return mUrl(`${getServer()}/live/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${streamId}.m3u8`);
}

// URL de filme (vê qual extensão)
function vodUrl(streamId, ext) {
    const { user, pass } = getCred();
    return mUrl(`${getServer()}/movie/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${streamId}.${ext || "mp4"}`);
}

// URL de episódio de série
// ATENÇÃO: este painel (dbonline) serve episódios pelo caminho /movie/<user>/<pass>/<ep_id>.<ext>,
// não pelo /series/... padrão (que retorna 404)
function serieUrl(serieId, epId, ext) {
    const { user, pass } = getCred();
    return mUrl(`${getServer()}/movie/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${epId}.${ext || "mp4"}`);
}