export const STATUSES = Object.freeze({ available: 'Disponível', last_units: 'Últimas unidades', reserved: 'Reservado', sold_out: 'Esgotado', archived: 'Arquivado' });
export const TEMPLATES = ['clean', 'offer', 'boutique', 'service'];
export const PROFILE_LIMITS = { shopName: 100, phone: 40, location: 200, paymentMethods: 200, deliveryInfo: 200 };
export const MAX_ADS = 1000;
export const MAX_PHOTOS = 6;
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
const TEXT_LIMITS = { product: 120, price: 50, category: 60, tagline: 160, description: 4000, variants: 1500 };
export const blankProfile = () => Object.fromEntries(Object.keys(PROFILE_LIMITS).map(key => [key, '']));
export const normalizeSearch = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function validText(value, limit) {
  if (typeof value !== 'string' || value.length > limit) throw new Error('O backup contém um campo de texto inválido.');
  return value.trim();
}
export function validatePhoto(value) {
  if (typeof value !== 'string' || value.length > 4_000_000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error('O backup contém uma foto inválida. Use um backup exportado pelo VendeZap Web.');
  }
  return value;
}
export function validateProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Dados da loja inválidos.');
  return Object.fromEntries(Object.entries(PROFILE_LIMITS).map(([key, limit]) => [key, validText(value[key] ?? '', limit)]));
}
export function validateAd(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Anúncio inválido no backup.');
  const ad = Object.fromEntries(Object.entries(TEXT_LIMITS).map(([key, limit]) => [key, validText(value[key] ?? '', limit)]));
  if (!ad.product) throw new Error('Um dos anúncios não tem nome.');
  if (typeof value.id !== 'string' || !/^[\w-]{1,100}$/.test(value.id)) throw new Error('Identificador de anúncio inválido.');
  if (!Object.hasOwn(STATUSES, value.status)) throw new Error('Disponibilidade inválida no backup.');
  if (!TEMPLATES.includes(value.templateId)) throw new Error('Estilo inválido no backup.');
  if (value.stock !== null && (!Number.isInteger(value.stock) || value.stock < 0 || value.stock > 999999)) throw new Error('Estoque inválido no backup.');
  if (!Array.isArray(value.photos) || value.photos.length > MAX_PHOTOS) throw new Error('Quantidade de fotos inválida no backup.');
  const times = {};
  for (const key of ['createdAt', 'updatedAt', 'lastSharedAt']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > 8_640_000_000_000_000) throw new Error('Data inválida no backup.');
    times[key] = value[key];
  }
  return { ...ad, id: value.id, status: value.status, templateId: value.templateId, stock: value.stock, photos: value.photos.map(validatePhoto), ...times };
}
export function validateBackup(value) {
  if (!value || value.format !== 'vendezap-web' || value.version !== 1 || !Array.isArray(value.ads) || value.ads.length > MAX_ADS) {
    throw new Error('Selecione um backup JSON do VendeZap Web. O backup ZIP do Android ainda não é compatível.');
  }
  const ads = value.ads.map(validateAd);
  if (new Set(ads.map(ad => ad.id)).size !== ads.length) throw new Error('O backup contém identificadores repetidos.');
  return { ads, profile: validateProfile(value.profile) };
}
export function buildShareText(ad, profile = blankProfile()) {
  return [ad.tagline, ad.product && `*${ad.product}*`, ad.description,
    ad.variants && `*Opções:*\n${ad.variants.split('\n').map(x => x.trim()).filter(Boolean).map(x => `• ${x}`).join('\n')}`,
    ad.price && `*${ad.price}*`, ad.status !== 'available' && `*Status:* ${STATUSES[ad.status]}`,
    ad.stock !== null && `*Estoque:* ${ad.stock} unidade${ad.stock === 1 ? '' : 's'}`,
    profile.paymentMethods && `💳 ${profile.paymentMethods}`, profile.deliveryInfo && `🚚 ${profile.deliveryInfo}`,
    profile.location && `📍 ${profile.location}`, profile.phone && `📲 ${profile.phone}`, profile.shopName
  ].filter(value => value !== false && value !== null && value !== undefined && value !== '').join('\n\n');
}
export function filterAds(ads, { query = '', status = '', category = '' } = {}) {
  const term = normalizeSearch(query).trim();
  return ads.filter(ad => (!status || ad.status === status) && (!category || ad.category === category) &&
    (!term || normalizeSearch([ad.product, ad.description, ad.category, ad.tagline, ad.variants].join(' ')).includes(term)))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
// Conflicting IDs produce a separate record; importing never overwrites an existing ad.
export function mergeAds(existing, incoming, createId) {
  const result = [...existing];
  const byId = new Map(existing.map(ad => [ad.id, ad]));
  let added = 0;
  for (const ad of incoming) {
    const previous = byId.get(ad.id);
    if (previous && JSON.stringify(validateAd(previous)) === JSON.stringify(validateAd(ad))) continue;
    const copy = { ...ad, id: previous ? createId() : ad.id };
    result.push(copy);
    byId.set(copy.id, copy);
    added++;
  }
  if (result.length > MAX_ADS) throw new Error('Limite de 1.000 anúncios atingido. Exporte um backup antes de organizar seu acervo.');
  return { ads: result, added };
}
