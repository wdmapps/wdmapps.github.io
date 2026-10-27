import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaShareData, deliverMedia } from './sharing.mjs';

const ad = { product: 'Produto', photos: ['data:image/png;base64,Y2FwYQ==', 'data:image/png;base64,Z2FsZXJpYQ=='], video: null };

test('caption workflow sends only the cover file, never a separate title or text', async () => {
  const data = mediaShareData(ad, 'produto');
  assert.deepEqual(Object.keys(data), ['files']);
  assert.equal(data.files.length, 1);
  assert.equal(await data.files[0].text(), 'capa');
  let sent;
  assert.equal(await deliverMedia(data, { canShare: () => true, share: async payload => { sent = payload; }, save: () => assert.fail('unexpected download') }), 'shared');
  assert.equal(sent, data);
  assert.equal(sent.text, undefined);
  assert.equal(sent.title, undefined);
  assert.equal(ad.photos.length, 2);
});
test('unsupported media sharing downloads the photo instead of sending a text message', async () => {
  const data = mediaShareData(ad, 'produto'); let downloaded;
  assert.equal(await deliverMedia(data, { canShare: () => false, share: () => assert.fail('must not send text'), save: file => { downloaded = file; } }), 'downloaded');
  assert.equal(downloaded, data.files[0]);
});
test('cancelling native sharing does not download or retry with text', async () => {
  assert.equal(await deliverMedia(mediaShareData(ad, 'produto'), { canShare: () => true, share: async () => { throw new DOMException('cancelled', 'AbortError'); }, save: () => assert.fail('unexpected download') }), 'cancelled');
});
test('denied native sharing keeps a download alternative', async () => {
  let count = 0;
  assert.equal(await deliverMedia(mediaShareData(ad, 'produto'), { canShare: () => true, share: async () => { throw new DOMException('denied', 'NotAllowedError'); }, save: () => count++ }), 'downloaded');
  assert.equal(count, 1);
});
test('gallery remains available explicitly without replacing it with just one file', async () => {
  const data = mediaShareData(ad, 'produto', { gallery: true });
  assert.equal(data.files.length, 2);
  assert.equal(await deliverMedia(data, { canShare: () => false, save: () => assert.fail('partial gallery download') }), 'unsupported-gallery');
});
test('video stays intact and text-only ads do not silently become file shares', async () => {
  const data = mediaShareData({ photos: [], video: 'data:video/mp4;base64,dmlkZW8=' }, 'produto');
  assert.equal(await data.files[0].text(), 'video');
  assert.equal(data.files[0].type, 'video/mp4');
  await assert.rejects(deliverMedia({ files: [] }, { save: () => {} }));
});
