const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const ah = require('../utils/asyncHandler');

const router = express.Router();
router.use(authMiddleware);

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

// Registrar entrada o ajuste de stock (movimiento)
router.post('/:id/movement', requireRole('admin'), ah(async (req, res) => {
  const { type, quantity, reason } = req.body; // type: entrada | salida | ajuste
  const item = await db.get('SELECT * FROM inventory_items WHERE id = ? AND restaurant_id = ?',
    [req.params.id, req.user.restaurant_id]);
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  if (!['entrada', 'salida', 'ajuste'].includes(type)) {
    return res.status(400).json({ error: 'Tipo de movimiento inválido' });
  }

  const delta = type === 'salida' ? -Math.abs(quantity) : Math.abs(quantity);
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
