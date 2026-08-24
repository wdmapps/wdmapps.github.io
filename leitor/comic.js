const imageRx = /\.(avif|bmp|gif|jpe?g|png|webp)$/i;
let rarWasmPromise = null;

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
  if (!names.length) throw new Error('CBZ sem imagens');

  const pages = [];
  for (let i = 0; i < names.length; i++) {
    onProgress?.(i + 1, names.length);
    pages.push({ name: names[i], blob: await zip.files[names[i]].async('blob') });
  }
  return pages;
}

async function unrarCbr(file, onProgress) {
  const [{ createExtractorFromData }, wasmBinary] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/node-unrar-js@2.0.2/esm/index.esm.js'),
    rarWasmPromise || (rarWasmPromise = fetch('https://cdn.jsdelivr.net/npm/node-unrar-js@2.0.2/esm/js/unrar.wasm').then(r => {
      if (!r.ok) throw new Error('Falha ao carregar descompactador RAR');
      return r.arrayBuffer();
    }))
  ]);

  const extractor = await createExtractorFromData({ wasmBinary, data: await file.arrayBuffer() });
  const result = extractor.extract({ files: h => !h.flags?.directory && imageRx.test(h.name || '') });
  const entries = [...result.files];
  const pages = [];
  let done = 0;
  for (const entry of entries) {
    done++;
    onProgress?.(done, entries.length);
    if (entry.extraction) {
      pages.push({
        name: entry.fileHeader.name,
        blob: new Blob([entry.extraction], { type: imageMime(entry.fileHeader.name) })
      });
    }
  }
  pages.sort((a, b) => naturalSort(a.name, b.name));
  if (!pages.length) throw new Error('CBR sem imagens');
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
