const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const Stripe = require('stripe');

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const db = getFirestore();
const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

const WDM_OWNER_UID = 'cNUIxdJzXIaut7VnoGBx9EAzgRM2';
// Preço mensal em produção da conta Stripe do WDM Shopping.
const STRIPE_PRICE_ID = 'price_1U5E6WHA6Fom0zgZsj3LMmXu';
const SITE_URL = 'https://wdmapps.com.br/shopping/';
const ADULT_CATEGORY = 'Sex Shop (18+)';

function requireWdmOwner(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Entre na conta proprietária para continuar.');
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

function storeCategory(store = {}) {
  if (store.primaryRole === 'provider' && store.accountType === 'both') {
    return String(store.storeProfile?.category || '');
  }
  return String(store.category || '');
}

function isAdultStoreData(store = {}) {
  return storeCategory(store).toLowerCase() === ADULT_CATEGORY.toLowerCase();
}

function timestampText(value) {
  try {
    return value?.toDate ? value.toDate().toISOString() : null;
  } catch {
    return null;
  }
}

async function adminAudit(action, targetUid, details = {}) {
  await db.collection('adminActions').add({
    action,
    targetUid,
    performedBy: WDM_OWNER_UID,
    details,
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function deleteSnapshotDocs(snapshot) {
  const docs = snapshot.docs || [];
  for (let start = 0; start < docs.length; start += 400) {
    const batch = db.batch();
    docs.slice(start, start + 400).forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
}

function stripeClient() {
  return new Stripe(STRIPE_SECRET_KEY.value());
}

function subscriptionAccess(stripeStatus) {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return { status: 'active', entitled: true };
    case 'past_due':
      // Mantém a loja ativa enquanto a Stripe tenta recuperar o pagamento.
      return { status: 'grace_period', entitled: true };
    case 'unpaid':
      return { status: 'on_hold', entitled: false };
    case 'paused':
      return { status: 'paused', entitled: false };
    case 'incomplete':
      return { status: 'pending', entitled: false };
    case 'incomplete_expired':
    case 'canceled':
      return { status: 'expired', entitled: false };
    default:
      return { status: 'inactive', entitled: false };
  }
}

async function saveStripeCustomer(uid, customerId) {
  if (!uid || !customerId) return;
  await db.collection('stripeCustomers').doc(uid).set({
    stripeCustomerId: customerId,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function findUidByCustomer(customerId) {
  if (!customerId) return null;
  const query = await db.collection('stripeCustomers')
    .where('stripeCustomerId', '==', customerId)
    .limit(1)
    .get();
  return query.empty ? null : query.docs[0].id;
}

async function syncStoreBillingState(uid, entitled) {
  const storeRef = db.collection('stores').doc(uid);
  const storeSnap = await storeRef.get();
  if (!storeSnap.exists) return;

  const store = storeSnap.data() || {};

  if (!entitled && store.published !== false) {
    await storeRef.set({
      published: false,
      billingSuspended: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return;
  }

  if (entitled && store.billingSuspended === true && store.adminSuspended !== true) {
    await storeRef.set({
      published: true,
      billingSuspended: false,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
}

async function syncStripeSubscription(subscription, fallbackUid = null) {
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id || null;

  const uid = subscription.metadata?.firebaseUid
    || fallbackUid
    || await findUidByCustomer(customerId);

  if (!uid) {
    logger.warn('Assinatura Stripe sem Firebase UID', {
      subscriptionId: subscription.id,
      customerId,
    });
    return;
  }

  const deletedAccount = await db.collection('deletedAccounts').doc(uid).get();
  if (deletedAccount.exists) {
    logger.info('Webhook ignorado para conta excluída', { uid, subscriptionId: subscription.id });
    return;
  }

  const access = subscriptionAccess(subscription.status);
  const item = subscription.items?.data?.[0] || null;
  const periodEndSeconds = item?.current_period_end
    || subscription.current_period_end
    || null;

  const payload = {
    provider: 'stripe',
    product: 'wdm-shopping',
    priceId: item?.price?.id || STRIPE_PRICE_ID,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: customerId,
    stripeStatus: subscription.status,
    status: access.status,
    entitled: access.entitled,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (periodEndSeconds) {
    payload.currentPeriodEnd = Timestamp.fromMillis(periodEndSeconds * 1000);
  }

  await Promise.all([
    db.collection('subscriptions').doc(uid).set(payload, { merge: true }),
    saveStripeCustomer(uid, customerId),
  ]);

  await syncStoreBillingState(uid, access.entitled);
}

exports.createStripeCheckoutSession = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Entre na sua conta antes de assinar.');
    }

    const uid = request.auth.uid;
    if (uid === WDM_OWNER_UID) {
      throw new HttpsError('failed-precondition', 'A conta proprietária não requer assinatura.');
    }
    const [checkoutStoreDoc, checkoutUserDoc] = await Promise.all([
      db.collection('stores').doc(uid).get(),
      db.collection('users').doc(uid).get(),
    ]);
    const checkoutStore = checkoutStoreDoc.exists ? checkoutStoreDoc.data() || {} : {};
    const pendingCategory = checkoutUserDoc.exists ? checkoutUserDoc.data()?.pendingStore?.category : '';
    if (isAdultStoreData(checkoutStore) || String(pendingCategory || '').toLowerCase() === ADULT_CATEGORY.toLowerCase()) {
      throw new HttpsError('failed-precondition', 'Lojas Sex Shop usam liberação manual pelo administrador e não podem assinar pela Stripe.');
    }
    const email = request.auth.token.email || null;
    const stripe = stripeClient();

    const subSnap = await db.collection('subscriptions').doc(uid).get();
    if (subSnap.exists && subSnap.data()?.entitled === true) {
      throw new HttpsError('failed-precondition', 'Esta conta já possui uma assinatura ativa.');
    }

    const customerMap = await db.collection('stripeCustomers').doc(uid).get();
    let customerId = customerMap.exists ? customerMap.data()?.stripeCustomerId : null;

    const createCustomer = async () => {
      const customer = await stripe.customers.create({
        email: email || undefined,
        metadata: {
          firebaseUid: uid,
          project: 'wdm-shopping',
        },
      });
      await saveStripeCustomer(uid, customer.id);
      return customer.id;
    };

    if (!customerId) customerId = await createCustomer();

    const createSession = () => stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customerId,
      client_reference_id: uid,
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${SITE_URL}?stripe=success&session_id={CHECKOUT_SESSION_ID}#painel`,
      cancel_url: `${SITE_URL}?stripe=cancel#painel`,
      metadata: {
        firebaseUid: uid,
        project: 'wdm-shopping',
      },
      subscription_data: {
        metadata: {
          firebaseUid: uid,
          project: 'wdm-shopping',
          plan: 'mensal',
        },
      },
    });

    let session;
    try {
      session = await createSession();
    } catch (error) {
      if (error?.code !== 'resource_missing' || error?.param !== 'customer') throw error;
      customerId = await createCustomer();
      session = await createSession();
    }

    return { url: session.url };
  }
);

exports.createStripePortalSession = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Entre na sua conta para gerenciar a assinatura.');
    }

    const uid = request.auth.uid;
    const subSnap = await db.collection('subscriptions').doc(uid).get();
    const customerId = subSnap.exists ? subSnap.data()?.stripeCustomerId : null;

    if (!customerId) {
      throw new HttpsError('failed-precondition', 'Nenhum cliente Stripe foi encontrado para esta conta.');
    }

    const stripe = stripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${SITE_URL}#painel`,
    });

    return { url: session.url };
  }
);

exports.adminListStores = onCall(async (request) => {
  requireWdmOwner(request);

  const [storeSnapshot, userSnapshot] = await Promise.all([
    db.collection('stores').get(),
    db.collection('users').get(),
  ]);
  const storeDocs = storeSnapshot.docs.filter((item) => item.id !== WDM_OWNER_UID);
  const storeIds = new Set(storeDocs.map((item) => item.id));
  const stores = [];
  const adultProducts = [];

  for (const storeDoc of storeDocs) {
    const uid = storeDoc.id;
    const store = storeDoc.data() || {};
    const [userDoc, subscriptionDoc] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('subscriptions').doc(uid).get(),
    ]);
    const user = userDoc.exists ? userDoc.data() || {} : {};
    const subscription = subscriptionDoc.exists ? subscriptionDoc.data() || {} : {};

    stores.push({
      uid,
      name: store.name || store.storeProfile?.name || 'Loja sem nome',
      slug: store.slug || uid,
      category: storeCategory(store) || 'Sem categoria',
      accountType: store.accountType || 'store',
      email: user.email || '',
      pendingOnboarding: false,
      published: store.published !== false,
      adminSuspended: store.adminSuspended === true,
      adminSuspensionReason: store.adminSuspensionReason || '',
      createdAt: timestampText(store.createdAt),
      subscription: {
        provider: subscription.provider || '',
        status: subscription.status || 'inactive',
        entitled: subscription.entitled === true,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd === true,
        stripeSubscriptionId: subscription.stripeSubscriptionId || '',
        currentPeriodEnd: timestampText(subscription.currentPeriodEnd),
      },
    });

    if (isAdultStoreData(store)) {
      const productSnapshot = await storeDoc.ref.collection('products').get();
      productSnapshot.docs.forEach((productDoc) => {
        const product = productDoc.data() || {};
        if (product.listingType === 'service') return;
        adultProducts.push({
          storeId: uid,
          storeName: store.name || store.storeProfile?.name || 'Sex Shop',
          productId: productDoc.id,
          name: product.name || 'Produto sem nome',
          description: product.description || '',
          price: Number(product.price || 0),
          imageUrl: product.imageUrl || '',
          adultApprovalStatus: product.adultApprovalStatus || 'pending',
          adultRejectedReason: product.adultRejectedReason || '',
          submittedAt: timestampText(product.adultSubmittedAt || product.createdAt),
        });
      });
    }
  }

  for (const userDoc of userSnapshot.docs) {
    const uid = userDoc.id;
    if (uid === WDM_OWNER_UID || storeIds.has(uid)) continue;
    const user = userDoc.data() || {};
    const pending = user.pendingStore || {};
    if (String(pending.category || '').toLowerCase() !== ADULT_CATEGORY.toLowerCase()) continue;
    const subscriptionDoc = await db.collection('subscriptions').doc(uid).get();
    const subscription = subscriptionDoc.exists ? subscriptionDoc.data() || {} : {};
    stores.push({
      uid,
      name: pending.business || 'Cadastro Sex Shop',
      slug: '',
      category: ADULT_CATEGORY,
      accountType: pending.accountType || 'store',
      email: user.email || '',
      pendingOnboarding: true,
      published: false,
      adminSuspended: false,
      adminSuspensionReason: '',
      createdAt: timestampText(user.createdAt),
      subscription: {
        provider: subscription.provider || '',
        status: subscription.status || 'inactive',
        entitled: subscription.entitled === true,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd === true,
        stripeSubscriptionId: subscription.stripeSubscriptionId || '',
        currentPeriodEnd: timestampText(subscription.currentPeriodEnd),
      },
    });
  }

  stores.sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
  adultProducts.sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
  return { stores, adultProducts };
});

exports.adminSetStoreStatus = onCall(async (request) => {
  requireWdmOwner(request);
  const targetUid = targetUidFrom(request);
  const suspended = request.data?.suspended === true;
  const reason = String(request.data?.reason || 'Revisão administrativa').trim().slice(0, 300);
  const storeRef = db.collection('stores').doc(targetUid);
  const storeDoc = await storeRef.get();
  if (!storeDoc.exists) throw new HttpsError('not-found', 'A loja não foi encontrada.');

  if (suspended) {
    await storeRef.set({
      published: false,
      adminSuspended: true,
      adminSuspensionReason: reason,
      adminSuspendedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await adminAudit('store_suspended', targetUid, { reason });
    return { message: 'Loja suspensa e retirada do site.' };
  }

  const subscriptionDoc = await db.collection('subscriptions').doc(targetUid).get();
  const subscription = subscriptionDoc.exists ? subscriptionDoc.data() || {} : {};
  const currentPeriodEnd = subscription.currentPeriodEnd?.toMillis?.() || 0;
  const manualValid = subscription.provider !== 'manual' || currentPeriodEnd > Date.now();
  const entitled = subscription.entitled === true && manualValid;
  await storeRef.set({
    published: entitled,
    adminSuspended: false,
    adminSuspensionReason: FieldValue.delete(),
    adminSuspendedAt: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await adminAudit('store_restored', targetUid, { published: entitled });
  return { message: entitled ? 'Loja restaurada e publicada.' : 'Suspensão removida. A loja continua oculta até a assinatura ser liberada.' };
});

exports.adminGrantManualSubscription = onCall(async (request) => {
  requireWdmOwner(request);
  const targetUid = targetUidFrom(request);
  const days = Math.max(1, Math.min(365, Number(request.data?.days || 30)));
  const storeRef = db.collection('stores').doc(targetUid);
  const [storeDoc, userDoc] = await Promise.all([
    storeRef.get(),
    db.collection('users').doc(targetUid).get(),
  ]);
  const pendingCategory = userDoc.exists ? userDoc.data()?.pendingStore?.category : '';
  const adultRegistration = isAdultStoreData(storeDoc.exists ? storeDoc.data() || {} : {})
    || String(pendingCategory || '').toLowerCase() === ADULT_CATEGORY.toLowerCase();
  if (!adultRegistration) {
    throw new HttpsError('failed-precondition', 'A liberação manual é reservada para lojas adultas revisadas pelo administrador.');
  }
  const existingSubscription = await db.collection('subscriptions').doc(targetUid).get();
  if (existingSubscription.exists && existingSubscription.data()?.provider === 'stripe' && existingSubscription.data()?.entitled === true) {
    throw new HttpsError('failed-precondition', 'Cancele primeiro a assinatura Stripe desta loja antes de liberar o acesso manual.');
  }

  const currentPeriodEnd = Timestamp.fromMillis(Date.now() + days * 24 * 60 * 60 * 1000);
  const updates = [
    db.collection('subscriptions').doc(targetUid).set({
      provider: 'manual',
      product: 'wdm-shopping-adult',
      status: 'active',
      entitled: true,
      cancelAtPeriodEnd: false,
      currentPeriodEnd,
      grantedBy: WDM_OWNER_UID,
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
  await Promise.all(updates);
  await adminAudit('manual_subscription_granted', targetUid, { days });
  return {
    message: storeDoc.exists
      ? `Acesso manual liberado por ${days} dias.`
      : `Acesso liberado por ${days} dias. O lojista já pode entrar e concluir a criação da loja.`,
  };
});

exports.adminCancelSubscription = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    requireWdmOwner(request);
    const targetUid = targetUidFrom(request);
    const subscriptionRef = db.collection('subscriptions').doc(targetUid);
    const subscriptionDoc = await subscriptionRef.get();
    if (!subscriptionDoc.exists) throw new HttpsError('not-found', 'Esta conta não possui assinatura.');
    const data = subscriptionDoc.data() || {};

    if (data.provider === 'manual' || !data.stripeSubscriptionId) {
      await Promise.all([
        subscriptionRef.set({
          status: 'expired',
          entitled: false,
          cancelAtPeriodEnd: false,
          canceledBy: WDM_OWNER_UID,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true }),
        syncStoreBillingState(targetUid, false),
      ]);
      await adminAudit('manual_subscription_canceled', targetUid);
      return { message: 'Acesso manual cancelado e loja retirada do site.' };
    }

    const atPeriodEnd = request.data?.atPeriodEnd !== false;
    const stripe = stripeClient();
    let updated;
    try {
      updated = atPeriodEnd
        ? await stripe.subscriptions.update(data.stripeSubscriptionId, { cancel_at_period_end: true })
        : await stripe.subscriptions.cancel(data.stripeSubscriptionId);
    } catch (error) {
      if (error?.code !== 'resource_missing') throw error;
      await subscriptionRef.set({ status: 'expired', entitled: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await syncStoreBillingState(targetUid, false);
      await adminAudit('stripe_subscription_missing', targetUid, { subscriptionId: data.stripeSubscriptionId });
      return { message: 'Assinatura não existia mais na Stripe; o acesso local foi encerrado.' };
    }
    await syncStripeSubscription(updated, targetUid);
    await adminAudit(atPeriodEnd ? 'stripe_subscription_cancel_scheduled' : 'stripe_subscription_canceled', targetUid, { subscriptionId: updated.id });
    return { message: atPeriodEnd ? 'Cancelamento agendado para o fim do período pago.' : 'Assinatura cancelada imediatamente.' };
  }
);

exports.adminModerateAdultProduct = onCall(async (request) => {
  requireWdmOwner(request);
  const storeId = String(request.data?.storeId || '').trim();
  const productId = String(request.data?.productId || '').trim();
  const action = String(request.data?.action || '').trim();
  if (!storeId || !productId || !['approve', 'reject', 'delete'].includes(action)) {
    throw new HttpsError('invalid-argument', 'Produto ou ação inválida.');
  }

  const storeRef = db.collection('stores').doc(storeId);
  const [storeDoc, productDoc] = await Promise.all([
    storeRef.get(),
    storeRef.collection('products').doc(productId).get(),
  ]);
  if (!storeDoc.exists || !productDoc.exists) throw new HttpsError('not-found', 'O anúncio não foi encontrado.');
  if (!isAdultStoreData(storeDoc.data() || {})) throw new HttpsError('failed-precondition', 'Este anúncio não pertence a uma loja adulta.');
  const productRef = productDoc.ref;
  const product = productDoc.data() || {};

  if (action === 'delete') {
    if (product.imagePath) {
      await getStorage().bucket().file(String(product.imagePath)).delete({ ignoreNotFound: true }).catch((error) => logger.warn('Falha ao apagar foto moderada', { storeId, productId, error: error?.message }));
    }
    await productRef.delete();
    await adminAudit('adult_product_deleted', storeId, { productId, name: product.name || '' });
    return { message: 'Anúncio excluído definitivamente.' };
  }

  if (action === 'approve') {
    await productRef.set({
      adultApprovalStatus: 'approved',
      adultApproved: true,
      adultRejectedReason: FieldValue.delete(),
      adultReviewedBy: WDM_OWNER_UID,
      adultReviewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await adminAudit('adult_product_approved', storeId, { productId, name: product.name || '' });
    return { message: 'Anúncio aprovado para aparecer na home.' };
  }

  const reason = String(request.data?.reason || 'Anúncio inadequado para a home.').trim().slice(0, 300);
  await productRef.set({
    adultApprovalStatus: 'rejected',
    adultApproved: false,
    adultRejectedReason: reason,
    adultReviewedBy: WDM_OWNER_UID,
    adultReviewedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await adminAudit('adult_product_rejected', storeId, { productId, name: product.name || '', reason });
  return { message: 'Anúncio rejeitado. O motivo ficará visível para o lojista.' };
});

exports.adminDeleteStoreAccount = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    requireWdmOwner(request);
    const targetUid = targetUidFrom(request);
    const storeRef = db.collection('stores').doc(targetUid);
    const [storeDoc, userDoc] = await Promise.all([
      storeRef.get(),
      db.collection('users').doc(targetUid).get(),
    ]);
    if (!storeDoc.exists && !userDoc.exists) throw new HttpsError('not-found', 'A conta não foi encontrada.');
    const store = storeDoc.exists ? storeDoc.data() || {} : {};
    const user = userDoc.exists ? userDoc.data() || {} : {};
    const storeName = String(store.name || store.storeProfile?.name || user.pendingStore?.business || user.email || 'Cadastro sem nome').trim();
    if (String(request.data?.confirmName || '').trim() !== storeName) {
      throw new HttpsError('failed-precondition', 'O nome informado não confere com a loja.');
    }

    await db.collection('deletedAccounts').doc(targetUid).set({
      storeName,
      deletedBy: WDM_OWNER_UID,
      status: 'deleting',
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const subscriptionDoc = await db.collection('subscriptions').doc(targetUid).get();
    const subscription = subscriptionDoc.exists ? subscriptionDoc.data() || {} : {};
    if (subscription.stripeSubscriptionId) {
      await stripeClient().subscriptions.cancel(subscription.stripeSubscriptionId).catch((error) => {
        if (error?.code !== 'resource_missing') logger.warn('Falha ao cancelar assinatura durante exclusão', { targetUid, error: error?.message });
      });
    }

    await getStorage().bucket().deleteFiles({ prefix: `stores/${targetUid}/` }).catch((error) => logger.warn('Falha ao apagar arquivos da loja', { targetUid, error: error?.message }));
    const [products, slugs] = await Promise.all([
      storeDoc.exists ? storeRef.collection('products').get() : Promise.resolve({ docs: [] }),
      db.collection('slugs').where('storeId', '==', targetUid).get(),
    ]);
    await deleteSnapshotDocs(products);
    await deleteSnapshotDocs(slugs);

    const batch = db.batch();
    batch.delete(storeRef);
    batch.delete(db.collection('users').doc(targetUid));
    batch.delete(db.collection('subscriptions').doc(targetUid));
    batch.delete(db.collection('stripeCustomers').doc(targetUid));
    batch.set(db.collection('deletedAccounts').doc(targetUid), {
      storeName,
      deletedBy: WDM_OWNER_UID,
      status: 'deleted',
      deletedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();
    await getAuth().deleteUser(targetUid).catch((error) => {
      if (error?.code !== 'auth/user-not-found') logger.warn('Falha ao apagar usuário do Authentication', { targetUid, error: error?.message });
    });
    await adminAudit('store_account_deleted', targetUid, { storeName });
    return { message: 'Assinatura cancelada, conta, anúncios, fotos e loja excluídos.' };
  }
);

exports.expireManualSubscriptions = onSchedule('every 24 hours', async () => {
  const now = Timestamp.now();
  const snapshot = await db.collection('subscriptions')
    .where('provider', '==', 'manual')
    .get();

  const expired = snapshot.docs.filter((item) => {
    const subscription = item.data() || {};
    return subscription.entitled === true
      && subscription.currentPeriodEnd?.toMillis?.() <= now.toMillis();
  });
  for (const item of expired) {
    await Promise.all([
      item.ref.set({ status: 'expired', entitled: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
      syncStoreBillingState(item.id, false),
    ]);
  }
  logger.info('Assinaturas manuais vencidas processadas', { total: expired.length });
});

exports.stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const stripe = stripeClient();
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      res.status(400).send('Missing Stripe-Signature');
      return;
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        STRIPE_WEBHOOK_SECRET.value()
      );
    } catch (error) {
      logger.error('Falha ao validar webhook Stripe', error);
      res.status(400).send('Invalid signature');
      return;
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const uid = session.client_reference_id || session.metadata?.firebaseUid || null;
          const customerId = typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id || null;

          if (uid && customerId) {
            await saveStripeCustomer(uid, customerId);
          }

          const subscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id || null;

          if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            await syncStripeSubscription(subscription, uid);
          }
          break;
        }

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          await syncStripeSubscription(event.data.object);
          break;
        }

        default:
          logger.debug('Evento Stripe ignorado', { type: event.type });
      }

      res.status(200).json({ received: true });
    } catch (error) {
      logger.error('Erro processando webhook Stripe', {
        eventId: event.id,
        eventType: event.type,
        error: error?.message || String(error),
      });
      res.status(500).send('Webhook processing failed');
    }
  }
);
