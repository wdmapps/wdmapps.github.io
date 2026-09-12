import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: () => undefined } };
const { handleRequest } = await import('./main.ts');
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });
const request = (path) => handleRequest(new Request('https://proxy.example' + path));
const authData = { user_info: { auth: 1, status: 'Active', username: 'test-user' } };
const response = (data, url, options = {}) => {
    const res = new Response(typeof data === 'string' ? data : JSON.stringify(data), options);
    if (url) Object.defineProperty(res, 'url', { value: String(url) });
    return res;
};

test('Menu oferece três DNS PlayNow e um RexTV sem endereços no payload', async () => {
    const data = await (await request('/servers')).json();
    assert.deepEqual(data.providers.map((p) => [p.id, p.label, p.servers.length]), [['playnow', 'PlayNow', 3], ['rextv', 'RexTV', 1]]);
    assert.deepEqual(data.providers[0].servers.map((s) => s.label), ['DNS 1', 'DNS 2', 'DNS 3']);
    assert.equal(JSON.stringify(data).includes('http://'), false);
});

test('PlayNow automático tenta somente os DNS da PlayNow', async () => {
    const calls = [];
    globalThis.fetch = async (url) => { calls.push(new URL(url).hostname); return response(calls.length < 3 ? {} : authData); };
    const result = await (await request('/auth?username=test&password=test&provider=playnow&server=auto')).json();
    assert.deepEqual(calls, ['dns1.prontonline.com', 'pnow.space', 'nowplay.sbs']);
    assert.equal(result.server, 2);
    assert.equal(result.provider, 'playnow');
});

test('RexTV autentica somente no DNS rexmax.sbs', async () => {
    const calls = [];
    globalThis.fetch = async (url) => { calls.push(new URL(url).hostname); return response(authData); };
    const result = await (await request('/auth?username=test&password=test&provider=rextv&server=auto')).json();
    assert.deepEqual(calls, ['rexmax.sbs']);
    assert.equal(result.server, 3);
});

test('Escolha manual nunca tenta outro DNS e rejeita índices/serviços incompatíveis', async () => {
    const calls = [];
    globalThis.fetch = async (url) => { calls.push(new URL(url).hostname); return response({}); };
    const result = await (await request('/auth?username=test&password=test&provider=playnow&server=1')).json();
    assert.equal(result.ok, false);
    assert.deepEqual(calls, ['pnow.space']);
    for (const query of ['provider=playnow&server=3', 'provider=rextv&server=0', 'provider=unknown&server=auto', 'server=-1', 'server=0garbage', 'server=99', 'server=']) {
        assert.equal((await request('/auth?username=test&password=test&' + query)).status, 400);
    }
    assert.equal(calls.length, 1);
});

test('Um login RexTV não muda o catálogo, as imagens ou as contagens de uma sessão PlayNow', async () => {
    const calls = [];
    globalThis.fetch = async (url) => {
        const target = new URL(url); calls.push(target);
        const action = target.searchParams.get('action');
        if (!action) return response(authData);
        if (action === 'get_vod_categories') return response([{ category_id: '7', cover: 'http://pnow.space/a.jpg' }]);
        return response([{ category_id: '7' }, { category_id: '7' }]);
    };
    await request('/auth?username=rex&password=test&provider=rextv&server=auto');
    const data = await (await request('/mcp?username=play&password=test&server=1&action=get_vod_categories&category_id=7')).json();
    assert.deepEqual(calls.slice(1).map((url) => url.hostname), ['pnow.space', 'pnow.space']);
    assert.equal(calls[1].searchParams.get('category_id'), '7');
    assert.equal(data[0].count, 2);
    assert.equal(data[0].cover, 'https://proxy.example/m/1/a.jpg');
});

test('Falha de catálogo ou mídia fixados não troca silenciosamente de serviço', async () => {
    const calls = [];
    globalThis.fetch = async (url) => { calls.push(new URL(url).hostname); return response('offline', undefined, { status: 503 }); };
    assert.equal((await request('/mcp?username=test&password=test&server=3&action=get_vod_streams')).status, 502);
    assert.equal((await request('/m/1/movie/user/pass/12.mp4')).status, 503);
    assert.deepEqual(calls, ['rexmax.sbs', 'pnow.space']);
    assert.equal((await request('/m/999/movie/user/pass/12.mp4')).status, 400);
});

test('Importação por link retorna a lista original e resolve redirects pela URL final', async () => {
    const original = '#EXTM3U\n#EXTINF:-1,Canal\n../live/1.m3u8';
    globalThis.fetch = async () => response(original, 'https://cdn.example/lists/all.m3u', { headers: { 'content-type': 'audio/x-mpegurl' } });
    const encoded = Buffer.from('http://video.example/get.php?username=test&password=test').toString('base64url');
    const result = await (await request('/m/0/x/' + encoded + '?playlist=1')).json();
    assert.equal(result.text, original);
    assert.equal(result.baseUrl, 'https://cdn.example/lists/all.m3u');
});

test('HLS externo reescreve variantes, chaves e segmentos relativos pelo proxy', async () => {
    const hls = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin?token=1"\n#EXTINF:8,\nsegment-without-extension?token=2\n//other.example/chunk.ts';
    globalThis.fetch = async () => response(hls, 'https://cdn.example/live/index.m3u8', { headers: { 'content-type': 'application/vnd.apple.mpegurl', 'content-length': String(hls.length) } });
    const encoded = Buffer.from('https://cdn.example/live/index.m3u8').toString('base64url');
    const res = await request('/m/2/x/' + encoded);
    const output = await res.text();
    for (const target of ['https://cdn.example/live/key.bin?token=1', 'https://cdn.example/live/segment-without-extension?token=2', 'https://other.example/chunk.ts']) {
        assert.ok(output.includes('/m/2/x/' + Buffer.from(target).toString('base64url')));
    }
    assert.equal(res.headers.get('content-length'), null);
});
