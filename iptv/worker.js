// WDM TV - Proxy Cloudflare Worker (servidor oculto)
// O DNS real fica em env.DNS_LIST (secret) e nunca é exposto ao usuário.
const DNS_LIST = (typeof DNS_LIST !== "undefined" && DNS_LIST) || [];

const CORS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Range, X-Requested-With",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Content-Type",
    "Cache-Control": "no-store",
};

let workingServer = 0;

function json(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: CORS });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const origin = url.origin;
        const dnsList = (env && env.DNS_LIST ? env.DNS_LIST : "").split(",")
            .map(s => s.trim()).filter(Boolean);
        if (dnsList.length === 0) {
            return json({ error: "Servidor não configurado." }, 500);
        }

        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: CORS });
        }

        const path = url.pathname;
        const q = url.searchParams;
        const dns = dnsList[workingServer % dnsList.length];

        try {
            // ===== AUTENTICAÇÃO =====
            if (path === "/auth") {
                const user = (q.get("username") || "").trim();
                const pass = (q.get("password") || "").trim();
                if (!user || !pass) return json({ ok: false, message: "Usuário e senha obrigatórios." }, 400);

                for (let i = 0; i < dnsList.length; i++) {
                    const srv = dnsList[i];
                    const apiUrl = `${srv}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
                    try {
                        const r = await fetch(apiUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
                        if (!r.ok) continue;
                        const data = await r.json();
                        if (data && data.user_info && data.user_info.auth === 1) {
                            if (data.user_info.status === "Active") {
                                workingServer = i;
                                return json({
                                    ok: true,
                                    user: data.user_info.username,
                                    exp: data.user_info.exp_ts || null,
                                });
                            }
                            return json({ ok: false, message: "Esta conta encontra-se vencida ou inativa." });
                        }
                    } catch (e) { /* tenta próximo servidor */ }
                }
                return json({ ok: false, message: "Usuário ou senha incorretos." });
            }

            // ===== API player (catálogo) =====
            if (path === "/mcp") {
                const user = (q.get("username") || "").trim();
                const pass = (q.get("password") || "").trim();
                const action = (q.get("action") || "").trim();
                if (!user || !pass || !action) return json({ error: "Parâmetros inválidos." }, 400);

                // monta apiUrl somente com as chaves de player_api permitidas
                const allow = ["category_id", "vod_id", "series_id", "stream_id"];
                const extras = [];
                for (const k of allow) {
                    const v = q.get(k);
                    if (v) extras.push(`${k}=${encodeURIComponent(v)}`);
                }
                let apiUrl = `${dns}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&action=${encodeURIComponent(action)}`;
                if (extras.length) apiUrl += "&" + extras.join("&");

                const r = await fetch(apiUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
                if (!r.ok) throw new Error("Falha na API");
                // se o servidor ativo falhar, tenta os demais
                let body = await r.text();
                if (r.status >= 400) {
                    for (const sA of dnsList) {
                        const alt = `${sA}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&action=${encodeURIComponent(action)}`;
                        const rr = await fetch(alt, { headers: { "User-Agent": "Mozilla/5.0" } });
                        if (rr.ok) { body = await rr.text(); workingServer = dnsList.indexOf(sA); break; }
                    }
                }

                // Cortar listas grandes (opcional via &limit=)
                let parsed;
                try { parsed = JSON.parse(body); } catch (e) { parsed = body; }

                if (typeof parsed === "object" && parsed !== null) {
                    const limit = parseInt(q.get("limit") || "0", 10);
                    if (Array.isArray(parsed) && limit > 0 && parsed.length > limit) {
                        parsed = parsed.slice(0, limit);
                    }
                    rewriteImages(parsed, dnsList, origin);

                    // Contagens reais por categoria (sem expor a lista completa)
                    if (action === "get_vod_categories" || action === "get_series_categories") {
                        const countAction = action === "get_vod_categories" ? "get_vod_streams" : "get_series";
                        const countUrl = `${dns}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&action=${countAction}`;
                        try {
                            const cr = await fetch(countUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
                            if (cr.ok) {
                                const list = await cr.json();
                                if (Array.isArray(list)) {
                                    const counts = {};
                                    for (const it of list) {
                                        const cid = String(it.category_id);
                                        counts[cid] = (counts[cid] || 0) + 1;
                                    }
                                    if (Array.isArray(parsed)) {
                                        for (const c of parsed) {
                                            if (c && c.category_id) c.count = counts[String(c.category_id)] || 0;
                                        }
                                    }
                                }
                            }
                        } catch (e) { /* sem contagens */ }
                    }
                }

                return new Response(typeof parsed === "string" ? body : JSON.stringify(parsed), {
                    status: 200,
                    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
                });
            }

            // ===== MÍDIA (streams, m3u8, legendas, imagens) =====
            // /m/<caminho relativo ao servidor>  ->  <dns>/<caminho>
            if (path.startsWith("/m/")) {
                const rel = path.slice(3) + (url.search ? url.search : "");
                const target = `${dns}/${rel}`;
                const headers = {};
                const rh = new Headers(request.headers);
                for (const h of ["Range", "If-Range", "Referer", "Origin"]) {
                    const v = (rh.get ? rh.get(h) : null);
                    if (v && h !== "Origin" && h !== "Referer") headers[h] = v;
                }

                // tenta outros servidores se esse falhar
                let response = await fetch(target, { headers: { "User-Agent": "Mozilla/5.0", ...headers } });
                if (!response.ok) {
                    for (let i = 0; i < dnsList.length; i++) {
                        const srv = dnsList[i];
                        const t2 = `${srv}${rel.startsWith('/') ? '' : '/'}${rel}`;
                        try {
                            const rr = await fetch(t2, { headers: { "User-Agent": "Mozilla/5.0", ...headers } });
                            if (rr.ok) { response = rr; workingServer = i; break; }
                        } catch (e) { /* próximo */ }
                    }
                }

                const ct = response.headers.get("content-type") || "";
                const isM3u8 = /(mpegurl|vnd\.apple\.mpegurl)/i.test(ct) || /\.m3u8(\?.*)?$/i.test(rel);

                const respHeaders = new Headers(response.headers);
                respHeaders.set("Access-Control-Allow-Origin", "*");
                respHeaders.set("Cache-Control", "no-store");

                if (isM3u8) {
                    const text = await response.text();
                    // reescreve URLs absolutas do servidor para o worker (mantém oculto)
                    let rewritten = text;
                    // 1) URLs absolutas com o host do servidor -> origin/m/<caminho>
                    for (const srv of dnsList) {
                        const base = srv.replace(/\/+$/, "");
                        rewritten = rewritten.split(base).join(`${origin}/m`);
                        const host = new URL(srv).host;
                        rewritten = rewritten.replace(new RegExp(`//${host.replace(/\./g, "\\.")}(:[0-9]+)?`, "g"), `${origin}/m`);
                    }
                    // 2) URIs relativos de raiz (ex.: /hls/token) -> origin/m/hls/token
                    rewritten = rewritten.replace(/^([^\r\n#>]+)\r?$/gm, function (line) {
                        const t = line.trim();
                        if (!t) return line;
                        if (t.startsWith("/")) {
                            return line.replace(t, `${origin}/m${t}`);
                        }
                        if (t.startsWith("http://") || t.startsWith("https://")) {
                            return line.replace(t, `${origin}/m/` + t.replace(/^https?:\/\/[^/]+/, ""));
                        }
                        if (/URI="[^"]+"/.test(t)) {
                            return line.replace(/URI="([^"]+)"/g, function (m, u) {
                                let nu = u;
                                if (nu.startsWith("http://") || nu.startsWith("https://")) nu = nu.replace(/^https?:\/\/[^/]+/, "");
                                if (nu.startsWith("/")) nu = `${origin}/m${nu}`;
                                return `URI="${nu}"`;
                            });
                        }
                        return line;
                    });
                    return new Response(rewritten, {
                        status: 200,
                        headers: {
                            ...Object.fromEntries(respHeaders),
                            "Content-Type": "application/vnd.apple.mpegurl",
                        },
                    });
                }

                return new Response(response.body, { status: response.status, headers: respHeaders });
            }

            // rota raiz
            return json({ app: "WDM TV Proxy", ok: true });
        } catch (e) {
            return json({ error: "Falha ao acessar servidor.", detail: String(e && e.message || e) }, 502);
        }
    },
};

function rewriteImages(obj, dnsList, origin) {
    const bases = dnsList.map(d => d.replace(/\/+$/, ""));
    const KEYS = ["stream_icon", "movie_image", "cover", "icon", "backdrop", "thumbnail"];
    if (Array.isArray(obj)) { obj.forEach(o => rewriteImages(o, dnsList, origin)); return; }
    if (obj && typeof obj === "object") {
        for (const k of Object.keys(obj)) {
            if (KEYS.includes(k) && typeof obj[k] === "string" && obj[k]) {
                const val = obj[k];
                for (const b of bases) {
                    const host = b.split("//")[1];
                    if (val.startsWith(b)) {
                        obj[k] = origin + "/m/" + val.slice(b.length).replace(/^\/+/, "");
                        break;
                    }
                    if ((val.startsWith("//" + host)) || val.startsWith("http://" + host) || val.startsWith("https://" + host)) {
                        const cut = val.replace(/^(https?:)?(\/\/)+[^/]+/, "");
                        obj[k] = origin + "/m/" + cut.replace(/^\/+/, "");
                        break;
                    }
                }
            } else if (obj[k] && typeof obj[k] === "object") {
                rewriteImages(obj[k], dnsList, origin);
            }
        }
    }
}