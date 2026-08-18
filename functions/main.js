const baseFunctions = require('./index');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

// Mantém todas as funções já existentes do WDM Shopping.
Object.assign(exports, baseFunctions);

const db = getFirestore();
const WDM_OWNER_UID = 'cNUIxdJzXIaut7VnoGBx9EAzgRM2';
const ADULT_CATEGORY = 'Sex Shop (18+)';
const FREE_TRIAL_DAYS = 5;
const FREE_TRIAL_MS = FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000;

function storeCategory(store = {}) {
  if (store.primaryRole === 'provider' && store.accountType === 'both') {
    return String(store.storeProfile?.category || '');
  }
  return String(store.category || '');
}

function isAdultRegistration(store = {}, user = {}) {
  const category = storeCategory(store) || String(user.pendingStore?.category || '');
  return category.toLowerCase() === ADULT_CATEGORY.toLowerCase();
}

function requireUser(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Entre na sua conta para continuar.');
  }
  if (request.auth.uid === WDM_OWNER_UID) {
    throw new HttpsError('failed-precondition', 'A conta proprietária não precisa de período de teste.');
  }
  return request.auth.uid;
}

async function expireTrialForUid(uid, forceIfExpired = false) {
  const subscriptionRef = db.collection('subscriptions').doc(uid);
  const storeRef = db.collection('stores').doc(uid);
  const now = Date.now();

  return db.runTransaction(async (transaction) => {
    const [subscriptionDoc, storeDoc] = await Promise.all([
      transaction.get(subscriptionRef),
      transaction.get(storeRef),
    ]);

    if (!subscriptionDoc.exists) return { expired: false, reason: 'missing' };
    const subscription = subscriptionDoc.data() || {};
    if (subscription.provider !== 'trial') return { expired: false, reason: 'not-trial' };

    const endMs = subscription.currentPeriodEnd?.toMillis?.() || 0;
    if (!endMs || endMs > now) {
      return { expired: false, reason: 'active', currentPeriodEnd: endMs };
    }
    if (subscription.entitled !== true && !forceIfExpired) {
      return { expired: true, reason: 'already-expired', currentPeriodEnd: endMs };
    }

    transaction.set(subscriptionRef, {
      status: 'expired',
      entitled: false,
      trialExpiredAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    if (storeDoc.exists) {
      transaction.set(storeRef, {
        published: false,
        billingSuspended: true,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    return { expired: true, reason: 'expired-now', currentPeriodEnd: endMs };
  });
}

exports.startFreeTrial = onCall(async (request) => {
  const uid = requireUser(request);
  const userRef = db.collection('users').doc(uid);
  const storeRef = db.collection('stores').doc(uid);
  const subscriptionRef = db.collection('subscriptions').doc(uid);
  const trialEnd = Timestamp.fromMillis(Date.now() + FREE_TRIAL_MS);

  const result = await db.runTransaction(async (transaction) => {
    const [userDoc, storeDoc, subscriptionDoc] = await Promise.all([
      transaction.get(userRef),
      transaction.get(storeRef),
      transaction.get(subscriptionRef),
    ]);

    if (!userDoc.exists) {
      throw new HttpsError('failed-precondition', 'Conclua primeiro o seu cadastro no WDM Shopping.');
    }

    const user = userDoc.data() || {};
    const store = storeDoc.exists ? storeDoc.data() || {} : {};

    if (isAdultRegistration(store, user)) {
      throw new HttpsError('failed-precondition', 'Lojas Sex Shop usam liberação manual pelo administrador.');
    }

    if (user.trialUsedAt) {
      throw new HttpsError('failed-precondition', 'O período grátis desta conta já foi utilizado.');
    }

    if (subscriptionDoc.exists) {
      const subscription = subscriptionDoc.data() || {};
      if (subscription.provider === 'trial' && subscription.entitled === true) {
        return {
          started: false,
          alreadyActive: true,
          currentPeriodEnd: subscription.currentPeriodEnd?.toMillis?.() || null,
        };
      }
      throw new HttpsError('failed-precondition', 'Esta conta já possui histórico de assinatura e não pode iniciar um novo teste grátis.');
    }

    transaction.set(subscriptionRef, {
      provider: 'trial',
      product: 'wdm-shopping',
      status: 'active',
      entitled: true,
      cancelAtPeriodEnd: true,
      trialDays: FREE_TRIAL_DAYS,
      trialStartedAt: FieldValue.serverTimestamp(),
      currentPeriodEnd: trialEnd,
      updatedAt: FieldValue.serverTimestamp(),
    });

    transaction.set(userRef, {
      trialUsedAt: FieldValue.serverTimestamp(),
      trialEndsAt: trialEnd,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    if (storeDoc.exists && store.adminSuspended !== true) {
      transaction.set(storeRef, {
        published: true,
        billingSuspended: false,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    return {
      started: true,
      alreadyActive: false,
      currentPeriodEnd: trialEnd.toMillis(),
    };
  });

  logger.info('Teste grátis do WDM Shopping iniciado', { uid, days: FREE_TRIAL_DAYS });
  return {
    ...result,
    days: FREE_TRIAL_DAYS,
    message: result.started
      ? `Teste grátis liberado por ${FREE_TRIAL_DAYS} dias.`
      : 'O teste grátis desta conta já está ativo.',
  };
});

exports.expireOwnTrial = onCall(async (request) => {
  const uid = requireUser(request);
  const result = await expireTrialForUid(uid, true);
  if (result.reason === 'not-trial' || result.reason === 'missing') {
    throw new HttpsError('failed-precondition', 'Esta conta não possui um teste grátis para encerrar.');
  }
  if (result.reason === 'active') {
    return { expired: false, currentPeriodEnd: result.currentPeriodEnd };
  }
  return { expired: true, message: 'O período grátis terminou. Assine para continuar usando sua página.' };
});

// Segurança de retaguarda: encerra testes vencidos mesmo que o usuário não abra o site.
exports.expireFreeTrials = onSchedule('every 1 hours', async () => {
  const snapshot = await db.collection('subscriptions')
    .where('provider', '==', 'trial')
    .get();

  let expired = 0;
  for (const item of snapshot.docs) {
    const subscription = item.data() || {};
    if (subscription.entitled !== true) continue;
    const endMs = subscription.currentPeriodEnd?.toMillis?.() || 0;
    if (!endMs || endMs > Date.now()) continue;
    const result = await expireTrialForUid(item.id, true);
    if (result.expired) expired += 1;
  }

  logger.info('Testes grátis vencidos processados', { expired, total: snapshot.size });
});
