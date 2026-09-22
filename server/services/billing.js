// Suscripción SaaS: cobro periódico a cada restaurante por usar la
// plataforma (distinto de la facturación electrónica, que es el restaurante
// facturándole a SUS clientes). Usa Stripe Checkout + Billing Portal.
//
// Requiere que el dueño de la plataforma tenga su propia cuenta de Stripe y
// configure STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET y los IDs de precio de
// cada plan (ver PLANS abajo) como variables de entorno. Sin esas variables,
// el sistema sigue funcionando normalmente: solo no se puede cobrar todavía.
const db = require('../db');

const PLANS = {
  starter: { name: 'Starter', priceEnvVar: 'STRIPE_PRICE_ID_STARTER' },
  pro: { name: 'Pro', priceEnvVar: 'STRIPE_PRICE_ID_PRO' }
};

let stripeClient = null;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw Object.assign(new Error('La pasarela de pagos no está configurada (falta STRIPE_SECRET_KEY).'), { status: 501 });
  }
  if (!stripeClient) {
    stripeClient = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

function mapStripeStatus(stripeStatus) {
  if (['active', 'trialing'].includes(stripeStatus)) return stripeStatus === 'trialing' ? 'trialing' : 'active';
  if (['past_due', 'unpaid', 'incomplete'].includes(stripeStatus)) return 'past_due';
  return 'canceled';
}

async function getOrCreateSubscription(restaurantId) {
  let sub = await db.get('SELECT * FROM platform_subscriptions WHERE restaurant_id = ?', [restaurantId]);
  if (!sub) {
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    await db.run(`
      INSERT INTO platform_subscriptions (restaurant_id, plan, status, trial_ends_at)
      VALUES (?, 'trial', 'trialing', ?)
    `, [restaurantId, trialEndsAt]);
    sub = await db.get('SELECT * FROM platform_subscriptions WHERE restaurant_id = ?', [restaurantId]);
  }
  return sub;
}

// Middleware opcional para exigir suscripción activa (o prueba vigente) antes
// de dejar usar el resto de la API. Apagado por defecto: solo actúa si la
// variable de entorno ENFORCE_BILLING=true está definida, para no romper
// instalaciones que aún no han conectado Stripe.
async function requireActiveSubscription(req, res, next) {
  if (process.env.ENFORCE_BILLING !== 'true') return next();
  if (!req.user) return next();
  try {
    const sub = await getOrCreateSubscription(req.user.restaurant_id);
    const now = new Date();
    const trialActive = sub.status === 'trialing' && sub.trial_ends_at && new Date(sub.trial_ends_at) > now;
    if (trialActive || sub.status === 'active') return next();
    return res.status(402).json({
      error: 'Tu período de prueba terminó. Actualiza tu plan de suscripción para seguir usando el sistema.',
      subscription: sub
    });
  } catch (e) {
    next(e);
  }
}

module.exports = { PLANS, getStripe, mapStripeStatus, getOrCreateSubscription, requireActiveSubscription };
