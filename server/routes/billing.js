const express = require('express');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const ah = require('../utils/asyncHandler');
const { PLANS, getStripe, mapStripeStatus, getOrCreateSubscription } = require('../services/billing');

const router = express.Router();

router.get('/plans', (req, res) => {
  res.json(Object.entries(PLANS).map(([id, p]) => ({
    id, name: p.name, configured: !!process.env[p.priceEnvVar]
  })));
});

// Webhook de Stripe: sin autenticación (Stripe lo llama directamente), pero
// verificado con la firma de la petición. El body llega crudo (Buffer) por
// el express.raw() montado en index.js antes de express.json().
router.post('/webhook', ah(async (req, res) => {
  let stripe;
  try {
    stripe = getStripe();
  } catch (e) {
    return res.status(501).json({ error: e.message });
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(501).json({ error: 'Falta configurar STRIPE_WEBHOOK_SECRET' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).json({ error: `Firma de webhook inválida: ${e.message}` });
  }

  async function upsertFromSubscription(subscription, restaurantId) {
    const rid = restaurantId || subscription.metadata?.restaurant_id;
    if (!rid) return;
    const priceId = subscription.items?.data?.[0]?.price?.id;
    const plan = Object.entries(PLANS).find(([, p]) => process.env[p.priceEnvVar] === priceId)?.[0] || 'starter';
    const currentPeriodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString() : null;

    await getOrCreateSubscription(rid);
    await db.run(`
      UPDATE platform_subscriptions SET
        plan = ?, status = ?, stripe_customer_id = ?, stripe_subscription_id = ?,
        current_period_end = ?, updated_at = ?
      WHERE restaurant_id = ?
    `, [plan, mapStripeStatus(subscription.status), subscription.customer, subscription.id,
        currentPeriodEnd, db.nowIso(), rid]);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const restaurantId = session.client_reference_id;
      if (session.subscription && restaurantId) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await upsertFromSubscription(subscription, restaurantId);
      }
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await upsertFromSubscription(event.data.object, null);
      break;
    }
    default:
      break;
  }

  res.json({ received: true });
}));

router.use(authMiddleware);

router.get('/subscription', requireRole('admin'), ah(async (req, res) => {
  res.json(await getOrCreateSubscription(req.user.restaurant_id));
}));

router.post('/checkout-session', requireRole('admin'), ah(async (req, res) => {
  const { plan } = req.body;
  const planDef = PLANS[plan];
  if (!planDef) return res.status(400).json({ error: 'Plan inválido' });
  const priceId = process.env[planDef.priceEnvVar];
  if (!priceId) return res.status(501).json({ error: `Falta configurar ${planDef.priceEnvVar}` });

  const stripe = getStripe();
  const sub = await getOrCreateSubscription(req.user.restaurant_id);
  const restaurant = await db.get('SELECT * FROM restaurants WHERE id = ?', [req.user.restaurant_id]);
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: req.user.restaurant_id,
    customer: sub.stripe_customer_id || undefined,
    customer_email: sub.stripe_customer_id ? undefined : req.user.email,
    subscription_data: { metadata: { restaurant_id: req.user.restaurant_id } },
    success_url: `${appUrl}/admin/suscripcion?checkout=success`,
    cancel_url: `${appUrl}/admin/suscripcion?checkout=cancelled`,
    metadata: { restaurant_id: req.user.restaurant_id, restaurant_name: restaurant?.name || '' }
  });

  res.json({ url: session.url });
}));

router.post('/portal-session', requireRole('admin'), ah(async (req, res) => {
  const stripe = getStripe();
  const sub = await getOrCreateSubscription(req.user.restaurant_id);
  if (!sub.stripe_customer_id) return res.status(400).json({ error: 'Aún no tienes una suscripción de pago activa' });

  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${appUrl}/admin/suscripcion`
  });
  res.json({ url: session.url });
}));

module.exports = router;
