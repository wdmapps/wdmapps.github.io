const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const crypto = require('crypto');

const db = getFirestore();
const WDM_ADMIN_EMAIL = 'williamwdm@gmail.com';
const GRAPH_VERSION = 'v26.0';
const SITE_URL = 'https://wdmapps.com.br';
const CALLBACK_URL = 'https://us-central1-wdm-admin.cloudfunctions.net/instagramOAuthCallback';
const CONFIG_REF = db.collection('privateConfig').doc('instagram');

function requireAdmin(request) {
  const email = String(request.auth && request.auth.token && request.auth.token.email || '').toLowerCase();
  if (!request.auth || email !== WDM_ADMIN_EMAIL) {
    throw new HttpsError('permission-denied', 'Acesso exclusivo do administrador WDM.');
  }
}

async function readConfig() {
  const snap = await CONFIG_REF.get();
  return snap.exists ? (snap.data() || {}) : {};
}

async function jsonOrThrow(response, label) {
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok || data.error) {
    const message = data && data.error && data.error.message
      ? data.error.message
      : (data.error_message || data.raw || ('HTTP ' + response.status));
    throw new Error(label + ': ' + message);
  }
  return data;
}

exports.creativeInstagramStatus = onCall(async (request) => {
  requireAdmin(request);
  const config = await readConfig();
  return {
    configured: Boolean(config.appId && config.appSecret),
    appId: config.appId || '',
    callbackUrl: CALLBACK_URL,
    connected: Boolean(config.accessToken && config.igUserId),
    username: config.username || '',
    accountType: config.accountType || '',
    profilePictureUrl: config.profilePictureUrl || '',
    expiresAt: config.expiresAt && config.expiresAt.toDate ? config.expiresAt.toDate().toISOString() : null,
    graphVersion: GRAPH_VERSION,
  };
});

exports.creativeInstagramSaveConfig = onCall(async (request) => {
  requireAdmin(request);
  const appId = String(request.data && request.data.appId || '').trim();
  const appSecret = String(request.data && request.data.appSecret || '').trim();
  const existing = await readConfig();
  if (!appId) throw new HttpsError('invalid-argument', 'Informe o App ID do Instagram.');
  if (!appSecret && !existing.appSecret) {
    throw new HttpsError('invalid-argument', 'Informe o App Secret na primeira configuração.');
  }
  const payload = {
    appId,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: WDM_ADMIN_EMAIL,
  };
  if (appSecret) payload.appSecret = appSecret;
  await CONFIG_REF.set(payload, { merge: true });
  return { ok: true, callbackUrl: CALLBACK_URL };
});

exports.creativeInstagramConnectUrl = onCall(async (request) => {
  requireAdmin(request);
  const config = await readConfig();
  if (!config.appId || !config.appSecret) {
    throw new HttpsError('failed-precondition', 'Salve primeiro o App ID e o App Secret da Meta.');
  }
  const state = crypto.randomBytes(24).toString('hex');
  await CONFIG_REF.set({
    oauthState: state,
    oauthStateExpiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.searchParams.set('client_id', config.appId);
  url.searchParams.set('redirect_uri', CALLBACK_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'instagram_business_basic,instagram_business_content_publish');
  url.searchParams.set('state', state);
  url.searchParams.set('enable_fb_login', '0');
  url.searchParams.set('force_reauth', 'true');
  return { url: url.toString() };
});

exports.instagramOAuthCallback = onRequest(async (req, res) => {
  try {
    const code = String(req.query.code || '').split('#')[0].trim();
    const state = String(req.query.state || '').trim();
    if (!code || !state) throw new Error('Código ou estado de autorização ausente.');

    const config = await readConfig();
    const stateExpires = config.oauthStateExpiresAt && config.oauthStateExpiresAt.toMillis
      ? config.oauthStateExpiresAt.toMillis() : 0;
    if (!config.oauthState || state !== config.oauthState || stateExpires < Date.now()) {
      throw new Error('A autorização expirou. Tente conectar o Instagram novamente.');
    }

    const body = new URLSearchParams();
    body.set('client_id', config.appId);
    body.set('client_secret', config.appSecret);
    body.set('grant_type', 'authorization_code');
    body.set('redirect_uri', CALLBACK_URL);
    body.set('code', code);

    const shortResponse = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const shortData = await jsonOrThrow(shortResponse, 'Instagram OAuth');
    const shortToken = shortData.access_token;
    if (!shortToken) throw new Error('O Instagram não retornou um token de acesso.');

    const exchange = new URL('https://graph.instagram.com/access_token');
    exchange.searchParams.set('grant_type', 'ig_exchange_token');
    exchange.searchParams.set('client_secret', config.appSecret);
    exchange.searchParams.set('access_token', shortToken);
    const longResponse = await fetch(exchange);
    const longData = await jsonOrThrow(longResponse, 'Instagram token longo');
    const accessToken = longData.access_token || shortToken;
    const expiresIn = Number(longData.expires_in || 5184000);

    const profileUrl = new URL('https://graph.instagram.com/' + GRAPH_VERSION + '/me');
    profileUrl.searchParams.set('fields', 'id,username,account_type,profile_picture_url');
    profileUrl.searchParams.set('access_token', accessToken);
    const profileResponse = await fetch(profileUrl);
    const profile = await jsonOrThrow(profileResponse, 'Perfil do Instagram');
    const igUserId = String(profile.id || shortData.user_id || '').trim();
    if (!igUserId) throw new Error('Não foi possível identificar a conta profissional do Instagram.');

    await CONFIG_REF.set({
      accessToken,
      igUserId,
      username: profile.username || '',
      accountType: profile.account_type || '',
      profilePictureUrl: profile.profile_picture_url || '',
      connectedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + expiresIn * 1000),
      oauthState: FieldValue.delete(),
      oauthStateExpiresAt: FieldValue.delete(),
      lastError: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    res.redirect(302, SITE_URL + '/admin/criativos/?instagram=connected');
  } catch (error) {
    console.error('Falha OAuth Instagram:', error);
    await CONFIG_REF.set({
      lastError: String(error && error.message || error).slice(0, 1000),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }).catch(() => {});
    res.redirect(302, SITE_URL + '/admin/criativos/?instagram=error');
  }
});

exports.creativeInstagramDisconnect = onCall(async (request) => {
  requireAdmin(request);
  await CONFIG_REF.set({
    accessToken: FieldValue.delete(),
    igUserId: FieldValue.delete(),
    username: FieldValue.delete(),
    accountType: FieldValue.delete(),
    profilePictureUrl: FieldValue.delete(),
    expiresAt: FieldValue.delete(),
    connectedAt: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ok: true };
});

async function maybeRefreshToken(config) {
  const expiresAt = config.expiresAt && config.expiresAt.toMillis ? config.expiresAt.toMillis() : 0;
  if (!config.accessToken || !expiresAt || expiresAt - Date.now() > 7 * 24 * 60 * 60 * 1000) {
    return config;
  }
  const refreshUrl = new URL('https://graph.instagram.com/refresh_access_token');
  refreshUrl.searchParams.set('grant_type', 'ig_refresh_token');
  refreshUrl.searchParams.set('access_token', config.accessToken);
  const response = await fetch(refreshUrl);
  const data = await jsonOrThrow(response, 'Renovação do token Instagram');
  const expiresIn = Number(data.expires_in || 5184000);
  const accessToken = data.access_token || config.accessToken;
  await CONFIG_REF.set({
    accessToken,
    expiresAt: Timestamp.fromMillis(Date.now() + expiresIn * 1000),
    tokenRefreshedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ...config, accessToken };
}

exports.creativeInstagramUpload = onCall({ timeoutSeconds: 60, memory: '512MiB' }, async (request) => {
  requireAdmin(request);
  const dataUrl = String(request.data && request.data.dataUrl || '');
  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg));base64,(.+)$/i);
  if (!match) throw new HttpsError('invalid-argument', 'Envie o criativo final em JPEG.');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) {
    throw new HttpsError('invalid-argument', 'A imagem precisa ter até 8 MB.');
  }

  const bucket = getStorage().bucket();
  const filename = 'creative-public/' + Date.now() + '-' + crypto.randomBytes(8).toString('hex') + '.jpg';
  const file = bucket.file(filename);
  await file.save(buffer, {
    contentType: 'image/jpeg',
    resumable: false,
    metadata: { cacheControl: 'public,max-age=604800' },
  });
  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const signed = await file.getSignedUrl({ action: 'read', expires });
  return { imageUrl: signed[0], expiresAt: new Date(expires).toISOString() };
});

exports.creativeInstagramPublish = onCall({ timeoutSeconds: 60 }, async (request) => {
  requireAdmin(request);
  const imageUrl = String(request.data && request.data.imageUrl || '').trim();
  const caption = String(request.data && request.data.caption || '').trim().slice(0, 2200);
  if (!/^https:\/\//i.test(imageUrl)) {
    throw new HttpsError('invalid-argument', 'A imagem precisa estar em uma URL HTTPS pública.');
  }

  let config = await readConfig();
  if (!config.accessToken || !config.igUserId) {
    throw new HttpsError('failed-precondition', 'Conecte primeiro uma conta profissional do Instagram.');
  }

  try {
    config = await maybeRefreshToken(config);
    const mediaBody = new URLSearchParams();
    mediaBody.set('image_url', imageUrl);
    mediaBody.set('caption', caption);
    mediaBody.set('access_token', config.accessToken);

    const mediaResponse = await fetch('https://graph.instagram.com/' + GRAPH_VERSION + '/' + config.igUserId + '/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: mediaBody,
    });
    const mediaData = await jsonOrThrow(mediaResponse, 'Criação do post');
    if (!mediaData.id) throw new Error('A Meta não retornou o container da publicação.');

    const publishBody = new URLSearchParams();
    publishBody.set('creation_id', mediaData.id);
    publishBody.set('access_token', config.accessToken);
    const publishResponse = await fetch('https://graph.instagram.com/' + GRAPH_VERSION + '/' + config.igUserId + '/media_publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: publishBody,
    });
    const published = await jsonOrThrow(publishResponse, 'Publicação do post');

    await db.collection('creativePublications').add({
      instagramMediaId: published.id || null,
      creationId: mediaData.id,
      username: config.username || '',
      imageUrl,
      caption,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: WDM_ADMIN_EMAIL,
    });
    return { ok: true, mediaId: published.id || '', username: config.username || '' };
  } catch (error) {
    console.error('Falha ao publicar no Instagram:', error);
    throw new HttpsError('internal', String(error && error.message || error).slice(0, 500));
  }
});
