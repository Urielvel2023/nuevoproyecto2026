const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const { requireActiveSubscription } = require('../services/billing');
const ah = require('../utils/asyncHandler');

const router = express.Router();
router.use(authMiddleware);
router.use(requireActiveSubscription);

// Listar inventario del restaurante
router.get('/', ah(async (req, res) => {
  const items = await db.all(
    'SELECT * FROM inventory_items WHERE restaurant_id = ? ORDER BY category, name',
    [req.user.restaurant_id]
  );
  res.json(items);
}));

// Crear producto de inventario
router.post('/', requireRole('admin'), ah(async (req, res) => {
  const { name, category, unit, stock, min_stock, unit_cost, supplier } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' });
  const id = uuidv4();
  await db.run(`
    INSERT INTO inventory_items (id, restaurant_id, name, category, unit, stock, min_stock, unit_cost, supplier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, req.user.restaurant_id, name, category || 'general', unit || 'unidad',
      stock || 0, min_stock || 0, unit_cost || 0, supplier || null]);
  const item = await db.get('SELECT * FROM inventory_items WHERE id = ?', [id]);
  req.app.get('io').to(req.user.restaurant_id).emit('inventory:changed', item);
  res.json(item);
}));

// Actualizar producto (incluye actualizar costo unitario -> recalcula costos de recetas al vuelo)
router.put('/:id', requireRole('admin'), ah(async (req, res) => {
  const item = await db.get('SELECT * FROM inventory_items WHERE id = ? AND restaurant_id = ?',
    [req.params.id, req.user.restaurant_id]);
  if (!item) return res.status(404).json({ error: 'No encontrado' });

  const { name, category, unit, min_stock, unit_cost, supplier } = req.body;
  await db.run(`
    UPDATE inventory_items SET
      name = COALESCE(?, name),
      category = COALESCE(?, category),
      unit = COALESCE(?, unit),
      min_stock = COALESCE(?, min_stock),
      unit_cost = COALESCE(?, unit_cost),
      supplier = COALESCE(?, supplier),
      updated_at = ?
    WHERE id = ?
  `, [name, category, unit, min_stock, unit_cost, supplier, db.nowIso(), req.params.id]);

  const updated = await db.get('SELECT * FROM inventory_items WHERE id = ?', [req.params.id]);
  req.app.get('io').to(req.user.restaurant_id).emit('inventory:changed', updated);
  res.json(updated);
}));

// Eliminar un producto del almacén. Se bloquea si está siendo usado en
// alguna receta (para no romper el costeo de esos platos/bebidas); el
// historial de movimientos del producto se borra junto con él.
router.delete('/:id', requireRole('admin'), ah(async (req, res) => {
  const item = await db.get('SELECT * FROM inventory_items WHERE id = ? AND restaurant_id = ?',
    [req.params.id, req.user.restaurant_id]);
  if (!item) return res.status(404).json({ error: 'No encontrado' });

  const usedIn = await db.all(`
    SELECT DISTINCT r.name FROM recipe_ingredients ri
    JOIN recipes r ON r.id = ri.recipe_id
    WHERE ri.inventory_item_id = ?
  `, [item.id]);
  if (usedIn.length > 0) {
    return res.status(409).json({
      error: `No se puede eliminar: "${item.name}" se usa en la(s) receta(s): ${usedIn.map(r => r.name).join(', ')}. Quítalo de esas recetas primero.`
    });
  }

  await db.tx(async (t) => {
    await t.run('DELETE FROM inventory_movements WHERE item_id = ?', [item.id]);
    await t.run('DELETE FROM inventory_items WHERE id = ?', [item.id]);
  });

  req.app.get('io').to(req.user.restaurant_id).emit('inventory:deleted', { id: item.id });
  res.json({ ok: true });
}));

// Registrar entrada, salida o ajuste de stock (movimiento)
router.post('/:id/movement', requireRole('admin'), ah(async (req, res) => {
  const { type, quantity, reason } = req.body; // type: entrada | salida | ajuste
  const item = await db.get('SELECT * FROM inventory_items WHERE id = ? AND restaurant_id = ?',
    [req.params.id, req.user.restaurant_id]);
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  if (!['entrada', 'salida', 'ajuste'].includes(type)) {
    return res.status(400).json({ error: 'Tipo de movimiento inválido' });
  }
  if (!quantity) return res.status(400).json({ error: 'La cantidad es requerida' });

  // "entrada" siempre suma y "salida" siempre resta, sin importar el signo
  // que se escriba. "ajuste" respeta el signo tal cual (positivo suma,
  // negativo resta), para poder corregir el stock en cualquier dirección.
  let delta;
  if (type === 'entrada') delta = Math.abs(quantity);
  else if (type === 'salida') delta = -Math.abs(quantity);
  else delta = Number(quantity);

  await db.tx(async (t) => {
    await t.run(`
      INSERT INTO inventory_movements (id, restaurant_id, item_id, type, quantity, reason, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [uuidv4(), req.user.restaurant_id, item.id, type, quantity, reason || null, req.user.id]);

    await t.run('UPDATE inventory_items SET stock = stock + ?, updated_at = ? WHERE id = ?',
      [delta, t.nowIso(), item.id]);
  });

  const updated = await db.get('SELECT * FROM inventory_items WHERE id = ?', [item.id]);
  req.app.get('io').to(req.user.restaurant_id).emit('inventory:changed', updated);

  if (updated.stock <= updated.min_stock) {
    req.app.get('io').to(req.user.restaurant_id).emit('inventory:low_stock', updated);
  }

  res.json(updated);
}));

// Historial de movimientos de un producto
router.get('/:id/movements', ah(async (req, res) => {
  const movements = await db.all(`
    SELECT m.*, u.name as user_name FROM inventory_movements m
    LEFT JOIN users u ON u.id = m.created_by
    WHERE m.item_id = ? AND m.restaurant_id = ?
    ORDER BY m.created_at DESC LIMIT 100
  `, [req.params.id, req.user.restaurant_id]);
  res.json(movements);
}));

module.exports = router;
