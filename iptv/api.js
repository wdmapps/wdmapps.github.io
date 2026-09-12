// api.js - helpers para falar com o Worker (servidor oculto)
const API = CONFIG.worker || "";

function apiUrl(endpoint, params) {
    const qs = new URLSearchParams(params);
    // O catálogo sempre acompanha a sessão, mesmo com outros usuários online.
    if (endpoint === "mcp" && !qs.has("server")) qs.set("server", String(getServer()));

    // As telas antigas pediam limites de 2.000/5.000 itens e cortavam catálogos
    // grandes. Mantemos limites pequenos (ex.: Home com 30 itens), mas pedidos
    // de catálogo completo seguem sem `limit`, deixando o provedor devolver tudo.
    if (endpoint === "mcp") {
        const requestedLimit = Number(qs.get("limit") || "0");
        if (requestedLimit >= 1000) qs.delete("limit");
    }

    return `${API}/${endpoint}?${qs.toString()}`;
}

// wrapper de fetch JSON (nunca trava: timeout de 25s e erro tratado)
async function api(endpoint, params) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
        const r = await fetch(apiUrl(endpoint, params), { signal: ctrl.signal, cache: "no-store" });
        return await r.json();
    } catch (e) {
        console.error("Falha de rede no API:", e);
        return { ok: false, message: "Falha de conexão. Tente novamente." };
    } finally {
        clearTimeout(timer);
    }
}

// fetch genérico com timeout maior para catálogos grandes.
async function apiFetch(endpoint, params) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), endpoint === "mcp" ? 60000 : 30000);
    try {
        return await fetch(apiUrl(endpoint, params), { signal: ctrl.signal, cache: "no-store" });
    } catch (e) {
        console.error("Falha de rede no apiFetch:", e);
        throw e;
    } finally {
        clearTimeout(timer);
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
    const s = Number(localStorage.getItem("server") || "0");
    return Number.isSafeInteger(s) && s >= 0 ? s : 0;
}

// URL de stream ao vivo (playlist + segmentos fixados no mesmo servidor)
function liveUrl(streamId) {
    const { user, pass } = getCred();
    return mUrl(`${getServer()}/live/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${streamId}.m3u8`);
}

// Fluxo MPEG-TS contínuo: mantém o mesmo request/IP no proxy e evita que
// os tokens HLS sejam invalidados entre um segmento e outro.
function liveTsUrl(streamId) {
    const { user, pass } = getCred();
    return mUrl(`${getServer()}/live/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${streamId}.ts`);
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

// Canais/filmes/séries podem ter dezenas de milhares de itens. O arquivo
// complementar troca o corte fixo por renderização progressiva ao rolar.
if (/\/(canais|filmes|series)\.html$/i.test(location.pathname)) {
    document.write('<script src="catalog-full.js?v=1"><\/script>');
}
