// WDM TV - Proxy Cloudflare Worker
const CORS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Cache-Control": "no-store",
};

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: CORS, status: 204 });
        }

        const target = url.searchParams.get("url");
        if (!target) {
            return new Response(JSON.stringify({ error: "Parâmetro url obrigatório" }), { headers: CORS, status: 400 });
        }

        try {
            const parsed = new URL(target);
            if (!/^https?:$/.test(parsed.protocol)) {
                return new Response(JSON.stringify({ error: "Protocolo inválido" }), { headers: CORS, status: 400 });
            }

            const upstream = await fetch(target, {
                method: "GET",
                headers: { "User-Agent": "Mozilla/5.0" },
            });

            const body = await upstream.text();

            // Otimização para listas gigantes: se vier como array,
            // retorna apenas os itens pedidos pelo parâmetro "limit" (padrão 2000)
            let responseBody = body;
            if (url.searchParams.has("limit") || url.searchParams.has("truncate")) {
                try {
                    const data = JSON.parse(body);
                    const limit = parseInt(url.searchParams.get("limit") || url.searchParams.get("truncate") || "2000", 10);
                    if (Array.isArray(data) && data.length > limit) {
                        responseBody = JSON.stringify(data.slice(0, limit));
                    }
                } catch (e) { /* não é JSON válido, mantém corpo original */ }
            }

            return new Response(responseBody, {
                status: upstream.status,
                headers: CORS,
            });
        } catch (e) {
            return new Response(JSON.stringify({ error: "Falha ao acessar servidor" }), { headers: CORS, status: 502 });
        }
    },
};