export const MAX_PLAYLIST_BYTES = 20 * 1024 * 1024;
export const MAX_CHANNELS = 50000;

export function httpUrl(value, base) {
    if (!String(value || '').trim()) return '';
    try {
        const url = base ? new URL(value, base) : new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
        return url.href;
    } catch { return ''; }
}

export function mediaType(value) {
    const url = new URL(value);
    if (/\.m3u8$/i.test(url.pathname) || url.searchParams.get('output') === 'm3u8') return 'hls';
    if (/\.(mp4|m4v|webm|mov|mkv|mp3|aac|ogg)$/i.test(url.pathname)) return 'video';
    return 'mpegts';
}

function metadata(line) {
    let quote = '', comma = -1;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (quote) { if (char === quote) quote = ''; }
        else if (char === '"' || char === "'") quote = char;
        else if (char === ',') { comma = i; break; }
    }
    const attrs = {};
    const prefix = comma >= 0 ? line.slice(0, comma) : line;
    const regex = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
    for (const match of prefix.matchAll(regex)) attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
    return { attrs, name: comma >= 0 ? line.slice(comma + 1).trim() : '', duration: Number(prefix.match(/^#EXTINF:\s*(-?[\d.]+)/i)?.[1] || -1) };
}

export function parseM3U(source, { baseUrl = '', name = 'Lista M3U' } = {}) {
    if (typeof source !== 'string' || new TextEncoder().encode(source).byteLength > MAX_PLAYLIST_BYTES) throw new Error('A lista deve ter no máximo 20 MB.');
    const text = source.replace(/^\uFEFF/, '').trim();
    if (!text || /^\s*(?:<!doctype|<html|\{|\[)/i.test(text)) throw new Error('Este conteúdo não é uma lista M3U válida.');
    // Um manifesto HLS é um único vídeo, não uma lista de canais/segmentos.
    if (/^#EXT-X-/im.test(text)) {
        const url = httpUrl(baseUrl);
        if (!url) throw new Error('Este arquivo é um vídeo HLS. Abra pelo link original da playlist M3U8.');
        return { entries: [{ id: '0', name, group: 'Vídeo', logo: '', url, type: 'hls', isLive: !/^#EXT-X-ENDLIST/im.test(text) }], skipped: 0 };
    }
    const entries = [], seen = new Set();
    let pending = null, group = '', skipped = 0;
    for (const raw of text.split(/\r\n|\n|\r/)) {
        const line = raw.trim();
        if (!line) continue;
        if (/^#EXTINF:/i.test(line)) { pending = metadata(line); group = ''; continue; }
        if (/^#EXTGRP:/i.test(line)) { group = line.slice(8).trim(); continue; }
        if (line.startsWith('#')) continue;
        const url = httpUrl(line, baseUrl || undefined);
        if (!url || seen.has(url)) { skipped++; pending = null; group = ''; continue; }
        if (entries.length >= MAX_CHANNELS) throw new Error('A lista deve ter no máximo 50.000 itens.');
        const attrs = pending?.attrs || {};
        const type = mediaType(url);
        entries.push({
            id: String(entries.length),
            name: (pending?.name || attrs['tvg-name'] || `Item ${entries.length + 1}`).slice(0, 500),
            group: (attrs['group-title'] || group || 'Sem categoria').slice(0, 200),
            logo: httpUrl(attrs['tvg-logo'] || '', baseUrl || undefined),
            url, type, isLive: type !== 'video' && (pending?.duration ?? -1) <= 0,
        });
        seen.add(url); pending = null; group = '';
    }
    if (!entries.length) throw new Error('Nenhum link de vídeo HTTP ou HTTPS foi encontrado nesta lista.');
    return { entries, skipped };
}

export function proxyMediaUrl(value, api, server = 0) {
    const valid = httpUrl(value);
    if (!valid) throw new Error('Link de vídeo inválido.');
    const target = new URL(valid), proxy = new URL(api);
    if (target.origin === proxy.origin && target.pathname.startsWith('/m/')) return valid;
    // URL.href normaliza caracteres Unicode antes da codificação base64.
    const encoded = btoa(valid).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${api.replace(/\/+$/, '')}/m/${server}/x/${encoded}`;
}
