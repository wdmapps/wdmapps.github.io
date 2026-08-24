const imageRx = /\.(avif|bmp|gif|jpe?g|png|webp)$/i;
let rarWasmPromise = null;
let unrarModulePromise = null;

const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
const imageMime = name => {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return ({ jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', gif:'image/gif', bmp:'image/bmp', avif:'image/avif' })[ext] || 'image/jpeg';
};

async function unzipCbz(file, onProgress) {
  const { default: JSZip } = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
  const zip = await JSZip.loadAsync(file);
  const names = Object.keys(zip.files)
    .filter(name => !zip.files[name].dir && imageRx.test(name))
    .sort(naturalSort);
  if (!names.length) throw new Error('Arquivo sem imagens compatíveis');

  const pages = [];
  for (let i = 0; i < names.length; i++) {
    onProgress?.(i + 1, names.length);
    pages.push({ name: names[i], blob: await zip.files[names[i]].async('blob') });
  }
  return pages;
}

async function getUnrarModule() {
  if (!unrarModulePromise) {
    unrarModulePromise = (async () => {
      const urls = [
        'https://esm.sh/node-unrar-js@2.0.2?bundle&target=es2020',
        'https://cdn.skypack.dev/node-unrar-js@2.0.2'
      ];
      let lastError;
      for (const url of urls) {
        try {
          const mod = await import(url);
          if (typeof mod.createExtractorFromData === 'function') return mod;
        } catch (err) {
          lastError = err;
          console.warn('Falha ao carregar motor RAR por', url, err);
        }
      }
      throw lastError || new Error('Não foi possível carregar o motor RAR');
    })();
  }
  return unrarModulePromise;
}

async function getRarWasm() {
  if (!rarWasmPromise) {
    rarWasmPromise = (async () => {
      const urls = [
        'https://cdn.jsdelivr.net/npm/node-unrar-js@2.0.2/esm/js/unrar.wasm',
        'https://unpkg.com/node-unrar-js@2.0.2/esm/js/unrar.wasm'
      ];
      let lastError;
      for (const url of urls) {
        try {
          const r = await fetch(url, { mode: 'cors', cache: 'force-cache' });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const buffer = await r.arrayBuffer();
          if (buffer.byteLength > 100000) return buffer;
        } catch (err) {
          lastError = err;
          console.warn('Falha ao carregar WASM RAR por', url, err);
        }
      }
      throw lastError || new Error('Falha ao carregar descompactador RAR');
    })();
  }
  return rarWasmPromise;
}

async function sniffArchive(file) {
  const sig = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isZip = sig[0] === 0x50 && sig[1] === 0x4b;
  const isRar = sig[0] === 0x52 && sig[1] === 0x61 && sig[2] === 0x72 && sig[3] === 0x21 && sig[4] === 0x1a && sig[5] === 0x07;
  return { isZip, isRar };
}

async function unrarCbr(file, onProgress) {
  const signature = await sniffArchive(file);

  // Alguns arquivos circulam como .CBR, mas por dentro são ZIP. Abre mesmo assim.
  if (signature.isZip) return unzipCbz(file, onProgress);
  if (!signature.isRar) throw new Error('Este CBR não parece ser um arquivo RAR válido');

  const [{ createExtractorFromData }, wasmBinary, data] = await Promise.all([
    getUnrarModule(),
    getRarWasm(),
    file.arrayBuffer()
  ]);

  const extractor = await createExtractorFromData({ wasmBinary, data });

  // Primeiro percorre toda a lista. O node-unrar-js usa iteradores lazy e eles precisam
  // ser consumidos até o fim para liberar corretamente o objeto nativo.
  const listing = extractor.getFileList();
  const headers = [...listing.fileHeaders];
  const imageHeaders = headers
    .filter(h => !h.flags?.directory && imageRx.test(h.name || ''))
    .sort((a, b) => naturalSort(a.name, b.name));

  if (!imageHeaders.length) throw new Error('CBR sem imagens compatíveis');
  if (imageHeaders.some(h => h.flags?.encrypted)) throw new Error('CBR protegido por senha');

  const wanted = imageHeaders.map(h => h.name);
  const result = extractor.extract({ files: wanted });
  const extracted = [...result.files];
  const byName = new Map();

  let done = 0;
  for (const entry of extracted) {
    done++;
    onProgress?.(done, extracted.length || wanted.length);
    const name = entry.fileHeader?.name || '';
    if (entry.extraction && imageRx.test(name)) {
      byName.set(name, new Blob([entry.extraction], { type: imageMime(name) }));
    }
  }

  // Mantém a ordem natural da revista, independentemente da ordem interna do RAR.
  const pages = wanted
    .filter(name => byName.has(name))
    .map(name => ({ name, blob: byName.get(name) }));

  if (!pages.length) throw new Error('Não foi possível extrair as páginas do CBR');
  return pages;
}

export function extractComic(file, ext, onProgress) {
  return ext === 'cbz' ? unzipCbz(file, onProgress) : unrarCbr(file, onProgress);
}

export async function imageDimensions(blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return result;
  } catch (e) {
    return { width: 700, height: 1000 };
  }
}

export async function makeThumbnail(blob) {
  if (!blob) return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(280 / bitmap.width, 380 / bitmap.height, 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .8));
  } catch (e) {
    return blob.size < 800000 ? blob : null;
  }
}
