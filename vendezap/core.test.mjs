import test from 'node:test';
import assert from 'node:assert/strict';
import { blankProfile, buildShareText, escapeHtml, filterAds, mergeAds, validateBackup, validateVideo, MAX_VIDEO_BYTES, shareFiles } from './core.mjs';

const photo = 'data:image/png;base64,aGVsbG8=';
const ad = (changes = {}) => ({ id: 'sample-1', product: 'Tênis branco', price: 'R$ 149,90', category: 'Calçados', tagline: 'Novidade!', description: 'Confortável', variants: 'Branco 38\nBranco 39', status: 'available', stock: 0, templateId: 'clean', photos: [photo], video: null, createdAt: 100, updatedAt: 200, lastSharedAt: 0, ...changes });
const backup = (ads = [ad()], profile = blankProfile()) => ({ format: 'vendezap-web', version: 1, ads, profile });

test('WhatsApp includes zero stock, variations, business details and no blank separators', () => {
  const text = buildShareText(ad(), { ...blankProfile(), shopName: 'Minha loja', phone: '(11) 99999-0000', paymentMethods: 'Pix' });
  assert.ok(text.includes('*Tênis branco*'));
  assert.ok(text.includes('*Estoque:* 0 unidades'));
  assert.ok(text.includes('• Branco 38\n• Branco 39'));
  assert.ok(text.includes('💳 Pix'));
  assert.ok(text.endsWith('Minha loja'));
  assert.ok(!text.includes('undefined'));
  assert.ok(!text.includes('*Status:*'));
  assert.ok(buildShareText(ad({ stock: 1, status: 'reserved' })).includes('*Status:* Reservado'));
  assert.ok(buildShareText(ad({ stock: 1 })).endsWith('*Estoque:* 1 unidade'));
});
test('search matches accents and combines category and availability', () => {
  const ads = [ad(), ad({ id: 'second', product: 'Sandália', status: 'reserved', updatedAt: 300 })];
  assert.equal(filterAds(ads, { query: 'tenis' }).length, 1);
  assert.equal(filterAds(ads, { category: 'Calçados', status: 'reserved' })[0].product, 'Sandália');
  assert.equal(filterAds(ads)[0].id, 'second');
  assert.equal(filterAds(ads, { query: 'ausente' }).length, 0);
});
test('backup roundtrip preserves photos, zero stock and all fields', () => {
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(backup()))), { ads: [ad()], profile: blankProfile() });
});
test('invalid or unsafe backup content is rejected before a write', () => {
  for (const change of [{ photos: ['javascript:alert(1)'] }, { photos: ['data:image/svg+xml;base64,aGVsbG8='] }, { photos: ['https://example.com/tracker.jpg'] }, { stock: -1 }, { stock: .5 }, { status: '__proto__' }, { templateId: 'unknown' }, { product: '' }, { updatedAt: NaN }, { updatedAt: 9e15 }, { photos: Array(7).fill(photo) }]) {
    assert.throws(() => validateBackup(backup([ad(change)])));
  }
  assert.throws(() => validateBackup(backup([ad(), ad()])));
  assert.throws(() => validateBackup({ version: 1, ads: [] }));
  assert.throws(() => validateBackup(backup([], { shopName: 123 })));
});
test('unexpected imported properties are dropped and HTML is escaped', () => {
  const result = validateBackup(backup([ad({ injected: '<script>bad</script>' })]));
  assert.equal(result.ads[0].injected, undefined);
  assert.equal(escapeHtml('<img src=x onerror="bad">'), '&lt;img src=x onerror=&quot;bad&quot;&gt;');
});
test('import skips identical records and preserves both versions on ID collision', () => {
  const existing = [ad()];
  assert.equal(mergeAds(existing, [ad()], () => 'copy').added, 0);
  const merged = mergeAds(existing, [ad({ price: 'R$ 99' })], () => 'copy');
  assert.equal(merged.added, 1);
  assert.equal(merged.ads[0].price, 'R$ 149,90');
  assert.equal(merged.ads[1].price, 'R$ 99');
  assert.equal(merged.ads[1].id, 'copy');
  assert.equal(existing.length, 1);
  assert.throws(() => mergeAds(Array.from({ length: 1000 }, (_, i) => ad({ id: `ad-${i}` })), [ad()], () => 'copy'));
});
test('legacy photo backups remain readable without a video field', () => {
  const legacy = ad(); delete legacy.video;
  assert.deepEqual(validateBackup(backup([legacy])).ads[0], ad());
  assert.equal(mergeAds([legacy], [ad()], () => 'copy').added, 0);
});
test('video backup version 2 preserves attachment and import detects a changed video', () => {
  const video = 'data:video/mp4;base64,aGVsbG8=';
  const original = ad({ photos: [], video });
  const value = { ...backup([original]), version: 2 };
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(value))).ads[0], original);
  assert.throws(() => validateBackup({ ...value, version: 3 }));
  assert.throws(() => validateBackup(backup([ad({ video })])));
  const imported = ad({ photos: [], video: 'data:video/webm;base64,dmlkZW8=' });
  const result = mergeAds([original], [imported], () => 'copy');
  assert.equal(result.ads[0].video, video);
  assert.equal(result.ads[1].video, imported.video);
});
test('video validation rejects remote URLs, wrong MIME, malformed base64 and oversize', () => {
  for (const value of ['https://example.com/video.mp4', 'javascript:alert(1)', 'data:text/html;base64,aGVsbG8=', 'data:video/quicktime;base64,aGVsbG8=', 'data:video/mp4;base64,a', 'data:video/mp4;base64,', 'data:video/mp4;base64,abc@', 123]) assert.throws(() => validateVideo(value));
  const atLimit = Buffer.alloc(MAX_VIDEO_BYTES).toString('base64');
  assert.equal(validateVideo('data:video/mp4;base64,' + atLimit).length, atLimit.length + 22);
  assert.throws(() => validateVideo('data:video/mp4;base64,' + Buffer.alloc(MAX_VIDEO_BYTES + 1).toString('base64')));
});
test('share files uses the original video bytes and leaves photo attachments intact', async () => {
  const videoAd = ad({ photos: [], video: 'data:video/mp4;base64,aGVsbG8=' });
  const files = shareFiles(videoAd, 'produto');
  assert.equal(files.length, 1);
  assert.equal(files[0].name, 'produto.mp4');
  assert.equal(files[0].type, 'video/mp4');
  assert.equal(await files[0].text(), 'hello');
  const photos = shareFiles(ad(), 'produto');
  assert.equal(photos[0].name, 'produto-1.png');
  assert.equal(photos[0].type, 'image/png');
});
