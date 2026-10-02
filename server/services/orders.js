// Lógica de pedidos compartida entre el flujo de mesas (routes/orders.js) y
// el de domicilios/apps de delivery (routes/delivery.js), para no duplicar
// el descuento automático de inventario según receta ni el cálculo de la cuenta.
const { v4: uuidv4 } = require('uuid');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Calcula la cuenta: subtotal, descuento/cortesía, impuesto, total, pagado y saldo.
// Si el restaurante maneja precios con impuesto incluido (lo usual en carta
// para consumidor final en LatAm), el impuesto se desglosa hacia adentro.
function computeTotals(order, items, payments, restaurant) {
  const active = items.filter(i => i.status !== 'anulado');
  const itemsTotal = active.reduce((s, i) => s + i.price_snapshot * i.quantity, 0);

  let discount = 0;
  if (order.discount_type === 'cortesia') discount = itemsTotal;
  else if (order.discount_type === 'porcentaje') discount = itemsTotal * Math.min(100, order.discount_value || 0) / 100;
  else if (order.discount_type === 'monto') discount = Math.min(itemsTotal, order.discount_value || 0);

  const afterDiscount = itemsTotal - discount;
  const rate = (restaurant && restaurant.tax_rate ? restaurant.tax_rate : 0) / 100;
  const includesTax = !!(restaurant && Number(restaurant.prices_include_tax));
  const net = includesTax ? afterDiscount / (1 + rate) : afterDiscount;
  const tax = includesTax ? afterDiscount - net : net * rate;
  const total = net + tax + (order.delivery_fee || 0);

  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const tips = payments.reduce((s, p) => s + (p.tip_amount || 0), 0);
  const theoreticalCost = active.reduce((s, i) => s + (i.cost_snapshot || 0) * i.quantity, 0);

  return {
    items_total: round2(itemsTotal),
    discount_amount: round2(discount),
    net_subtotal: round2(net),
    tax_amount: round2(tax),
    tax_rate: restaurant ? restaurant.tax_rate : 0,
    tax_name: restaurant ? restaurant.tax_name : 'IVA',
    prices_include_tax: includesTax,
    total: round2(total),
    paid_amount: round2(paid),
    tip_amount: round2(tips),
    balance: round2(total - paid),
    theoretical_cost: round2(theoreticalCost)
  };
}

async function getOrderFull(db, orderId, restaurantId) {
  const order = await db.get('SELECT * FROM orders WHERE id = ? AND restaurant_id = ?', [orderId, restaurantId]);
  if (!order) return null;
  const items = await db.all('SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at', [orderId]);
  const payments = await db.all('SELECT * FROM order_payments WHERE order_id = ? ORDER BY created_at', [orderId]);
  const restaurant = await db.get('SELECT tax_rate, tax_name, prices_include_tax, tip_suggested_pct FROM restaurants WHERE id = ?', [restaurantId]);
  const table = order.table_id ? await db.get('SELECT * FROM tables WHERE id = ?', [order.table_id]) : null;
  const merged = order.table_id
    ? await db.all('SELECT id, name FROM tables WHERE merged_into = ? ORDER BY name', [order.table_id]) : [];
  const waiter = order.waiter_id ? await db.get('SELECT name FROM users WHERE id = ?', [order.waiter_id]) : null;
  return {
    ...order,
    table_name: table ? table.name : null,
    table_zone: table ? table.zone : null,
    merged_tables: merged,
    waiter_name: waiter ? waiter.name : null,
    tip_suggested_pct: restaurant ? restaurant.tip_suggested_pct : 10,
    items,
    payments,
    ...computeTotals(order, items, payments, restaurant)
  };
}

// Crea un pedido (mesa, domicilio o recoger) dentro de una transacción abierta.
async function createOrder(t, {
  restaurantId, tableId = null, waiterId = null, channel = 'salon',
  deliveryPlatform = null, customerName = null, customerPhone = null,
  deliveryAddress = null, deliveryFee = 0, externalPlatformOrderId = null, guests = 1
}) {
  const id = uuidv4();
  await t.run(`
    INSERT INTO orders (
      id, restaurant_id, table_id, waiter_id, channel, delivery_platform,
      delivery_status, customer_name, customer_phone, delivery_address,
      delivery_fee, external_platform_order_id, guests, opened_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, restaurantId, tableId, waiterId, channel, deliveryPlatform,
    channel === 'salon' ? null : 'recibido', customerName, customerPhone, deliveryAddress,
    deliveryFee, externalPlatformOrderId, guests || 1, t.nowIso()
  ]);
  return id;
}

// Costo teórico de una porción según la receta y el costo actual de los insumos
async function recipeCost(t, recipeId) {
  if (!recipeId) return null;
  const row = await t.get(`
    SELECT COALESCE(SUM(ri.quantity * ii.unit_cost), 0) as total
    FROM recipe_ingredients ri JOIN inventory_items ii ON ii.id = ri.inventory_item_id
    WHERE ri.recipe_id = ?
  `, [recipeId]);
  return row ? row.total : 0;
}

// Mueve inventario según receta: deltaQty > 0 descuenta (venta), < 0 repone (anulación).
async function moveRecipeStock(t, { restaurantId, recipeId, deltaQty, orderItemId, userId, reasonPrefix }) {
  if (!recipeId || !deltaQty) return [];
  const ingredients = await t.all(
    'SELECT inventory_item_id, quantity FROM recipe_ingredients WHERE recipe_id = ?', [recipeId]);
  for (const ing of ingredients) {
    const qty = ing.quantity * Math.abs(deltaQty);
    const type = deltaQty > 0 ? 'salida' : 'entrada';
    await t.run(`
      INSERT INTO inventory_movements (id, restaurant_id, item_id, type, quantity, reason, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [uuidv4(), restaurantId, ing.inventory_item_id, type, qty,
        `${reasonPrefix || (deltaQty > 0 ? 'venta' : 'cancelacion')}:${orderItemId}`, userId || null]);
    await t.run('UPDATE inventory_items SET stock = stock - ?, updated_at = ? WHERE id = ?',
      [ing.quantity * deltaQty, t.nowIso(), ing.inventory_item_id]);
  }
  return ingredients;
}

// Agrega un ítem del menú a un pedido y descuenta inventario según su receta.
// Se ejecuta dentro de una transacción (t). No emite eventos de socket: eso
// lo hace el caller, que conoce el contexto de io/restaurantId.
async function insertOrderItem(t, { restaurantId, orderId, menuItem, quantity, userId, notes = null, seat = null }) {
  const orderItemId = uuidv4();
  const cost = await recipeCost(t, menuItem.recipe_id);
  await t.run(`
    INSERT INTO order_items (id, order_id, menu_item_id, name_snapshot, price_snapshot, quantity,
                             notes, seat, cost_snapshot, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [orderItemId, orderId, menuItem.id, menuItem.name, menuItem.price, quantity,
      notes || null, seat || null, cost, t.nowIso()]);

  const ingredients = await moveRecipeStock(t, {
    restaurantId, recipeId: menuItem.recipe_id, deltaQty: quantity, orderItemId, userId
  });
  return { orderItemId, ingredients };
}

// Agrega un ítem "externo" reportado por una app de domicilios, sin
// vincularlo a un menu_item propio (no hay descuento de inventario porque
// no hay receta asociada). Se usa desde el webhook de plataformas externas.
async function insertExternalOrderItem(t, { orderId, name, price, quantity }) {
  const orderItemId = uuidv4();
  await t.run(`
    INSERT INTO order_items (id, order_id, menu_item_id, name_snapshot, price_snapshot, quantity, created_at)
    VALUES (?, ?, NULL, ?, ?, ?, ?)
  `, [orderItemId, orderId, name, price, quantity, t.nowIso()]);
  return { orderItemId };
}

module.exports = {
  getOrderFull, createOrder, insertOrderItem, insertExternalOrderItem,
  moveRecipeStock, recipeCost, computeTotals, round2
};
