const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const Stripe = require('stripe');

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const db = getFirestore();
const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

// Preço de TESTE criado na conta Stripe do WDM Shopping.
// Ao entrar em produção, trocaremos apenas este ID pelo price_... do modo live.
const STRIPE_PRICE_ID = 'price_1U56uLHYVjU33JYujLtK89Jd';
const SITE_URL = 'https://wdmapps.com.br/shopping/';

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

  if (entitled && store.billingSuspended === true) {
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
    const email = request.auth.token.email || null;
    const stripe = stripeClient();

    const subSnap = await db.collection('subscriptions').doc(uid).get();
    if (subSnap.exists && subSnap.data()?.entitled === true) {
      throw new HttpsError('failed-precondition', 'Esta conta já possui uma assinatura ativa.');
    }

    const customerMap = await db.collection('stripeCustomers').doc(uid).get();
    let customerId = customerMap.exists ? customerMap.data()?.stripeCustomerId : null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email || undefined,
        metadata: {
          firebaseUid: uid,
          project: 'wdm-shopping',
        },
      });
      customerId = customer.id;
      await saveStripeCustomer(uid, customerId);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
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
