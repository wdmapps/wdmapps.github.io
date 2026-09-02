const baseFunctions = require('./main');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

Object.assign(exports, baseFunctions);

const db = getFirestore();
const WDM_OWNER_UID = 'cNUIxdJzXIaut7VnoGBx9EAzgRM2';
const PARTNER_PROVIDER = 'partner';
const PARTNER_PRODUCT = 'wdm-shopping-partner';

function requireOwner(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Entre na conta do administrador para continuar.');
  }
  if (request.auth.uid !== WDM_OWNER_UID) {
    throw new HttpsError('permission-denied', 'Esta ação está disponível apenas para o administrador.');
  }
}

function targetUidFrom(request) {
  const targetUid = String(request.data?.targetUid || '').trim();
  if (!targetUid || targetUid === WDM_OWNER_UID) {
    throw new HttpsError('invalid-argument', 'Selecione uma conta de cliente válida.');
  }
  return targetUid;
}

function timestampText(value) {
  try {
    return value?.toDate ? value.toDate().toISOString() : null;
  } catch {
    return null;
  }
}

function accountCategory(store = {}, user = {}) {
  if (store.primaryRole === 'provider' && store.accountType === 'both') {
    return String(store.storeProfile?.category || user.pendingStore?.category || '');
  }
  return String(store.category || user.pendingStore?.category || '');
}

exports.adminListAccounts = onCall(async (request) => {
  requireOwner(request);

  const [usersSnapshot, storesSnapshot, subscriptionsSnapshot] = await Promise.all([
    db.collection('users').get(),
    db.collection('stores').get(),
    db.collection('subscriptions').get(),
  ]);

  const users = new Map(usersSnapshot.docs.map((item) => [item.id, item.data() || {}]));
  const stores = new Map(storesSnapshot.docs.map((item) => [item.id, item.data() || {}]));
  const subscriptions = new Map(subscriptionsSnapshot.docs.map((item) => [item.id, item.data() || {}]));
  const ids = new Set([...users.keys(), ...stores.keys(), ...subscriptions.keys()]);
  ids.delete(WDM_OWNER_UID);

  const accounts = [...ids].map((uid) => {
    const user = users.get(uid) || {};
    const store = stores.get(uid) || {};
    const subscription = subscriptions.get(uid) || {};
    const storeExists = stores.has(uid);
    const freePartner = subscription.freePartner === true
      || subscription.provider === PARTNER_PROVIDER
      || subscription.product === PARTNER_PRODUCT;

    return {
      uid,
      name: store.name
        || store.storeProfile?.name
        || user.pendingStore?.business
        || user.displayName
        || user.email
        || 'Conta sem loja',
      email: user.email || '',
      category: accountCategory(store, user) || 'Sem categoria',
      accountType: store.accountType || user.pendingStore?.accountType || 'store',
      storeExists,
      pendingOnboarding: !storeExists,
      published: storeExists && store.published !== false && store.adminSuspended !== true,
      adminSuspended: store.adminSuspended === true,
      createdAt: timestampText(store.createdAt || user.createdAt),
      subscription: {
        provider: subscription.provider || '',
        status: subscription.status || 'inactive',
        entitled: subscription.entitled === true,
        freePartner,
        stripeSubscriptionId: subscription.stripeSubscriptionId || '',
        currentPeriodEnd: timestampText(subscription.currentPeriodEnd),
      },
    };
  });

  accounts.sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
  return { accounts };
});

exports.adminSetFreeAccess = onCall(async (request) => {
  requireOwner(request);
  const targetUid = targetUidFrom(request);
  const enabled = request.data?.enabled === true;
  const userRef = db.collection('users').doc(targetUid);
  const storeRef = db.collection('stores').doc(targetUid);
  const subscriptionRef = db.collection('subscriptions').doc(targetUid);

  const [userDoc, storeDoc, subscriptionDoc] = await Promise.all([
    userRef.get(),
    storeRef.get(),
    subscriptionRef.get(),
  ]);

  if (!userDoc.exists && !storeDoc.exists) {
    throw new HttpsError('not-found', 'A conta selecionada não foi encontrada.');
  }

  const subscription = subscriptionDoc.exists ? subscriptionDoc.data() || {} : {};

  if (enabled) {
    if (subscription.provider === 'stripe' && subscription.entitled === true) {
      throw new HttpsError('failed-precondition', 'Esta conta possui uma assinatura Stripe ativa. Cancele a assinatura paga antes de torná-la FREE.');
    }

    const updates = [
      subscriptionRef.set({
        provider: PARTNER_PROVIDER,
        product: PARTNER_PRODUCT,
        status: 'active',
        entitled: true,
        freePartner: true,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: FieldValue.delete(),
        freeGrantedBy: WDM_OWNER_UID,
        freeGrantedAt: FieldValue.serverTimestamp(),
        freeRevokedAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }),
    ];

    if (storeDoc.exists) {
      const store = storeDoc.data() || {};
      updates.push(storeRef.set({
        published: store.adminSuspended === true ? false : true,
        billingSuspended: false,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }));
    }

    updates.push(db.collection('adminActions').add({
      action: 'partner_free_granted',
      targetUid,
      performedBy: WDM_OWNER_UID,
      createdAt: FieldValue.serverTimestamp(),
    }));

    await Promise.all(updates);
    return {
      message: storeDoc.exists
        ? 'Conta marcada como Parceiro FREE e loja liberada.'
        : 'Conta marcada como Parceiro FREE. O lojista já pode concluir a criação da loja.',
    };
  }

  const isFreePartner = subscription.freePartner === true
    || subscription.provider === PARTNER_PROVIDER
    || subscription.product === PARTNER_PRODUCT;

  if (!isFreePartner) {
    throw new HttpsError('failed-precondition', 'Esta conta não está marcada como Parceiro FREE.');
  }

  const updates = [
    subscriptionRef.set({
      status: 'expired',
      entitled: false,
      freePartner: false,
      cancelAtPeriodEnd: false,
      freeRevokedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
  ];

  if (storeDoc.exists) {
    updates.push(storeRef.set({
      published: false,
      billingSuspended: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }));
  }

  updates.push(db.collection('adminActions').add({
    action: 'partner_free_revoked',
    targetUid,
    performedBy: WDM_OWNER_UID,
    createdAt: FieldValue.serverTimestamp(),
  }));

  await Promise.all(updates);
  return { message: 'Acesso FREE removido. A loja volta a exigir assinatura para permanecer publicada.' };
});
