import { shareFiles } from './core.mjs?v=20261027.3';

// Web Share has no caption field. Keep the caption on the clipboard and send
// files alone, so WhatsApp cannot turn it into a separate text message.
export function mediaShareData(ad, name, { gallery = false } = {}) {
  const source = gallery || ad.video ? ad : { ...ad, photos: ad.photos.slice(0, 1) };
  return { files: shareFiles(source, name) };
}

export async function deliverMedia(data, { canShare, share, save }) {
  if (!data.files.length) throw new Error('Este anúncio não possui mídia para compartilhar.');
  if (canShare?.(data) && share) {
    try {
      // Call without an earlier await, preserving activation from the button.
      await share(data);
      return 'shared';
    } catch (error) {
      if (error.name === 'AbortError') return 'cancelled';
      if (!['NotAllowedError', 'SecurityError', 'NotSupportedError', 'TypeError'].includes(error.name)) throw error;
    }
  }
  if (data.files.length > 1) return 'unsupported-gallery';
  save(data.files[0], data.files[0].name);
  return 'downloaded';
}
