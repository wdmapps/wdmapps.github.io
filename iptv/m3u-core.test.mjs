import test from 'node:test';
import assert from 'node:assert/strict';
import { parseM3U, proxyMediaUrl, httpUrl } from './m3u-core.mjs';

test('M3U preserva nome com vírgula, acentos, grupos, logos e tipos', () => {
    const result = parseM3U('\uFEFF#EXTM3U\r\n#EXTINF:-1 tvg-logo="https://img.example/logo.png" group-title="Notícias, Brasil",São Paulo, ao vivo\r\nhttps://video.example/live.m3u8\r\n#EXTINF:120 tvg-name="Filme" group-title=Filmes,\r\nhttps://video.example/filme.mp4\r\n#EXTINF:-1,Canal TS\r\n#EXTGRP:Esportes\r\nhttps://video.example/live.ts');
    assert.equal(result.entries.length, 3);
    assert.equal(result.entries[0].name, 'São Paulo, ao vivo');
    assert.equal(result.entries[0].group, 'Notícias, Brasil');
    assert.equal(result.entries[0].type, 'hls');
    assert.equal(result.entries[1].name, 'Filme');
    assert.equal(result.entries[1].isLive, false);
    assert.equal(result.entries[2].group, 'Esportes');
    assert.equal(result.entries[2].type, 'mpegts');
});

test('Links relativos usam a URL efetiva da lista; duplicados e protocolos inválidos são descartados', () => {
    const { entries, skipped } = parseM3U("#EXTM3U\n#EXTINF:-1 group-title='TV',Canal\n../live/1.ts\n../live/1.ts\njavascript:alert(1)\nfile:///etc/passwd\n", { baseUrl: 'https://video.example/lists/all.m3u' });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].url, 'https://video.example/live/1.ts');
    assert.equal(entries[0].logo, '');
    assert.equal(skipped, 3);
    assert.equal(httpUrl(''), '');
    assert.equal(httpUrl('https://user:password@video.example/'), '');
});

test('Uma playlist HLS é tratada como um vídeo e não como vários canais', () => {
    const hls = '#EXTM3U\n#EXT-X-TARGETDURATION:8\n#EXTINF:8,\npart001.ts\n#EXT-X-ENDLIST';
    const { entries } = parseM3U(hls, { baseUrl: 'https://video.example/movie.m3u8', name: 'Meu vídeo' });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].url, 'https://video.example/movie.m3u8');
    assert.equal(entries[0].isLive, false);
    assert.throws(() => parseM3U(hls), /link original/);
});

test('Texto vazio, HTML e arquivos sem links geram mensagens claras', () => {
    for (const content of ['', '<html>erro</html>', '{"error":"expired"}', '#EXTM3U\n#EXTINF:-1,Inválido\narquivo.ts']) {
        assert.throws(() => parseM3U(content));
    }
});

test('Nomes de canais permanecem dados, sem interpretação como HTML', () => {
    const { entries } = parseM3U('#EXTM3U\n#EXTINF:-1,<img src=x onerror=alert(1)>\nhttps://video.example/test.ts');
    assert.equal(entries[0].name, '<img src=x onerror=alert(1)>');
});

test('O proxy preserva toda a URL, inclusive tokens e Unicode, e evita duplo encapsulamento', () => {
    const target = 'http://video.example/vídeo.m3u8?token=a%2Fb&name=ação';
    const proxied = proxyMediaUrl(target, 'https://proxy.example', 3);
    assert.match(proxied, /^https:\/\/proxy\.example\/m\/3\/x\//);
    assert.equal(Buffer.from(proxied.split('/x/')[1], 'base64url').toString(), new URL(target).href);
    assert.equal(proxyMediaUrl(proxied, 'https://proxy.example', 0), proxied);
    assert.throws(() => proxyMediaUrl('javascript:alert(1)', 'https://proxy.example'));
});
