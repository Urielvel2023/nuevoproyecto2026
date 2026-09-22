const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');

const router = express.Router();
router.use(authMiddleware);

// ---- Mesas ----
router.get('/tables', (req, res) => {
  const tables = db.prepare('SELECT * FROM tables WHERE restaurant_id = ? ORDER BY name')
    .all(req.user.restaurant_id);
  // Adjuntar el pedido abierto (si existe) a cada mesa
  const withOrders = tables.map(t => {
    const order = db.prepare(`SELECT * FROM orders WHERE table_id = ? AND status = 'abierta'`).get(t.id);
    return { ...t, open_order_id: order ? order.id : null };
  });
  res.json(withOrders);
});

router.post('/tables', requireRole('admin'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' });
  const id = uuidv4();
  db.prepare('INSERT INTO tables (id, restaurant_id, name) VALUES (?, ?, ?)')
    .run(id, req.user.restaurant_id, name);
  const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(id);
  req.app.get('io').to(req.user.restaurant_id).emit('tables:changed', table);
  res.json(table);
});

// ---- Pedidos ----
function getOrderFull(orderId, restaurantId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND restaurant_id = ?').get(orderId, restaurantId);
  if (!order) return null;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at').all(orderId);
  const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(order.table_id);
  const waiter = db.prepare('SELECT name FROM users WHERE id = ?').get(order.waiter_id);
  const total = items.reduce((sum, i) => sum + i.price_snapshot * i.quantity, 0);
  return { ...order, table_name: table ? table.name : null, waiter_name: waiter ? waiter.name : null, items, total };
}

// Abrir mesa (crear pedido)
router.post('/', requireRole('mesero', 'admin'), (req, res) => {
  const { table_id } = req.body;
  const table = db.prepare('SELECT * FROM tables WHERE id = ? AND restaurant_id = ?')
    .get(table_id, req.user.restaurant_id);
  if (!table) return res.status(404).json({ error: 'Mesa no encontrada' });

  const existing = db.prepare(`SELECT * FROM orders WHERE table_id = ? AND status = 'abierta'`).get(table_id);
  if (existing) return res.json(getOrderFull(existing.id, req.user.restaurant_id));

  const id = uuidv4();
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO orders (id, restaurant_id, table_id, waiter_id) VALUES (?, ?, ?, ?)')
      .run(id, req.user.restaurant_id, table_id, req.user.id);
    db.prepare(`UPDATE tables SET status = 'ocupada' WHERE id = ?`).run(table_id);
  });
  tx();

  const full = getOrderFull(id, req.user.restaurant_id);
  req.app.get('io').to(req.user.restaurant_id).emit('tables:changed', { ...table, status: 'ocupada', open_order_id: id });
  res.json(full);
});

router.get('/:id', (req, res) => {
  const order = getOrderFull(req.params.id, req.user.restaurant_id);
  if (!order) return res.status(404).json({ error: 'No encontrado' });
  res.json(order);
});

// Agregar ítem del menú al pedido -> descuenta inventario automáticamente y emite comanda a cocina
router.post('/:id/items', requireRole('mesero', 'admin'), (req, res) => {
  const { menu_item_id, quantity } = req.body;
  const qty = quantity || 1;

  const order = db.prepare(`SELECT * FROM orders WHERE id = ? AND restaurant_id = ? AND status = 'abierta'`)
    .get(req.params.id, req.user.restaurant_id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado o ya cerrado' });

  const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ? AND restaurant_id = ?')
    .get(menu_item_id, req.user.restaurant_id);
  if (!menuItem) return res.status(404).json({ error: 'Plato/bebida no encontrado' });
  if (!menuItem.available) return res.status(400).json({ error: 'Este ítem no está disponible actualmente' });

  const orderItemId = uuidv4();
  const io = req.app.get('io');
  const restaurantId = req.user.restaurant_id;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO order_items (id, order_id, menu_item_id, name_snapshot, price_snapshot, quantity)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(orderItemId, order.id, menuItem.id, menuItem.name, menuItem.price, qty);

    // Descuento automático de inventario según la receta del ítem vendido
    if (menuItem.recipe_id) {
      const ingredients = db.prepare(`
        SELECT inventory_item_id, quantity FROM recipe_ingredients WHERE recipe_id = ?
      `).all(menuItem.recipe_id);

      ingredients.forEach(ing => {
        const usedQty = ing.quantity * qty;
        db.prepare(`
          INSERT INTO inventory_movements (id, restaurant_id, item_id, type, quantity, reason, created_by)
          VALUES (?, ?, ?, 'salida', ?, ?, ?)
        `).run(uuidv4(), restaurantId, ing.inventory_item_id, usedQty, `venta:${orderItemId}`, req.user.id);

        db.prepare(`UPDATE inventory_items SET stock = stock - ?, updated_at = datetime('now') WHERE id = ?`)
          .run(usedQty, ing.inventory_item_id);
      });
    }
  });
  tx();

  const full = getOrderFull(order.id, restaurantId);

  // Sync en tiempo real: la mesa/cuenta se actualiza para el mesero/caja
  io.to(restaurantId).emit('order:changed', full);
  // Comanda en tiempo real para cocina/barra
  const orderItem = db.prepare('SELECT * FROM order_items WHERE id = ?').get(orderItemId);
  io.to(restaurantId).emit('kitchen:new_item', {
    ...orderItem,
    table_name: full.table_name,
    order_id: order.id,
    recipe_type: menuItem.recipe_id
      ? db.prepare('SELECT type FROM recipes WHERE id = ?').get(menuItem.recipe_id)?.type
      : 'cocina'
  });

  // Alertar si algún insumo quedó en mínimo tras el descuento
  if (menuItem.recipe_id) {
    const ingredients = db.prepare(`SELECT inventory_item_id FROM recipe_ingredients WHERE recipe_id = ?`)
      .all(menuItem.recipe_id);
    ingredients.forEach(ing => {
      const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(ing.inventory_item_id);
      if (item && item.stock <= item.min_stock) {
        io.to(restaurantId).emit('inventory:low_stock', item);
      }
      io.to(restaurantId).emit('inventory:changed', item);
    });
  }

  res.json(full);
});

// Cambiar estado de un ítem en cocina (pendiente -> listo -> entregado)
router.put('/items/:orderItemId/kitchen-status', requireRole('cocina', 'admin', 'mesero'), (req, res) => {
  const { kitchen_status } = req.body;
  if (!['pendiente', 'listo', 'entregado'].includes(kitchen_status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  db.prepare('UPDATE order_items SET kitchen_status = ? WHERE id = ?').run(kitchen_status, req.params.orderItemId);
  const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(req.params.orderItemId);
  req.app.get('io').to(req.user.restaurant_id).emit('kitchen:item_updated', item);
  res.json(item);
});

// Quitar un ítem del pedido (antes de cerrar cuenta) — repone inventario
router.delete('/items/:orderItemId', requireRole('mesero', 'admin'), (req, res) => {
  const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(req.params.orderItemId);
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(item.order_id);

  const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(item.menu_item_id);

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM order_items WHERE id = ?').run(item.id);
    if (menuItem && menuItem.recipe_id) {
      const ingredients = db.prepare('SELECT inventory_item_id, quantity FROM recipe_ingredients WHERE recipe_id = ?')
        .all(menuItem.recipe_id);
      ingredients.forEach(ing => {
        const restoredQty = ing.quantity * item.quantity;
        db.prepare(`UPDATE inventory_items SET stock = stock + ?, updated_at = datetime('now') WHERE id = ?`)
          .run(restoredQty, ing.inventory_item_id);
        db.prepare(`
          INSERT INTO inventory_movements (id, restaurant_id, item_id, type, quantity, reason, created_by)
          VALUES (?, ?, ?, 'entrada', ?, ?, ?)
        `).run(uuidv4(), order.restaurant_id, ing.inventory_item_id, restoredQty, `cancelacion:${item.id}`, req.user.id);
      });
    }
  });
  tx();

  const full = getOrderFull(order.id, req.user.restaurant_id);
  req.app.get('io').to(req.user.restaurant_id).emit('order:changed', full);
  res.json(full);
});

// Cerrar cuenta (cobrar mesa) — no genera factura fiscal, solo cierra el pedido interno
router.post('/:id/close', requireRole('mesero', 'admin'), (req, res) => {
  const order = db.prepare(`SELECT * FROM orders WHERE id = ? AND restaurant_id = ? AND status = 'abierta'`)
    .get(req.params.id, req.user.restaurant_id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado o ya cerrado' });

  const tx = db.transaction(() => {
    db.prepare(`UPDATE orders SET status = 'cerrada', closed_at = datetime('now') WHERE id = ?`).run(order.id);
    db.prepare(`UPDATE tables SET status = 'libre' WHERE id = ?`).run(order.table_id);
  });
  tx();

  const full = getOrderFull(order.id, req.user.restaurant_id);
  const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(order.table_id);
  req.app.get('io').to(req.user.restaurant_id).emit('tables:changed', { ...table, open_order_id: null });
  req.app.get('io').to(req.user.restaurant_id).emit('order:closed', full);
  res.json(full);
});

module.exports = router;
