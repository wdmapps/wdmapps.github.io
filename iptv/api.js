// api.js - helpers para falar com o Worker (servidor oculto)
const API = CONFIG.worker || "";

function apiUrl(endpoint, params) {
    const qs = new URLSearchParams(params);
    return `${API}/${endpoint}?${qs.toString()}`;
}

// wrapper de fetch JSON
async function api(endpoint, params) {
    const r = await fetch(apiUrl(endpoint, params));
    return r.json();
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

// URL de stream ao vivo
function liveUrl(streamId) {
    const { user, pass } = getCred();
    return mUrl(`live/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${streamId}.m3u8`);
}

// URL de filme (vê qual extensão)
function vodUrl(streamId, ext) {
    const { user, pass } = getCred();
    return mUrl(`movie/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${streamId}.${ext || "mp4"}`);
}

// URL de episódio de série
function serieUrl(serieId, epId) {
    const { user, pass } = getCred();
    return mUrl(`series/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${serieId}/${epId}.mp4`);
}