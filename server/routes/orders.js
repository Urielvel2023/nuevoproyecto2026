const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const ah = require('../utils/asyncHandler');
const { getOrderFull, createOrder, insertOrderItem } = require('../services/orders');
const { recordSaleIncome } = require('../services/accounting');

const router = express.Router();
router.use(authMiddleware);

// ---- Mesas ----
router.get('/tables', ah(async (req, res) => {
  const tables = await db.all('SELECT * FROM tables WHERE restaurant_id = ? ORDER BY name',
    [req.user.restaurant_id]);
  // Adjuntar el pedido abierto (si existe) a cada mesa
  const withOrders = await Promise.all(tables.map(async (t) => {
    const order = await db.get(`SELECT * FROM orders WHERE table_id = ? AND status = 'abierta'`, [t.id]);
    return { ...t, open_order_id: order ? order.id : null };
  }));
  res.json(withOrders);
}));

router.post('/tables', requireRole('admin'), ah(async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' });
  const id = uuidv4();
  await db.run('INSERT INTO tables (id, restaurant_id, name) VALUES (?, ?, ?)', [id, req.user.restaurant_id, name]);
  const table = await db.get('SELECT * FROM tables WHERE id = ?', [id]);
  req.app.get('io').to(req.user.restaurant_id).emit('tables:changed', table);
  res.json(table);
}));

// ---- Pedidos ----

// Abrir mesa (crear pedido)
router.post('/', requireRole('mesero', 'admin'), ah(async (req, res) => {
  const { table_id } = req.body;
  const table = await db.get('SELECT * FROM tables WHERE id = ? AND restaurant_id = ?',
    [table_id, req.user.restaurant_id]);
  if (!table) return res.status(404).json({ error: 'Mesa no encontrada' });

  const existing = await db.get(`SELECT * FROM orders WHERE table_id = ? AND status = 'abierta'`, [table_id]);
  if (existing) return res.json(await getOrderFull(db, existing.id, req.user.restaurant_id));

  const id = await db.tx(async (t) => {
    const orderId = await createOrder(t, {
      restaurantId: req.user.restaurant_id, tableId: table_id, waiterId: req.user.id, channel: 'salon'
    });
    await t.run(`UPDATE tables SET status = 'ocupada' WHERE id = ?`, [table_id]);
    return orderId;
  });

  const full = await getOrderFull(db, id, req.user.restaurant_id);
  req.app.get('io').to(req.user.restaurant_id).emit('tables:changed', { ...table, status: 'ocupada', open_order_id: id });
  res.json(full);
}));

// Últimas cuentas cerradas, indicando si ya tienen documento fiscal emitido
// (usado por la pantalla de Facturación para elegir qué cuenta facturar)
router.get('/recent-closed', requireRole('admin'), ah(async (req, res) => {
  const rows = await db.all(`
    SELECT o.id, o.table_id, o.channel, o.customer_name, o.closed_at,
           t.name as table_name,
           COALESCE(SUM(oi.price_snapshot * oi.quantity), 0) + o.delivery_fee as total,
           (SELECT full_number FROM tax_documents td WHERE td.order_id = o.id AND td.status != 'rechazada' LIMIT 1) as invoice_number
    FROM orders o
    LEFT JOIN tables t ON t.id = o.table_id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.restaurant_id = ? AND o.status = 'cerrada'
    GROUP BY o.id, o.table_id, o.channel, o.customer_name, o.closed_at, t.name, o.delivery_fee
    ORDER BY o.closed_at DESC LIMIT 50
  `, [req.user.restaurant_id]);
  res.json(rows);
}));

router.get('/:id', ah(async (req, res) => {
  const order = await getOrderFull(db, req.params.id, req.user.restaurant_id);
  if (!order) return res.status(404).json({ error: 'No encontrado' });
  res.json(order);
}));

// Agregar ítem del menú al pedido -> descuenta inventario automáticamente y emite comanda a cocina
router.post('/:id/items', requireRole('mesero', 'admin'), ah(async (req, res) => {
  const { menu_item_id, quantity } = req.body;
  const qty = quantity || 1;

  const order = await db.get(`SELECT * FROM orders WHERE id = ? AND restaurant_id = ? AND status = 'abierta'`,
    [req.params.id, req.user.restaurant_id]);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado o ya cerrado' });

  const menuItem = await db.get('SELECT * FROM menu_items WHERE id = ? AND restaurant_id = ?',
    [menu_item_id, req.user.restaurant_id]);
  if (!menuItem) return res.status(404).json({ error: 'Plato/bebida no encontrado' });
  if (!menuItem.available) return res.status(400).json({ error: 'Este ítem no está disponible actualmente' });

  const io = req.app.get('io');
  const restaurantId = req.user.restaurant_id;

  const { orderItemId } = await db.tx(async (t) => insertOrderItem(t, {
    restaurantId, orderId: order.id, menuItem, quantity: qty, userId: req.user.id
  }));

  const full = await getOrderFull(db, order.id, restaurantId);

  // Sync en tiempo real: la mesa/cuenta se actualiza para el mesero/caja
  io.to(restaurantId).emit('order:changed', full);
  // Comanda en tiempo real para cocina/barra
  const orderItem = await db.get('SELECT * FROM order_items WHERE id = ?', [orderItemId]);
  const recipe = menuItem.recipe_id ? await db.get('SELECT type FROM recipes WHERE id = ?', [menuItem.recipe_id]) : null;
  io.to(restaurantId).emit('kitchen:new_item', {
    ...orderItem,
    table_name: full.table_name,
    order_id: order.id,
    recipe_type: recipe ? recipe.type : 'cocina'
  });

  // Alertar si algún insumo quedó en mínimo tras el descuento
  if (menuItem.recipe_id) {
    const ingredients = await db.all('SELECT inventory_item_id FROM recipe_ingredients WHERE recipe_id = ?',
      [menuItem.recipe_id]);
    for (const ing of ingredients) {
      const item = await db.get('SELECT * FROM inventory_items WHERE id = ?', [ing.inventory_item_id]);
      if (item && item.stock <= item.min_stock) {
        io.to(restaurantId).emit('inventory:low_stock', item);
      }
      io.to(restaurantId).emit('inventory:changed', item);
    }
  }

  res.json(full);
}));

// Cambiar estado de un ítem en cocina (pendiente -> listo -> entregado)
router.put('/items/:orderItemId/kitchen-status', requireRole('cocina', 'admin', 'mesero'), ah(async (req, res) => {
  const { kitchen_status } = req.body;
  if (!['pendiente', 'listo', 'entregado'].includes(kitchen_status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  await db.run('UPDATE order_items SET kitchen_status = ? WHERE id = ?', [kitchen_status, req.params.orderItemId]);
  const item = await db.get('SELECT * FROM order_items WHERE id = ?', [req.params.orderItemId]);
  req.app.get('io').to(req.user.restaurant_id).emit('kitchen:item_updated', item);
  res.json(item);
}));

// Quitar un ítem del pedido (antes de cerrar cuenta) — repone inventario
router.delete('/items/:orderItemId', requireRole('mesero', 'admin'), ah(async (req, res) => {
  const item = await db.get('SELECT * FROM order_items WHERE id = ?', [req.params.orderItemId]);
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  const order = await db.get('SELECT * FROM orders WHERE id = ?', [item.order_id]);
  const menuItem = await db.get('SELECT * FROM menu_items WHERE id = ?', [item.menu_item_id]);

  await db.tx(async (t) => {
    await t.run('DELETE FROM order_items WHERE id = ?', [item.id]);
    if (menuItem && menuItem.recipe_id) {
      const ingredients = await t.all('SELECT inventory_item_id, quantity FROM recipe_ingredients WHERE recipe_id = ?',
        [menuItem.recipe_id]);
      for (const ing of ingredients) {
        const restoredQty = ing.quantity * item.quantity;
        await t.run('UPDATE inventory_items SET stock = stock + ?, updated_at = ? WHERE id = ?',
          [restoredQty, t.nowIso(), ing.inventory_item_id]);
        await t.run(`
          INSERT INTO inventory_movements (id, restaurant_id, item_id, type, quantity, reason, created_by)
          VALUES (?, ?, ?, 'entrada', ?, ?, ?)
        `, [uuidv4(), order.restaurant_id, ing.inventory_item_id, restoredQty, `cancelacion:${item.id}`, req.user.id]);
      }
    }
  });

  const full = await getOrderFull(db, order.id, req.user.restaurant_id);
  req.app.get('io').to(req.user.restaurant_id).emit('order:changed', full);
  res.json(full);
}));

// Cerrar cuenta (cobrar mesa/domicilio) — no genera factura fiscal por sí sola,
// solo cierra el pedido interno. Para emitir la factura electrónica, ver
// POST /api/invoicing/orders/:orderId (routes/invoicing.js). El cierre también
// registra automáticamente el ingreso en contabilidad (routes/accounting.js).
router.post('/:id/close', requireRole('mesero', 'admin'), ah(async (req, res) => {
  const order = await db.get(`SELECT * FROM orders WHERE id = ? AND restaurant_id = ? AND status = 'abierta'`,
    [req.params.id, req.user.restaurant_id]);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado o ya cerrado' });

  await db.tx(async (t) => {
    await t.run(`UPDATE orders SET status = 'cerrada', closed_at = ? WHERE id = ?`, [t.nowIso(), order.id]);
    if (order.table_id) {
      await t.run(`UPDATE tables SET status = 'libre' WHERE id = ?`, [order.table_id]);
    }
  });

  const full = await getOrderFull(db, order.id, req.user.restaurant_id);

  try {
    await recordSaleIncome(db, full);
  } catch (e) {
    console.error('No se pudo registrar el ingreso contable automático:', e.message);
  }

  if (order.table_id) {
    const table = await db.get('SELECT * FROM tables WHERE id = ?', [order.table_id]);
    req.app.get('io').to(req.user.restaurant_id).emit('tables:changed', { ...table, open_order_id: null });
  }
  req.app.get('io').to(req.user.restaurant_id).emit('order:closed', full);
  res.json(full);
}));

module.exports = router;
