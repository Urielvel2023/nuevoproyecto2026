// Lógica de pedidos compartida entre el flujo de mesas (routes/orders.js) y
// el de domicilios/apps de delivery (routes/delivery.js), para no duplicar
// el descuento automático de inventario según receta.
const { v4: uuidv4 } = require('uuid');

async function getOrderFull(db, orderId, restaurantId) {
  const order = await db.get('SELECT * FROM orders WHERE id = ? AND restaurant_id = ?', [orderId, restaurantId]);
  if (!order) return null;
  const items = await db.all('SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at', [orderId]);
  const table = order.table_id ? await db.get('SELECT * FROM tables WHERE id = ?', [order.table_id]) : null;
  const waiter = order.waiter_id ? await db.get('SELECT name FROM users WHERE id = ?', [order.waiter_id]) : null;
  const itemsTotal = items.reduce((sum, i) => sum + i.price_snapshot * i.quantity, 0);
  return {
    ...order,
    table_name: table ? table.name : null,
    waiter_name: waiter ? waiter.name : null,
    items,
    items_total: itemsTotal,
    total: itemsTotal + (order.delivery_fee || 0)
  };
}

// Crea un pedido (mesa, domicilio o recoger) dentro de una transacción abierta.
async function createOrder(t, {
  restaurantId, tableId = null, waiterId = null, channel = 'salon',
  deliveryPlatform = null, customerName = null, customerPhone = null,
  deliveryAddress = null, deliveryFee = 0, externalPlatformOrderId = null
}) {
  const id = uuidv4();
  await t.run(`
    INSERT INTO orders (
      id, restaurant_id, table_id, waiter_id, channel, delivery_platform,
      delivery_status, customer_name, customer_phone, delivery_address,
      delivery_fee, external_platform_order_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, restaurantId, tableId, waiterId, channel, deliveryPlatform,
    channel === 'salon' ? null : 'recibido', customerName, customerPhone, deliveryAddress,
    deliveryFee, externalPlatformOrderId
  ]);
  return id;
}

// Agrega un ítem del menú a un pedido y descuenta inventario según su receta.
// Se ejecuta dentro de una transacción (t). No emite eventos de socket: eso
// lo hace el caller, que conoce el contexto de io/restaurantId.
async function insertOrderItem(t, { restaurantId, orderId, menuItem, quantity, userId }) {
  const orderItemId = uuidv4();
  await t.run(`
    INSERT INTO order_items (id, order_id, menu_item_id, name_snapshot, price_snapshot, quantity)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [orderItemId, orderId, menuItem.id, menuItem.name, menuItem.price, quantity]);

  let ingredients = [];
  if (menuItem.recipe_id) {
    ingredients = await t.all(
      'SELECT inventory_item_id, quantity FROM recipe_ingredients WHERE recipe_id = ?',
      [menuItem.recipe_id]
    );
    for (const ing of ingredients) {
      const usedQty = ing.quantity * quantity;
      await t.run(`
        INSERT INTO inventory_movements (id, restaurant_id, item_id, type, quantity, reason, created_by)
        VALUES (?, ?, ?, 'salida', ?, ?, ?)
      `, [uuidv4(), restaurantId, ing.inventory_item_id, usedQty, `venta:${orderItemId}`, userId || null]);

      await t.run('UPDATE inventory_items SET stock = stock - ?, updated_at = ? WHERE id = ?',
        [usedQty, t.nowIso(), ing.inventory_item_id]);
    }
  }
  return { orderItemId, ingredients };
}

module.exports = { getOrderFull, createOrder, insertOrderItem };
