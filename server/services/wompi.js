// Integración con Wompi (https://wompi.co), pasarela de pagos colombiana
// (de Bancolombia). Se usa como alternativa a Stripe para cobrar la
// suscripción SaaS cuando el dueño de la plataforma es un negocio
// colombiano, ya que Stripe no permite recibir pagos directamente en Colombia.
//
// Usa el "Web Checkout" de Wompi: una página de pago alojada por Wompi a la
// que se redirige al cliente, sin manejar datos de tarjeta en este servidor.
//
// Wompi no ofrece cobro recurrente automático accesible a cualquier cuenta:
// el modelo aquí es "renovación manual" — cada pago exitoso activa la
// suscripción por 30 días; para el siguiente período el admin genera un
// nuevo link de pago desde Admin → Suscripción.
//
// Requiere las variables de entorno WOMPI_PUBLIC_KEY y WOMPI_INTEGRITY_SECRET
// (Wompi → Configuración → Llaves de API). Para el webhook, además
// WOMPI_EVENTS_SECRET ("Secreto de eventos").
const crypto = require('crypto');

const WOMPI_CHECKOUT_BASE = 'https://checkout.wompi.co/p/';

function getConfig() {
  const publicKey = process.env.WOMPI_PUBLIC_KEY;
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;
  if (!publicKey || !integritySecret) {
    throw Object.assign(
      new Error('Wompi no está configurado (faltan WOMPI_PUBLIC_KEY / WOMPI_INTEGRITY_SECRET en el servidor).'),
      { status: 501 }
    );
  }
  return { publicKey, integritySecret, eventsSecret: process.env.WOMPI_EVENTS_SECRET };
}

function isConfigured() {
  return !!(process.env.WOMPI_PUBLIC_KEY && process.env.WOMPI_INTEGRITY_SECRET);
}

// Firma de integridad exigida por el Web Checkout de Wompi:
// SHA256(referencia + monto_en_centavos + moneda + secreto_de_integridad)
function buildIntegritySignature({ reference, amountInCents, currency, integritySecret }) {
  return crypto.createHash('sha256')
    .update(`${reference}${amountInCents}${currency}${integritySecret}`)
    .digest('hex');
}

function buildCheckoutUrl({ amountInCents, currency = 'COP', reference, redirectUrl, customerEmail }) {
  const { publicKey, integritySecret } = getConfig();
  const signature = buildIntegritySignature({ reference, amountInCents, currency, integritySecret });

  const params = new URLSearchParams({
    'public-key': publicKey,
    currency,
    'amount-in-cents': String(amountInCents),
    reference,
    'signature:integrity': signature,
    'redirect-url': redirectUrl
  });
  if (customerEmail) params.set('customer-data:email', customerEmail);

  return `${WOMPI_CHECKOUT_BASE}?${params.toString()}`;
}

// Verifica la firma que Wompi envía en cada evento de webhook, para
// confirmar que la notificación realmente viene de Wompi.
function verifyEventSignature(body, eventsSecret) {
  if (!eventsSecret) return false;
  const { signature, timestamp, data } = body || {};
  if (!signature?.properties || !timestamp || !data) return false;

  const concatenated = signature.properties.map((propPath) => {
    const parts = propPath.split('.');
    let value = data;
    for (const p of parts) value = value?.[p];
    return value;
  }).join('');

  const checksum = crypto.createHash('sha256')
    .update(`${concatenated}${timestamp}${eventsSecret}`)
    .digest('hex');

  return checksum === signature.checksum;
}

module.exports = { getConfig, isConfigured, buildCheckoutUrl, verifyEventSignature };
