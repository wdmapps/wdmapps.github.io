// =====================================================================
// WDM TV - Proxy para Deno Deploy
// Porta o worker.js original da Cloudflare com duas melhorias:
//  1. Reescrita de m3u8 em STREAMING (sem bufferizar a playlist inteira
//     -> não estoura memória em playlists grandes de filme)
//  2. Fixar o servidor que gerou a playlist nos segmentos
//     (/m/<índice>/...) -> tokens dos segmentos só são válidos no
//     servidor que os gerou; sem isso a rotação causa 404 e o canal
//     reconecta a cada ~10s
// O DNS real fica em DNS_LIST (env var do projeto) e nunca é exposto.
// =====================================================================

const DNS_LIST = (Deno.env.get("DNS_LIST") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Range, X-Requested-With",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Content-Type",
  "Cache-Control": "no-store",
};

// Servidor padrão para rotas NÃO pinadas (/mcp e /m/ sem índice) —
// atualizado pela última autenticação. Requisições de mídia com índice
// na URL NUNCA usam esta variável.
let defaultServer = 0;

// A provedora serve o /live/ apenas para User-Agents de media player
// (UA de navegador -> 404; VLC -> 302 para a CDN tokenizada).
const UA_PLAYER = "VLC/3.0.20 LibVLC/3.0.20";
const UA_WEB = "Mozilla/5.0";
const liveAuthCache = new Map<string, number>();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function b64urlEncode(s: string) {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string) {
  let b = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b.length % 4) b += "=";
  try {
    return atob(b);
  } catch {
    return "";
  }
}

function hostOf(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return "";
  }
}

function idxOfHost(dnsList: string[], host: string): number {
  for (let i = 0; i < dnsList.length; i++) {
    try {
      if (new URL(dnsList[i]).host === host) return i;
    } catch {
      /* segue */
    }
  }
  return -1;
}

// Reescrita de uma linha de playlist (m3u8)
// Regras:
//  - URL absoluta em DNS_LIST[i]  -> /m/<i>/<caminho>   (preserva o índice do host)
//  - URL relativa                 -> resolve contra baseUrl (URL efetiva após
//    redirects: a CDN tokenizada) e aplica a regra acima; se o host não
//    pertence ao DNS_LIST, vira /m/<idx>/x/<url> (proxy que preserva o host,
//    sem jamais descartar o hostname -> 404 incorreto)
function rewriteLine(line: string, dnsList: string[], origin: string, usedIdx: number, baseUrl?: string): string {
  // 1) hosts conhecidos (com ou sem port) -> origin/m/<índice-DO-HOST>/<caminho>
  for (let i = 0; i < dnsList.length; i++) {
    const base = dnsList[i].replace(/\/+$/, "");
    if (line.includes(base)) line = line.split(base).join(`${origin}/m/${i}`);
    let host: string;
    try {
      host = new URL(dnsList[i]).host;
    } catch {
      continue;
    }
    const esc = host.replace(/\./g, "\\.");
    line = line.replace(new RegExp(`(https?:)?//${esc}(:[0-9]+)?`, "g"), `${origin}/m/${i}`);
  }

  const fix = (u: string): string => {
    if (!u) return "";
    if (u.startsWith(origin + "/m/")) return u;
    let abs = u;
    if (!/^(https?:)?\/\//.test(u)) {
      if (!baseUrl) return u;
      try {
        abs = new URL(u, baseUrl).href;
      } catch {
        return u;
      }
    }
    const i = idxOfHost(dnsList, hostOf(abs));
    if (i >= 0) return `${origin}/m/${i}` + abs.replace(/^https?:\/\/[^/]+/, "");
    return `${origin}/m/${usedIdx}/x/${b64urlEncode(abs)}`;
  };

  const t = line.trim();
  if (!t) return line;
  if (/^https?:\/\//.test(t) || t.startsWith("//") || t.startsWith("/")) {
    return line.replace(t, fix(t));
  }
  if (/URI="[^"]+"/.test(line)) {
    return line.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${fix(u)}"`);
  }
  if (/^[^\s#,]+$/.test(t) && /\.(ts|m3u8|key)(\?.*)?$/i.test(t)) {
    return line.replace(t, fix(t));
  }
  return line;
}

function liveCredentials(rel: string): { user: string; pass: string } | null {
  const parts = rel.split("?", 1)[0].replace(/^\/+/, "").split("/");
  const start = parts[0] === "live" ? 1 : 0;
  if (parts.length < start + 3) return null;
  try {
    return {
      user: decodeURIComponent(parts[start]),
      pass: decodeURIComponent(parts[start + 1]),
    };
  } catch {
    return null;
  }
}

async function ensureLiveSession(server: string, serverIdx: number, rel: string): Promise<void> {
  const cred = liveCredentials(rel);
  if (!cred) return;

  const key = `${serverIdx}:${cred.user}`;
  const now = Date.now();
  if (now - (liveAuthCache.get(key) || 0) < 20_000) return;

  const authUrl = `${server.replace(/\/+$/, "")}/player_api.php?username=${encodeURIComponent(cred.user)}&password=${encodeURIComponent(cred.pass)}`;
  try {
    const response = await fetch(authUrl, { headers: { "User-Agent": UA_WEB } });
    await response.text();
    if (response.ok) liveAuthCache.set(key, now);
  } catch {
    /* o próprio manifesto ainda pode autenticar a conta */
  }
}

function rewriteImages(obj: unknown, dnsList: string[], origin: string): void {
  const bases = dnsList.map((d) => d.replace(/\/+$/, ""));
  const KEYS = ["stream_icon", "movie_image", "cover", "icon", "backdrop", "thumbnail"];
  if (Array.isArray(obj)) {
    obj.forEach((o) => rewriteImages(o, dnsList, origin));
    return;
  }
  if (obj && typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    for (const k of Object.keys(record)) {
      if (KEYS.includes(k) && typeof record[k] === "string" && record[k]) {
        const val = record[k] as string;
        for (const b of bases) {
          const host = b.split("//")[1];
          if (val.startsWith(b)) {
            record[k] = origin + "/m/" + val.slice(b.length).replace(/^\/+/, "");
            break;
          }
          if (val.startsWith("//" + host) || val.startsWith("http://" + host) || val.startsWith("https://" + host)) {
            const cut = val.replace(/^(https?:)?(\/\/)+[^/]+/, "");
            record[k] = origin + "/m/" + cut.replace(/^\/+/, "");
            break;
          }
        }
      } else if (record[k] && typeof record[k] === "object") {
        rewriteImages(record[k], dnsList, origin);
      }
    }
  }
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = url.origin;
  const dnsList = DNS_LIST;
  if (dnsList.length === 0) return json({ error: "Servidor não configurado." }, 500);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const path = url.pathname;
  const q = url.searchParams;
  const dnsDefault = dnsList[defaultServer % dnsList.length];

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
              defaultServer = i;
              return json({
                ok: true,
                user: data.user_info.username,
                exp: data.user_info.exp_ts || null,
                server: i,
              });
            }
            return json({ ok: false, message: "Esta conta encontra-se vencida ou inativa." });
          }
        } catch {
          /* tenta próximo servidor */
        }
      }
      return json({ ok: false, message: "Usuário ou senha incorretos." });
    }

    // ===== API player (catálogo) =====
    if (path === "/mcp") {
      const user = (q.get("username") || "").trim();
      const pass = (q.get("password") || "").trim();
      const action = (q.get("action") || "").trim();
      if (!user || !pass || !action) return json({ error: "Parâmetros inválidos." }, 400);

      const allow = ["category_id", "vod_id", "series_id", "stream_id"];
      const extras: string[] = [];
      for (const k of allow) {
        const v = q.get(k);
        if (v) extras.push(`${k}=${encodeURIComponent(v)}`);
      }
      let apiUrl = `${dnsDefault}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&action=${encodeURIComponent(action)}`;
      if (extras.length) apiUrl += "&" + extras.join("&");

      let r = await fetch(apiUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      // se o servidor ativo falhar, tenta os demais
      if (!r.ok || r.status >= 400) {
        for (const sA of dnsList) {
          const alt = `${sA}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&action=${encodeURIComponent(action)}`;
          const rr = await fetch(alt, { headers: { "User-Agent": "Mozilla/5.0" } });
if (rr.ok) {
              r = rr;
              defaultServer = dnsList.indexOf(sA);
              break;
            }
        }
      }
      const body = await r.text();

      // Cortar listas grandes (opcional via &limit=)
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = body;
      }

      if (typeof parsed === "object" && parsed !== null) {
        const limit = parseInt(q.get("limit") || "0", 10);
        if (Array.isArray(parsed) && limit > 0 && parsed.length > limit) {
          parsed = parsed.slice(0, limit);
        }
        rewriteImages(parsed, dnsList, origin);

        // Contagens reais por categoria (sem expor a lista completa)
        if (action === "get_vod_categories" || action === "get_series_categories") {
          const countAction = action === "get_vod_categories" ? "get_vod_streams" : "get_series";
          const countUrl = `${dnsDefault}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&action=${countAction}`;
          try {
            const cr = await fetch(countUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
            if (cr.ok) {
              const list = await cr.json();
              if (Array.isArray(list)) {
                const counts: Record<string, number> = {};
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
          } catch {
            /* sem contagens */
          }
        }
      }

      return new Response(typeof parsed === "string" ? body : JSON.stringify(parsed), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // ===== MÍDIA (streams, m3u8, legendas, imagens) =====
    // /m/<caminho>                    -> servidor ativo
    // /m/<índice>/<caminho>           -> servidor dnsList[índice] (fixado)
    if (path.startsWith("/m/")) {
      let resto = path.slice(3);
      let pinIdx = -1;
      const mIdx = resto.match(/^(\d+)\//);
      if (mIdx) {
        pinIdx = parseInt(mIdx[1], 10);
        resto = resto.slice(mIdx[0].length);
      }
      const rel = resto + (url.search ? url.search : "");
      // Tráfego com índice na URL usa EXATAMENTE o servidor indicado;
      // sem índice, usa o servidor padrão da última autenticação.
      const sel = (pinIdx >= 0 && pinIdx < dnsList.length) ? pinIdx : defaultServer % dnsList.length;
      let usedIdx = sel;

      // Passthrough com host preservado (CDN tokenizada fora do DNS_LIST):
      // /m/<idx>/x/<base64url da URL exata que o upstream gerou>
      if (resto.startsWith("x/")) {
        const target = b64urlDecode(resto.slice(2).split("?")[0]);
        if (!target || !/^https?:\/\//.test(target)) return json({ error: "URL inválida." }, 400);
        const headers: Record<string, string> = { "User-Agent": UA_PLAYER };
        for (const h of ["Range", "If-Range"]) {
          const v = request.headers.get(h);
          if (v) headers[h] = v;
        }
        try {
          const rr = await fetch(target, { headers });
          if (!rr) return json({ error: "Falha no upstream." }, 502);
          const respHeaders = new Headers(rr.headers);
          respHeaders.set("Access-Control-Allow-Origin", "*");
          respHeaders.set("Cache-Control", "no-store");
          return new Response(rr.body, { status: rr.status, headers: respHeaders });
        } catch {
          return json({ error: "Falha no upstream." }, 502);
        }
      }

      const isLive = /^live\//.test(rel);
      const headers: Record<string, string> = {};
      for (const h of ["Range", "If-Range"]) {
        const v = request.headers.get(h);
        if (v) headers[h] = v;
      }
      headers["User-Agent"] = isLive ? UA_PLAYER : UA_WEB;

      if (isLive) await ensureLiveSession(dnsList[sel], sel, rel);

      let response: Response | null = null;
      try {
        response = await fetch(`${dnsList[sel]}/${rel}`, { headers });
      } catch {
        response = null;
      }

      // Segmentos tokenizados permanecem no servidor fixado. Para o
      // manifesto inicial, porém, um 404 também tenta os demais servidores.
      if (!response || response.status >= 500 || (isLive && response.status === 404 && /\.m3u8(\?.*)?$/i.test(rel))) {
        for (let i = 0; i < dnsList.length; i++) {
          if (i === sel) continue;
          try {
            if (isLive) await ensureLiveSession(dnsList[i], i, rel);
            const rr = await fetch(`${dnsList[i]}/${rel}`, {
              headers: { "User-Agent": isLive ? UA_PLAYER : UA_WEB, ...headers },
            });
            if (rr.ok) {
              response = rr;
              usedIdx = i;
              break;
            }
          } catch {
            /* próximo */
          }
        }
      }

      if (!response) {
        return json({ error: "Servidores indisponíveis." }, 502);
      }

      const ct = response.headers.get("content-type") || "";
      const isM3u8 = /(mpegurl|vnd\.apple\.mpegurl)/i.test(ct) || /\.m3u8(\?.*)?$/i.test(rel);

      const respHeaders = new Headers(response.headers);
      respHeaders.set("Access-Control-Allow-Origin", "*");
      respHeaders.set("Cache-Control", "no-store");

      if (isM3u8) {
        // headers do corpo ORIGINAL não valem para o texto reescrito
        for (const h of ["content-length", "content-encoding", "transfer-encoding", "content-range", "etag", "last-modified", "date", "content-type"]) {
          respHeaders.delete(h);
        }
        respHeaders.set("Content-Type", "application/vnd.apple.mpegurl");

        // reescrita em STREAMING: processa linha a linha, sem bufferizar a playlist
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        let resto2 = "";
        const baseUrl = response.url || "";
        const ts = new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            resto2 += decoder.decode(chunk, { stream: true });
            let i;
            while ((i = resto2.indexOf("\n")) !== -1) {
              controller.enqueue(encoder.encode(rewriteLine(resto2.slice(0, i), dnsList, origin, usedIdx, baseUrl) + "\n"));
              resto2 = resto2.slice(i + 1);
            }
          },
          flush(controller) {
            if (resto2.length) controller.enqueue(encoder.encode(rewriteLine(resto2, dnsList, origin, usedIdx, baseUrl)));
          },
        });

        return new Response(response.body!.pipeThrough(ts), {
          status: response.status >= 400 ? response.status : 200,
          headers: respHeaders,
        });
      }

      return new Response(response.body, { status: response.status, headers: respHeaders });
    }

    // rota raiz
    return json({ app: "WDM TV Proxy", ok: true });
  } catch (e) {
    return json({ error: "Falha ao acessar servidor.", detail: String((e as Error).message || e) }, 502);
  }
}

Deno.serve({ port: 8000 }, handleRequest);
