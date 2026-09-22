const express = require('express');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const ah = require('../utils/asyncHandler');
const { getOrderFull, createOrder, insertOrderItem, insertExternalOrderItem } = require('../services/orders');
const { webhookToken } = require('../services/delivery');
const { requireActiveSubscription } = require('../services/billing');

const router = express.Router();

const DELIVERY_STATUSES = ['recibido', 'preparando', 'en_camino', 'entregado', 'cancelado'];

// ============================================================
// Endpoints públicos (sin autenticación): pedido directo del cliente y
// webhook de apps de domicilios externas. Van antes de authMiddleware.
// ============================================================

// Menú público, para una página de pedido directo del restaurante
// (evita pagar comisión a apps de domicilios de terceros).
router.get('/public/:restaurantId/menu', ah(async (req, res) => {
  const restaurant = await db.get('SELECT id, name, currency_symbol FROM restaurants WHERE id = ?', [req.params.restaurantId]);
  if (!restaurant) return res.status(404).json({ error: 'Restaurante no encontrado' });
  const items = await db.all(`
    SELECT mi.id, mi.name, mi.description, mi.price, mi.available, mc.name as category_name
    FROM menu_items mi LEFT JOIN menu_categories mc ON mc.id = mi.category_id
    WHERE mi.restaurant_id = ? AND mi.available = 1
    ORDER BY mc.sort_order, mi.name
  `, [req.params.restaurantId]);
  res.json({ restaurant, items });
}));

// El cliente final crea su propio pedido de domicilio/recoger.
router.post('/public/:restaurantId/order', ah(async (req, res) => {
  const restaurant = await db.get('SELECT id FROM restaurants WHERE id = ?', [req.params.restaurantId]);
  if (!restaurant) return res.status(404).json({ error: 'Restaurante no encontrado' });

  const { channel, customer_name, customer_phone, delivery_address, items } = req.body;
  if (!['domicilio', 'recoger'].includes(channel)) return res.status(400).json({ error: 'Canal inválido' });
  if (!customer_name || !customer_phone) return res.status(400).json({ error: 'Nombre y teléfono son requeridos' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'El pedido no tiene ítems' });
  if (channel === 'domicilio' && !delivery_address) return res.status(400).json({ error: 'La dirección es requerida para domicilio' });

  let orderId;
  try {
    orderId = await db.tx(async (t) => {
      const id = await createOrder(t, {
        restaurantId: restaurant.id, channel, customerName: customer_name,
        customerPhone: customer_phone, deliveryAddress: delivery_address || null,
        deliveryPlatform: 'propio'
      });
      for (const reqItem of items) {
        const menuItem = await t.get('SELECT * FROM menu_items WHERE id = ? AND restaurant_id = ? AND available = 1',
          [reqItem.menu_item_id, restaurant.id]);
        if (!menuItem) throw Object.assign(new Error(`Ítem no disponible: ${reqItem.menu_item_id}`), { status: 400 });
        await insertOrderItem(t, {
          restaurantId: restaurant.id, orderId: id, menuItem, quantity: reqItem.quantity || 1, userId: null
        });
      }
      return id;
    });
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
    throw e;
  }

  const full = await getOrderFull(db, orderId, restaurant.id);
  req.app.get('io').to(restaurant.id).emit('delivery:new_order', full);
  res.json(full);
}));

// Webhook para recibir pedidos empujados por una app de domicilios
// (Rappi, Uber Eats, PedidosYa, Didi Food, etc.). Cada restaurante tiene su
// propia URL con un token único (ver GET /webhook-url, autenticado). El
// payload se normaliza a nuestro modelo interno de pedido/ítems; como los
// ítems vienen con nombre/precio de la plataforma (no un menu_item_id
// nuestro), no descuentan inventario automáticamente.
router.post('/webhook/:restaurantId/:token', ah(async (req, res) => {
  const restaurant = await db.get('SELECT id FROM restaurants WHERE id = ?', [req.params.restaurantId]);
  if (!restaurant || req.params.token !== webhookToken(restaurant.id)) {
    return res.status(404).json({ error: 'No encontrado' });
  }

  const { platform, customer_name, customer_phone, delivery_address, delivery_fee, platform_order_id, items } = req.body;
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'El pedido no tiene ítems' });

  const orderId = await db.tx(async (t) => {
    const id = await createOrder(t, {
      restaurantId: restaurant.id, channel: 'domicilio', deliveryPlatform: platform || 'otro',
      customerName: customer_name || null, customerPhone: customer_phone || null,
      deliveryAddress: delivery_address || null, deliveryFee: delivery_fee || 0,
      externalPlatformOrderId: platform_order_id || null
    });
    for (const item of items) {
      await insertExternalOrderItem(t, { orderId: id, name: item.name, price: item.price, quantity: item.quantity || 1 });
    }
    return id;
  });

  const full = await getOrderFull(db, orderId, restaurant.id);
  req.app.get('io').to(restaurant.id).emit('delivery:new_order', full);
  res.json({ ok: true, order_id: orderId });
}));

// ============================================================
// Endpoints autenticados (personal del restaurante)
// ============================================================
router.use(authMiddleware);
router.use(requireActiveSubscription);

router.get('/webhook-url', requireRole('admin'), (req, res) => {
  const token = webhookToken(req.user.restaurant_id);
  res.json({
    url: `/api/delivery/webhook/${req.user.restaurant_id}/${token}`,
    public_menu_url: `/pedido/${req.user.restaurant_id}`
  });
});

// Pedidos de domicilio/recoger activos (no cerrados aún)
router.get('/', requireRole('mesero', 'admin'), ah(async (req, res) => {
  const orders = await db.all(`
    SELECT * FROM orders
    WHERE restaurant_id = ? AND channel != 'salon' AND status = 'abierta'
    ORDER BY opened_at DESC
  `, [req.user.restaurant_id]);
  const withItems = await Promise.all(orders.map(o => getOrderFull(db, o.id, req.user.restaurant_id)));
  res.json(withItems);
}));

// Crear un pedido de domicilio/recoger manualmente (ej. pedido telefónico)
router.post('/', requireRole('mesero', 'admin'), ah(async (req, res) => {
  const { channel, customer_name, customer_phone, delivery_address, delivery_platform, delivery_fee } = req.body;
  if (!['domicilio', 'recoger'].includes(channel)) return res.status(400).json({ error: 'Canal inválido' });

  const orderId = await db.tx(async (t) => createOrder(t, {
    restaurantId: req.user.restaurant_id, waiterId: req.user.id, channel,
    customerName: customer_name || null, customerPhone: customer_phone || null,
    deliveryAddress: delivery_address || null, deliveryPlatform: delivery_platform || 'propio',
    deliveryFee: delivery_fee || 0
  }));

  const full = await getOrderFull(db, orderId, req.user.restaurant_id);
  res.json(full);
}));

// Cambiar el estado de entrega (recibido -> preparando -> en_camino -> entregado, o cancelado)
router.put('/:id/status', requireRole('mesero', 'admin'), ah(async (req, res) => {
  const { delivery_status } = req.body;
  if (!DELIVERY_STATUSES.includes(delivery_status)) return res.status(400).json({ error: 'Estado inválido' });

  const order = await db.get(`SELECT * FROM orders WHERE id = ? AND restaurant_id = ? AND channel != 'salon'`,
    [req.params.id, req.user.restaurant_id]);
  if (!order) return res.status(404).json({ error: 'No encontrado' });

  if (delivery_status === 'cancelado') {
    // Un pedido cancelado se cierra sin registrar ingreso (no fue una venta real)
    await db.run(`UPDATE orders SET delivery_status = ?, status = 'cerrada', closed_at = ? WHERE id = ?`,
      [delivery_status, db.nowIso(), order.id]);
  } else {
    await db.run('UPDATE orders SET delivery_status = ? WHERE id = ?', [delivery_status, order.id]);
  }

  const full = await getOrderFull(db, order.id, req.user.restaurant_id);
  req.app.get('io').to(req.user.restaurant_id).emit('delivery:status_changed', full);
  res.json(full);
}));

module.exports = router;
