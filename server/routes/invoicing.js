const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const { requireActiveSubscription } = require('../services/billing');
const ah = require('../utils/asyncHandler');
const { getOrderFull } = require('../services/orders');
const { issueDocument, providers } = require('../services/einvoicing');
const { generateInvoicePdf } = require('../services/pdf');

const router = express.Router();
router.use(authMiddleware);
router.use(requireActiveSubscription);

async function getOrCreateSettings(restaurantId) {
  let settings = await db.get('SELECT * FROM fiscal_settings WHERE restaurant_id = ?', [restaurantId]);
  if (!settings) {
    await db.run('INSERT INTO fiscal_settings (restaurant_id) VALUES (?)', [restaurantId]);
    settings = await db.get('SELECT * FROM fiscal_settings WHERE restaurant_id = ?', [restaurantId]);
  }
  return settings;
}

router.get('/providers', (req, res) => res.json(providers));

router.get('/settings', requireRole('admin'), ah(async (req, res) => {
  res.json(await getOrCreateSettings(req.user.restaurant_id));
}));

router.put('/settings', requireRole('admin'), ah(async (req, res) => {
  await getOrCreateSettings(req.user.restaurant_id);
  const {
    tax_id, legal_name, fiscal_regime, address, provider,
    provider_api_key, provider_api_secret, provider_config,
    invoice_prefix, invoice_resolution_number, invoice_range_from, invoice_range_to
  } = req.body;

  if (provider && !providers.includes(provider)) {
    return res.status(400).json({ error: 'Proveedor inválido' });
  }

  await db.run(`
    UPDATE fiscal_settings SET
      tax_id = COALESCE(?, tax_id),
      legal_name = COALESCE(?, legal_name),
      fiscal_regime = COALESCE(?, fiscal_regime),
      address = COALESCE(?, address),
      provider = COALESCE(?, provider),
      provider_api_key = COALESCE(?, provider_api_key),
      provider_api_secret = COALESCE(?, provider_api_secret),
      provider_config = COALESCE(?, provider_config),
      invoice_prefix = COALESCE(?, invoice_prefix),
      invoice_resolution_number = COALESCE(?, invoice_resolution_number),
      invoice_range_from = COALESCE(?, invoice_range_from),
      invoice_range_to = COALESCE(?, invoice_range_to),
      updated_at = ?
    WHERE restaurant_id = ?
  `, [
    tax_id, legal_name, fiscal_regime, address, provider,
    provider_api_key, provider_api_secret, provider_config,
    invoice_prefix, invoice_resolution_number, invoice_range_from, invoice_range_to,
    db.nowIso(), req.user.restaurant_id
  ]);

  res.json(await getOrCreateSettings(req.user.restaurant_id));
}));

router.get('/documents', requireRole('admin'), ah(async (req, res) => {
  const docs = await db.all('SELECT * FROM tax_documents WHERE restaurant_id = ? ORDER BY created_at DESC LIMIT 200',
    [req.user.restaurant_id]);
  res.json(docs);
}));

router.get('/documents/:id', requireRole('admin'), ah(async (req, res) => {
  const doc = await db.get('SELECT * FROM tax_documents WHERE id = ? AND restaurant_id = ?',
    [req.params.id, req.user.restaurant_id]);
  if (!doc) return res.status(404).json({ error: 'No encontrado' });
  res.json(doc);
}));

router.get('/documents/:id/pdf', ah(async (req, res) => {
  const doc = await db.get('SELECT * FROM tax_documents WHERE id = ? AND restaurant_id = ?',
    [req.params.id, req.user.restaurant_id]);
  if (!doc) return res.status(404).json({ error: 'No encontrado' });
  const restaurant = await db.get('SELECT * FROM restaurants WHERE id = ?', [req.user.restaurant_id]);
  const fiscalSettings = await getOrCreateSettings(req.user.restaurant_id);
  const order = doc.order_id ? await getOrderFull(db, doc.order_id, req.user.restaurant_id) : null;

  const pdf = await generateInvoicePdf({ restaurant, fiscalSettings, taxDocument: doc, order });
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `inline; filename="${doc.full_number}.pdf"`);
  res.send(pdf);
}));

// Emitir un documento fiscal para un pedido ya cerrado.
router.post('/orders/:orderId', requireRole('mesero', 'admin'), ah(async (req, res) => {
  const order = await getOrderFull(db, req.params.orderId, req.user.restaurant_id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (order.status !== 'cerrada') {
    return res.status(400).json({ error: 'Solo se puede facturar una cuenta ya cerrada' });
  }

  const existing = await db.get('SELECT * FROM tax_documents WHERE order_id = ? AND status != ?',
    [order.id, 'rechazada']);
  if (existing) return res.status(409).json({ error: 'Este pedido ya tiene un documento fiscal', document: existing });

  const restaurant = await db.get('SELECT * FROM restaurants WHERE id = ?', [req.user.restaurant_id]);
  const settings = await getOrCreateSettings(req.user.restaurant_id);

  const { customer_name, customer_tax_id, customer_email, document_type, manual_cufe } = req.body;

  const taxPercentage = restaurant.tax_rate || 0;
  const subtotal = order.items_total;
  const tax_amount = subtotal * (taxPercentage / 100);
  const total = subtotal + tax_amount + (order.delivery_fee || 0);

  // Asignación atómica y portable (SQLite/Postgres) del consecutivo, vía
  // UPDATE ... RETURNING, para no reutilizar/saltar números aunque haya
  // varias facturas emitiéndose al mismo tiempo.
  const allocation = await db.get(`
    UPDATE fiscal_settings SET next_invoice_number = next_invoice_number + 1
    WHERE restaurant_id = ?
    RETURNING (next_invoice_number - 1) as allocated_number, invoice_prefix
  `, [req.user.restaurant_id]);

  const number = allocation.allocated_number;
  const fullNumber = `${allocation.invoice_prefix}-${String(number).padStart(6, '0')}`;

  const issueResult = await issueDocument({
    settings,
    restaurant,
    order,
    customer: { name: customer_name, tax_id: customer_tax_id, email: customer_email },
    documentData: { number, taxPercentage, manual_cufe }
  });

  const id = uuidv4();
  await db.run(`
    INSERT INTO tax_documents (
      id, restaurant_id, order_id, document_type, number, full_number,
      customer_name, customer_tax_id, customer_email,
      subtotal, tax_amount, total, status, provider,
      provider_document_id, cufe, xml_content, error_message,
      created_by, issued_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, req.user.restaurant_id, order.id, document_type || 'factura', number, fullNumber,
    customer_name || null, customer_tax_id || null, customer_email || null,
    subtotal, tax_amount, total, issueResult.status, settings.provider,
    issueResult.provider_document_id, issueResult.cufe,
    issueResult.raw_response ? JSON.stringify(issueResult.raw_response) : null,
    issueResult.error_message,
    req.user.id, issueResult.status === 'emitida' ? db.nowIso() : null
  ]);

  const doc = await db.get('SELECT * FROM tax_documents WHERE id = ?', [id]);
  req.app.get('io').to(req.user.restaurant_id).emit('invoicing:document_created', doc);
  res.json(doc);
}));

// Anular un documento (no reversa la transmisión ante el proveedor si ya fue
// aceptada; para eso se requiere una nota crédito, fuera de este MVP).
router.post('/documents/:id/void', requireRole('admin'), ah(async (req, res) => {
  const doc = await db.get('SELECT * FROM tax_documents WHERE id = ? AND restaurant_id = ?',
    [req.params.id, req.user.restaurant_id]);
  if (!doc) return res.status(404).json({ error: 'No encontrado' });
  await db.run(`UPDATE tax_documents SET status = 'anulada' WHERE id = ?`, [doc.id]);
  res.json(await db.get('SELECT * FROM tax_documents WHERE id = ?', [doc.id]));
}));

module.exports = router;
