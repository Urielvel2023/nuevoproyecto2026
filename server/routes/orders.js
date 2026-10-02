const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware, requireRole, requirePermission } = require('../auth');
const { can } = require('../permissions');
const { requireActiveSubscription } = require('../services/billing');
const ah = require('../utils/asyncHandler');
const { getOrderFull, createOrder, insertOrderItem, moveRecipeStock, round2 } = require('../services/orders');
const { recordSaleIncome } = require('../services/accounting');
const { audit, requireAuthorization } = require('../services/audit');
const { ZONES, TABLE_STATUSES, ensureZoneTables } = require('../services/tables');

const router = express.Router();
router.use(authMiddleware);
router.use(requireActiveSubscription);

// Minutos en los que el mesero puede corregir/anular un ítem que la cocina
// aún no ha empezado, sin pedir clave de supervisor.
const FREE_VOID_MINUTES = 3;
const PAYMENT_METHODS = ['efectivo', 'tarjeta_debito', 'tarjeta_credito', 'transferencia', 'pago_movil', 'divisas', 'otro'];

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function parseTs(s) {
  if (!s) return null;
  return s.includes('T') ? new Date(s) : new Date(s.replace(' ', 'T') + 'Z');
}

function emitOrder(req, full) {
  req.app.get('io').to(req.user.restaurant_id).emit('order:changed', full);
}
function emitTables(req) {
  req.app.get('io').to(req.user.restaurant_id).emit('tables:changed', {});
}

// Carga un pedido abierto verificando tenant y, para meseros, que sea suyo
// (un mesero solo trabaja sus mesas asignadas).
async function loadOwnOpenOrder(req, orderId) {
  const order = await db.get(`SELECT * FROM orders WHERE id = ? AND restaurant_id = ? AND status = 'abierta'`,
    [orderId, req.user.restaurant_id]);
  if (!order) throw httpError(404, 'Pedido no encontrado o ya cerrado');
  assertOwner(req, order);
  return order;
}

function assertOwner(req, order) {
  if (req.user.role === 'mesero' && order.channel === 'salon' && order.waiter_id && order.waiter_id !== req.user.id) {
    throw httpError(403, 'Esta mesa está asignada a otro mesero');
  }
}

// ======================================================================
// Mesas y zonas
// ======================================================================

router.get('/zones', (req, res) => {
  res.json(Object.entries(ZONES).map(([key, z]) => ({ key, label: z.label, min: z.minCount })));
});

router.get('/tables', ah(async (req, res) => {
  const tables = await db.all(`
    SELECT t.*, u.name as assigned_waiter_name
    FROM tables t LEFT JOIN users u ON u.id = t.assigned_waiter_id
    WHERE t.restaurant_id = ? AND t.active = 1
    ORDER BY t.zone, t.number, t.name
  `, [req.user.restaurant_id]);
  const openOrders = await db.all(`
    SELECT o.id, o.table_id, o.waiter_id, o.guests, o.opened_at, u.name as waiter_name,
           COALESCE(SUM(CASE WHEN oi.status = 'activo' THEN oi.price_snapshot * oi.quantity ELSE 0 END), 0) as items_total
    FROM orders o
    LEFT JOIN users u ON u.id = o.waiter_id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.restaurant_id = ? AND o.status = 'abierta' AND o.table_id IS NOT NULL
    GROUP BY o.id, o.table_id, o.waiter_id, o.guests, o.opened_at, u.name
  `, [req.user.restaurant_id]);
  const byTable = Object.fromEntries(openOrders.map(o => [o.table_id, o]));
  res.json(tables.map(t => {
    const o = byTable[t.id];
    return {
      ...t,
      open_order_id: o ? o.id : null,
      order_waiter_id: o ? o.waiter_id : null,
      order_waiter_name: o ? o.waiter_name : null,
      guests: o ? o.guests : null,
      items_total: o ? Number(o.items_total) : 0,
      opened_at: o ? o.opened_at : null,
      mine: o ? o.waiter_id === req.user.id : t.assigned_waiter_id === req.user.id
    };
  }));
}));

// Configurar zonas: garantiza mínimo 30 mesas en salón + N en terraza, barra, VIP...
router.post('/tables/setup', requirePermission('mesas', 'crear'), ah(async (req, res) => {
  const counts = req.body || {};
  const created = await db.tx(t => ensureZoneTables(t, req.user.restaurant_id, counts));
  await audit(db, req, { action: 'mesas_configuradas', entity: 'tables', after: { counts, created: created.length } });
  emitTables(req);
  res.json({ created: created.length });
}));

router.post('/tables', requirePermission('mesas', 'crear'), ah(async (req, res) => {
  const { name, zone = 'salon', capacity = 4 } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' });
  if (!ZONES[zone]) return res.status(400).json({ error: 'Zona inválida' });
  const id = uuidv4();
  const row = await db.get('SELECT MAX(number) as maxn FROM tables WHERE restaurant_id = ? AND zone = ?',
    [req.user.restaurant_id, zone]);
  await db.run('INSERT INTO tables (id, restaurant_id, name, zone, number, capacity) VALUES (?, ?, ?, ?, ?, ?)',
    [id, req.user.restaurant_id, name, zone, Number(row.maxn || 0) + 1, capacity]);
  emitTables(req);
  res.json(await db.get('SELECT * FROM tables WHERE id = ?', [id]));
}));

// Cambiar estado (libre, por_limpiar, reservada, bloqueada), capacidad o mesero asignado
router.put('/tables/:id', requirePermission('mesas', 'editar'), ah(async (req, res) => {
  const table = await db.get('SELECT * FROM tables WHERE id = ? AND restaurant_id = ?', [req.params.id, req.user.restaurant_id]);
  if (!table) return res.status(404).json({ error: 'Mesa no encontrada' });
  const { status, capacity, assigned_waiter_id, name } = req.body;
  const supervisor = can(req.user.role, 'mesas', 'aprobar');

  if (status) {
    if (!['libre', 'por_limpiar', 'reservada', 'bloqueada'].includes(status)) {
      return res.status(400).json({ error: 'Estado inválido (ocupada/unida se asignan al abrir o unir mesas)' });
    }
    if (['ocupada', 'unida'].includes(table.status)) {
      return res.status(400).json({ error: 'La mesa tiene una cuenta abierta o está unida; ciérrala o sepárala primero' });
    }
    if ((status === 'bloqueada' || table.status === 'bloqueada') && !supervisor) {
      return res.status(403).json({ error: 'Solo gerencia puede bloquear o desbloquear mesas' });
    }
  }
  if ((assigned_waiter_id !== undefined || capacity || name) && !supervisor) {
    return res.status(403).json({ error: 'Solo gerencia puede reasignar mesero o cambiar la configuración de la mesa' });
  }

  await db.run(`
    UPDATE tables SET status = COALESCE(?, status), capacity = COALESCE(?, capacity), name = COALESCE(?, name),
      assigned_waiter_id = CASE WHEN ? = 1 THEN ? ELSE assigned_waiter_id END
    WHERE id = ?
  `, [status || null, capacity || null, name || null,
      assigned_waiter_id !== undefined ? 1 : 0, assigned_waiter_id || null, table.id]);
  const after = await db.get('SELECT * FROM tables WHERE id = ?', [table.id]);
  await audit(db, req, { action: 'mesa_modificada', entity: 'tables', entityId: table.id,
    before: { status: table.status, assigned_waiter_id: table.assigned_waiter_id },
    after: { status: after.status, assigned_waiter_id: after.assigned_waiter_id } });
  emitTables(req);
  res.json(after);
}));

// ======================================================================
// Pedidos (cuenta por mesa)
// ======================================================================

// Abrir mesa (crear pedido)
router.post('/', requirePermission('pedidos', 'crear'), ah(async (req, res) => {
  const { table_id, guests } = req.body;
  const table = await db.get('SELECT * FROM tables WHERE id = ? AND restaurant_id = ?',
    [table_id, req.user.restaurant_id]);
  if (!table) return res.status(404).json({ error: 'Mesa no encontrada' });

  const existing = await db.get(`SELECT * FROM orders WHERE table_id = ? AND status = 'abierta'`, [table_id]);
  if (existing) {
    assertOwner(req, existing);
    return res.json(await getOrderFull(db, existing.id, req.user.restaurant_id));
  }
  if (!['libre', 'reservada'].includes(table.status)) {
    return res.status(400).json({ error: `La mesa está ${table.status.replace('_', ' ')}` });
  }
  if (req.user.role === 'mesero' && table.assigned_waiter_id && table.assigned_waiter_id !== req.user.id) {
    return res.status(403).json({ error: 'Esta mesa está asignada a otro mesero' });
  }

  const id = await db.tx(async (t) => {
    const orderId = await createOrder(t, {
      restaurantId: req.user.restaurant_id, tableId: table_id, waiterId: req.user.id, channel: 'salon', guests
    });
    await t.run(`UPDATE tables SET status = 'ocupada', occupied_since = ? WHERE id = ?`, [t.nowIso(), table_id]);
    return orderId;
  });

  const full = await getOrderFull(db, id, req.user.restaurant_id);
  await audit(db, req, { action: 'mesa_abierta', entity: 'orders', entityId: id, after: { table: table.name, guests } });
  emitTables(req);
  res.json(full);
}));

// Pantalla de cocina / barra (KDS): ítems pendientes por estación
router.get('/kds', requirePermission('kds', 'ver'), ah(async (req, res) => {
  const station = req.query.station; // cocina | bar | (todas)
  const rows = await db.all(`
    SELECT oi.*, o.channel, o.customer_name, t.name as table_name, t.zone,
           COALESCE(r.type, 'cocina') as station
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN tables t ON t.id = o.table_id
    LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
    LEFT JOIN recipes r ON r.id = mi.recipe_id
    WHERE o.restaurant_id = ? AND o.status = 'abierta' AND oi.status = 'activo'
      AND oi.kitchen_status != 'entregado'
    ORDER BY oi.created_at
  `, [req.user.restaurant_id]);
  res.json(station ? rows.filter(r => r.station === station) : rows);
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
    LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.status = 'activo'
    WHERE o.restaurant_id = ? AND o.status = 'cerrada'
    GROUP BY o.id, o.table_id, o.channel, o.customer_name, o.closed_at, t.name, o.delivery_fee
    ORDER BY o.closed_at DESC LIMIT 50
  `, [req.user.restaurant_id]);
  res.json(rows);
}));

router.get('/:id', ah(async (req, res) => {
  const order = await getOrderFull(db, req.params.id, req.user.restaurant_id);
  if (!order) return res.status(404).json({ error: 'No encontrado' });
  assertOwner(req, order);
  res.json(order);
}));

// Cambiar número de comensales
router.put('/:id', requirePermission('pedidos', 'editar'), ah(async (req, res) => {
  const order = await loadOwnOpenOrder(req, req.params.id);
  const guests = parseInt(req.body.guests, 10);
  if (!(guests > 0)) return res.status(400).json({ error: 'Número de comensales inválido' });
  await db.run('UPDATE orders SET guests = ? WHERE id = ?', [guests, order.id]);
  const full = await getOrderFull(db, order.id, req.user.restaurant_id);
  emitOrder(req, full);
  emitTables(req);
  res.json(full);
}));

// Incluir ítem del menú en la cuenta -> descuenta inventario y envía comanda a cocina/bar
router.post('/:id/items', requirePermission('pedidos', 'crear'), ah(async (req, res) => {
  const { menu_item_id, quantity, notes, seat } = req.body;
  const qty = parseInt(quantity, 10) || 1;
  if (qty < 1 || qty > 99) return res.status(400).json({ error: 'Cantidad inválida' });

  const order = await loadOwnOpenOrder(req, req.params.id);
  const menuItem = await db.get('SELECT * FROM menu_items WHERE id = ? AND restaurant_id = ?',
    [menu_item_id, req.user.restaurant_id]);
  if (!menuItem) return res.status(404).json({ error: 'Plato/bebida no encontrado' });
  if (!menuItem.available) return res.status(400).json({ error: 'Este ítem no está disponible actualmente' });

  const io = req.app.get('io');
  const restaurantId = req.user.restaurant_id;

  const { orderItemId, ingredients } = await db.tx(async (t) => insertOrderItem(t, {
    restaurantId, orderId: order.id, menuItem, quantity: qty, userId: req.user.id,
    notes: notes ? String(notes).slice(0, 200) : null, seat: parseInt(seat, 10) || null
  }));

  const full = await getOrderFull(db, order.id, restaurantId);
  emitOrder(req, full);
  const orderItem = await db.get('SELECT * FROM order_items WHERE id = ?', [orderItemId]);
  const recipe = menuItem.recipe_id ? await db.get('SELECT type FROM recipes WHERE id = ?', [menuItem.recipe_id]) : null;
  io.to(restaurantId).emit('kitchen:new_item', {
    ...orderItem, table_name: full.table_name, order_id: order.id, station: recipe ? recipe.type : 'cocina'
  });

  // Alertar si algún insumo quedó en mínimo tras el descuento
  for (const ing of ingredients) {
    const item = await db.get('SELECT * FROM inventory_items WHERE id = ?', [ing.inventory_item_id]);
    if (item && item.stock <= item.min_stock) io.to(restaurantId).emit('inventory:low_stock', item);
    io.to(restaurantId).emit('inventory:changed', item);
  }

  res.json(full);
}));

// ¿Requiere clave de supervisor reducir/anular este ítem?
function voidNeedsAuthorization(item) {
  if (item.kitchen_status !== 'pendiente') return true;
  const created = parseTs(item.created_at);
  return !created || (Date.now() - created.getTime()) > FREE_VOID_MINUTES * 60000;
}

async function loadItemForEdit(req) {
  const item = await db.get('SELECT * FROM order_items WHERE id = ?', [req.params.orderItemId]);
  if (!item || item.status !== 'activo') throw httpError(404, 'Ítem no encontrado o ya anulado');
  const order = await loadOwnOpenOrder(req, item.order_id);
  return { item, order };
}

// Modificar ítem: cantidad, notas/modificadores, comensal
router.put('/items/:orderItemId', requirePermission('pedidos', 'editar'), ah(async (req, res) => {
  const { item, order } = await loadItemForEdit(req);
  const { quantity, notes, seat, pin } = req.body;
  const newQty = quantity != null ? parseInt(quantity, 10) : item.quantity;
  if (!(newQty >= 1 && newQty <= 99)) return res.status(400).json({ error: 'Cantidad inválida (para quitar el ítem usa Anular)' });

  let approver = null;
  if (newQty < item.quantity && voidNeedsAuthorization(item)) {
    approver = await requireAuthorization(db, req, pin);
  }
  const menuItem = item.menu_item_id ? await db.get('SELECT * FROM menu_items WHERE id = ?', [item.menu_item_id]) : null;

  await db.tx(async (t) => {
    await t.run('UPDATE order_items SET quantity = ?, notes = ?, seat = ? WHERE id = ?', [
      newQty,
      notes !== undefined ? (notes ? String(notes).slice(0, 200) : null) : item.notes,
      seat !== undefined ? (parseInt(seat, 10) || null) : item.seat,
      item.id
    ]);
    if (menuItem && newQty !== item.quantity) {
      await moveRecipeStock(t, {
        restaurantId: order.restaurant_id, recipeId: menuItem.recipe_id, deltaQty: newQty - item.quantity,
        orderItemId: item.id, userId: req.user.id, reasonPrefix: newQty > item.quantity ? 'venta' : 'cancelacion'
      });
    }
  });

  await audit(db, req, {
    action: 'item_modificado', entity: 'order_items', entityId: item.id, authorizedBy: approver ? approver.id : null,
    before: { quantity: item.quantity, notes: item.notes, seat: item.seat },
    after: { quantity: newQty, notes, seat }
  });
  const full = await getOrderFull(db, order.id, req.user.restaurant_id);
  emitOrder(req, full);
  req.app.get('io').to(req.user.restaurant_id).emit('kitchen:item_updated', { id: item.id });
  res.json(full);
}));

// Anular ítem (repone inventario). Fuera del margen de gracia exige clave de supervisor.
async function voidItem(req, res) {
  const { item, order } = await loadItemForEdit(req);
  const { reason, pin } = req.body || {};
  let approver = null;
  if (voidNeedsAuthorization(item)) {
    if (!reason) return res.status(400).json({ error: 'Indica el motivo de la anulación' });
    approver = await requireAuthorization(db, req, pin);
  }
  const menuItem = item.menu_item_id ? await db.get('SELECT * FROM menu_items WHERE id = ?', [item.menu_item_id]) : null;

  await db.tx(async (t) => {
    await t.run(`
      UPDATE order_items SET status = 'anulado', void_reason = ?, voided_by = ?, void_authorized_by = ?, voided_at = ?
      WHERE id = ?
    `, [reason || 'corrección inmediata', req.user.id, approver ? approver.id : null, t.nowIso(), item.id]);
    // Si la cocina ya lo preparó, el insumo se consumió: no se repone (queda como merma)
    if (menuItem && item.kitchen_status === 'pendiente') {
      await moveRecipeStock(t, {
        restaurantId: order.restaurant_id, recipeId: menuItem.recipe_id, deltaQty: -item.quantity,
        orderItemId: item.id, userId: req.user.id, reasonPrefix: 'cancelacion'
      });
    }
  });

  await audit(db, req, {
    action: 'item_anulado', entity: 'order_items', entityId: item.id, authorizedBy: approver ? approver.id : null,
    before: { name: item.name_snapshot, quantity: item.quantity, price: item.price_snapshot, kitchen_status: item.kitchen_status },
    after: { reason: reason || 'corrección inmediata' }
  });
  const full = await getOrderFull(db, order.id, req.user.restaurant_id);
  emitOrder(req, full);
  req.app.get('io').to(req.user.restaurant_id).emit('kitchen:item_updated', { id: item.id });
  res.json(full);
}
router.post('/items/:orderItemId/void', requirePermission('pedidos', 'editar'), ah(voidItem));
router.delete('/items/:orderItemId', requirePermission('pedidos', 'editar'), ah(voidItem));

// Cambiar estado de un ítem en cocina/bar (pendiente -> listo -> entregado)
router.put('/items/:orderItemId/kitchen-status', requirePermission('kds', 'editar'), ah(async (req, res) => {
  const { kitchen_status } = req.body;
  if (!['pendiente', 'listo', 'entregado'].includes(kitchen_status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  const item = await db.get(`
    SELECT oi.* FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE oi.id = ? AND o.restaurant_id = ?
  `, [req.params.orderItemId, req.user.restaurant_id]);
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  await db.run('UPDATE order_items SET kitchen_status = ? WHERE id = ?', [kitchen_status, item.id]);
  const updated = await db.get('SELECT * FROM order_items WHERE id = ?', [item.id]);
  req.app.get('io').to(req.user.restaurant_id).emit('kitchen:item_updated', updated);
  const full = await getOrderFull(db, item.order_id, req.user.restaurant_id);
  emitOrder(req, full);
  res.json(updated);
}));

// Descuento o cortesía sobre la cuenta (siempre con autorización)
router.post('/:id/discount', requirePermission('pedidos', 'editar'), ah(async (req, res) => {
  const order = await loadOwnOpenOrder(req, req.params.id);
  const { type, value, reason, pin } = req.body;
  if (!['porcentaje', 'monto', 'cortesia', 'ninguno'].includes(type)) return res.status(400).json({ error: 'Tipo de descuento inválido' });
  const v = Number(value) || 0;
  if (type === 'porcentaje' && (v <= 0 || v > 100)) return res.status(400).json({ error: 'Porcentaje inválido' });
  if (type === 'monto' && v <= 0) return res.status(400).json({ error: 'Monto inválido' });
  if (type !== 'ninguno' && !reason) return res.status(400).json({ error: 'Indica el motivo del descuento o cortesía' });
  const approver = await requireAuthorization(db, req, pin);

  await db.run(`
    UPDATE orders SET discount_type = ?, discount_value = ?, discount_reason = ?, discount_authorized_by = ? WHERE id = ?
  `, type === 'ninguno' ? [null, 0, null, null, order.id] : [type, v, reason, approver.id, order.id]);
  await audit(db, req, {
    action: type === 'cortesia' ? 'cortesia' : 'descuento', entity: 'orders', entityId: order.id, authorizedBy: approver.id,
    before: { type: order.discount_type, value: order.discount_value }, after: { type, value: v, reason }
  });
  const full = await getOrderFull(db, order.id, req.user.restaurant_id);
  emitOrder(req, full);
  res.json(full);
}));

// Transferir la cuenta a otra mesa libre (mover mesa)
router.post('/:id/transfer', requirePermission('pedidos', 'editar'), ah(async (req, res) => {
  const order = await loadOwnOpenOrder(req, req.params.id);
  const target = await db.get('SELECT * FROM tables WHERE id = ? AND restaurant_id = ?', [req.body.to_table_id, req.user.restaurant_id]);
  if (!target) return res.status(404).json({ error: 'Mesa destino no encontrada' });
  if (!['libre', 'reservada'].includes(target.status)) return res.status(400).json({ error: 'La mesa destino no está libre' });

  await db.tx(async (t) => {
    const src = await t.get('SELECT * FROM tables WHERE id = ?', [order.table_id]);
    await t.run('UPDATE orders SET table_id = ? WHERE id = ?', [target.id, order.id]);
    await t.run(`UPDATE tables SET status = 'ocupada', occupied_since = ? WHERE id = ?`, [src.occupied_since || t.nowIso(), target.id]);
    await t.run(`UPDATE tables SET status = 'por_limpiar', occupied_since = NULL WHERE id = ?`, [order.table_id]);
    await t.run('UPDATE tables SET merged_into = ? WHERE merged_into = ?', [target.id, order.table_id]);
  });
  await audit(db, req, { action: 'mesa_transferida', entity: 'orders', entityId: order.id,
    before: { table_id: order.table_id }, after: { table_id: target.id } });
  const full = await getOrderFull(db, order.id, req.user.restaurant_id);
  emitOrder(req, full);
  emitTables(req);
  res.json(full);
}));

// Unir mesas: las mesas indicadas pasan a "unida" bajo esta cuenta. Si alguna
// tenía cuenta abierta (sin pagos), sus ítems se trasladan a esta.
router.post('/:id/merge', requirePermission('pedidos', 'editar'), ah(async (req, res) => {
  const order = await loadOwnOpenOrder(req, req.params.id);
  if (!order.table_id) return res.status(400).json({ error: 'Solo se pueden unir mesas del salón' });
  const ids = Array.isArray(req.body.table_ids) ? req.body.table_ids.filter(id => id !== order.table_id) : [];
  if (!ids.length) return res.status(400).json({ error: 'Selecciona al menos una mesa' });

  await db.tx(async (t) => {
    for (const tid of ids) {
      const tb = await t.get('SELECT * FROM tables WHERE id = ? AND restaurant_id = ?', [tid, req.user.restaurant_id]);
      if (!tb) throw httpError(404, 'Mesa no encontrada');
      if (tb.status === 'bloqueada' || tb.status === 'unida') throw httpError(400, `La mesa ${tb.name} no se puede unir (${tb.status})`);
      const other = await t.get(`SELECT * FROM orders WHERE table_id = ? AND status = 'abierta'`, [tid]);
      if (other) {
        const pay = await t.get('SELECT COUNT(*) as n FROM order_payments WHERE order_id = ?', [other.id]);
        if (Number(pay.n) > 0) throw httpError(400, `La mesa ${tb.name} ya tiene pagos registrados`);
        await t.run('UPDATE order_items SET order_id = ? WHERE order_id = ?', [order.id, other.id]);
        await t.run('UPDATE orders SET guests = guests + ? WHERE id = ?', [other.guests || 0, order.id]);
        await t.run(`UPDATE orders SET status = 'cerrada', closed_at = ?, closed_by = ? WHERE id = ?`, [t.nowIso(), req.user.id, other.id]);
      }
      await t.run(`UPDATE tables SET status = 'unida', merged_into = ?, occupied_since = COALESCE(occupied_since, ?) WHERE id = ?`,
        [order.table_id, t.nowIso(), tid]);
    }
  });
  await audit(db, req, { action: 'mesas_unidas', entity: 'orders', entityId: order.id, after: { table_ids: ids } });
  const full = await getOrderFull(db, order.id, req.user.restaurant_id);
  emitOrder(req, full);
  emitTables(req);
  res.json(full);
}));

// Separar una mesa unida (vuelve a quedar libre; los ítems siguen en esta cuenta)
router.post('/:id/unmerge', requirePermission('pedidos', 'editar'), ah(async (req, res) => {
  const order = await loadOwnOpenOrder(req, req.params.id);
  const r = await db.run(`UPDATE tables SET status = 'libre', merged_into = NULL, occupied_since = NULL
                          WHERE id = ? AND merged_into = ? AND restaurant_id = ?`,
    [req.body.table_id, order.table_id, req.user.restaurant_id]);
  if (!r.changes) return res.status(400).json({ error: 'Esa mesa no está unida a esta cuenta' });
  await audit(db, req, { action: 'mesa_separada', entity: 'orders', entityId: order.id, after: { table_id: req.body.table_id } });
  const full = await getOrderFull(db, order.id, req.user.restaurant_id);
  emitOrder(req, full);
  emitTables(req);
  res.json(full);
}));

// Pasar ítems a otra mesa (separar cuenta en mesas distintas)
router.post('/:id/move-items', requirePermission('pedidos', 'editar'), ah(async (req, res) => {
  const order = await loadOwnOpenOrder(req, req.params.id);
  const { item_ids, to_table_id } = req.body;
  if (!Array.isArray(item_ids) || !item_ids.length) return res.status(400).json({ error: 'Selecciona ítems' });
  const target = await db.get('SELECT * FROM tables WHERE id = ? AND restaurant_id = ?', [to_table_id, req.user.restaurant_id]);
  if (!target || target.id === order.table_id) return res.status(400).json({ error: 'Mesa destino inválida' });

  const targetOrderId = await db.tx(async (t) => {
    let dest = await t.get(`SELECT * FROM orders WHERE table_id = ? AND status = 'abierta'`, [target.id]);
    if (!dest) {
      if (!['libre', 'reservada'].includes(target.status)) throw httpError(400, 'La mesa destino no está disponible');
      const id = await createOrder(t, { restaurantId: req.user.restaurant_id, tableId: target.id, waiterId: order.waiter_id, guests: 1 });
      await t.run(`UPDATE tables SET status = 'ocupada', occupied_since = ? WHERE id = ?`, [t.nowIso(), target.id]);
      dest = { id };
    }
    for (const iid of item_ids) {
      await t.run(`UPDATE order_items SET order_id = ? WHERE id = ? AND order_id = ? AND status = 'activo'`, [dest.id, iid, order.id]);
    }
    return dest.id;
  });
  await audit(db, req, { action: 'items_movidos', entity: 'orders', entityId: order.id, after: { item_ids, to_order: targetOrderId } });
  const full = await getOrderFull(db, order.id, req.user.restaurant_id);
  emitOrder(req, full);
  emitOrder(req, await getOrderFull(db, targetOrderId, req.user.restaurant_id));
  emitTables(req);
  res.json(full);
}));

// Registrar un pago (parcial o total). Varios pagos = cuenta dividida
// (por comensal, por ítem, por monto o en partes iguales).
router.post('/:id/payments', requirePermission('cobros', 'crear'), ah(async (req, res) => {
  const order = await loadOwnOpenOrder(req, req.params.id);
  const { method, amount, tip_amount, reference, payer_label } = req.body;
  if (!PAYMENT_METHODS.includes(method)) return res.status(400).json({ error: 'Forma de pago inválida' });
  const full = await getOrderFull(db, order.id, req.user.restaurant_id);
  const amt = round2(amount);
  const tip = Math.max(0, round2(tip_amount));
  if (!(amt > 0)) return res.status(400).json({ error: 'Monto inválido' });
  // Solo el efectivo admite pagar de más (se devuelve cambio); el resto debe cuadrar
  const applied = Math.min(amt, full.balance);
  if (amt > full.balance + 0.01 && method !== 'efectivo') {
    return res.status(400).json({ error: `El monto excede el saldo pendiente (${full.balance})` });
  }
  if (applied <= 0) return res.status(400).json({ error: 'La cuenta ya está saldada' });

  const id = uuidv4();
  await db.run(`
    INSERT INTO order_payments (id, restaurant_id, order_id, method, amount, tip_amount, reference, payer_label, received_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, req.user.restaurant_id, order.id, method, applied, tip, reference || null, payer_label || null, req.user.id, db.nowIso()]);
  await audit(db, req, { action: 'pago_registrado', entity: 'order_payments', entityId: id,
    after: { method, amount: applied, tip, payer_label } });

  const updated = await getOrderFull(db, order.id, req.user.restaurant_id);
  emitOrder(req, updated);
  res.json({ ...updated, change: round2(amt - applied) });
}));

// Anular un pago registrado (requiere autorización)
router.post('/payments/:paymentId/void', requirePermission('cobros', 'crear'), ah(async (req, res) => {
  const payment = await db.get('SELECT * FROM order_payments WHERE id = ? AND restaurant_id = ?',
    [req.params.paymentId, req.user.restaurant_id]);
  if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });
  const order = await loadOwnOpenOrder(req, payment.order_id);
  const approver = await requireAuthorization(db, req, req.body.pin);
  await db.run('DELETE FROM order_payments WHERE id = ?', [payment.id]);
  await audit(db, req, { action: 'pago_anulado', entity: 'order_payments', entityId: payment.id,
    authorizedBy: approver.id, before: payment });
  const full = await getOrderFull(db, order.id, req.user.restaurant_id);
  emitOrder(req, full);
  res.json(full);
}));

// Cerrar cuenta: exige saldo en cero. Por compatibilidad (domicilios), si no
// hay pagos registrados se asume un único pago por el total con `payment_method`.
// No genera factura fiscal por sí solo: ver POST /api/invoicing/orders/:orderId.
// También registra el ingreso en contabilidad (services/accounting.js).
router.post('/:id/close', requirePermission('cobros', 'crear'), ah(async (req, res) => {
  const order = await loadOwnOpenOrder(req, req.params.id);
  let full = await getOrderFull(db, order.id, req.user.restaurant_id);
  if (full.items.filter(i => i.status === 'activo').length === 0) {
    return res.status(400).json({ error: 'La cuenta no tiene ítems; usa "Liberar mesa" si el cliente se fue' });
  }
  if (full.payments.length === 0 && full.balance > 0) {
    const method = PAYMENT_METHODS.includes(req.body.payment_method) ? req.body.payment_method : 'efectivo';
    await db.run(`
      INSERT INTO order_payments (id, restaurant_id, order_id, method, amount, tip_amount, received_by, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `, [uuidv4(), req.user.restaurant_id, order.id, method, full.balance, req.user.id, db.nowIso()]);
    full = await getOrderFull(db, order.id, req.user.restaurant_id);
  }
  if (full.balance > 0.01) {
    return res.status(400).json({ error: `Falta cobrar ${full.balance}` });
  }

  await db.tx(async (t) => {
    await t.run(`UPDATE orders SET status = 'cerrada', closed_at = ?, closed_by = ?, tip_amount = ? WHERE id = ?`,
      [t.nowIso(), req.user.id, full.tip_amount, order.id]);
    if (order.table_id) {
      await t.run(`UPDATE tables SET status = 'por_limpiar', occupied_since = NULL, merged_into = NULL
                   WHERE id = ? OR merged_into = ?`, [order.table_id, order.table_id]);
    }
  });

  full = await getOrderFull(db, order.id, req.user.restaurant_id);
  try {
    await recordSaleIncome(db, full);
  } catch (e) {
    console.error('No se pudo registrar el ingreso contable automático:', e.message);
  }
  await audit(db, req, { action: 'cuenta_cerrada', entity: 'orders', entityId: order.id,
    after: { total: full.total, tip: full.tip_amount, payments: full.payments.length } });

  if (order.table_id) emitTables(req);
  req.app.get('io').to(req.user.restaurant_id).emit('order:closed', full);
  res.json(full);
}));

// Liberar una mesa abierta sin consumo (cliente se fue sin pedir)
router.post('/:id/release', requirePermission('pedidos', 'editar'), ah(async (req, res) => {
  const order = await loadOwnOpenOrder(req, req.params.id);
  const active = await db.get(`SELECT COUNT(*) as n FROM order_items WHERE order_id = ? AND status = 'activo'`, [order.id]);
  if (Number(active.n) > 0) return res.status(400).json({ error: 'La cuenta tiene ítems; anúlalos o cóbralos primero' });
  await db.tx(async (t) => {
    await t.run(`UPDATE orders SET status = 'cerrada', closed_at = ?, closed_by = ? WHERE id = ?`, [t.nowIso(), req.user.id, order.id]);
    if (order.table_id) {
      await t.run(`UPDATE tables SET status = 'libre', occupied_since = NULL, merged_into = NULL WHERE id = ? OR merged_into = ?`,
        [order.table_id, order.table_id]);
    }
  });
  await audit(db, req, { action: 'mesa_liberada_sin_consumo', entity: 'orders', entityId: order.id });
  emitTables(req);
  req.app.get('io').to(req.user.restaurant_id).emit('order:closed', { id: order.id, channel: order.channel });
  res.json({ ok: true });
}));

// Precuenta (deja rastro de cada impresión para control)
router.post('/:id/precuenta', ah(async (req, res) => {
  const order = await loadOwnOpenOrder(req, req.params.id);
  await audit(db, req, { action: 'precuenta_impresa', entity: 'orders', entityId: order.id });
  res.json(await getOrderFull(db, order.id, req.user.restaurant_id));
}));

module.exports = router;
