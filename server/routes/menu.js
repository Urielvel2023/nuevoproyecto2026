const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const { requireActiveSubscription } = require('../services/billing');
const ah = require('../utils/asyncHandler');

const router = express.Router();
router.use(authMiddleware);
router.use(requireActiveSubscription);

// ---- Categorías ----
router.get('/categories', ah(async (req, res) => {
  const cats = await db.all('SELECT * FROM menu_categories WHERE restaurant_id = ? ORDER BY sort_order, name',
    [req.user.restaurant_id]);
  res.json(cats);
}));

router.post('/categories', requireRole('admin'), ah(async (req, res) => {
  const { name, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' });
  const id = uuidv4();
  await db.run('INSERT INTO menu_categories (id, restaurant_id, name, sort_order) VALUES (?, ?, ?, ?)',
    [id, req.user.restaurant_id, name, sort_order || 0]);
  res.json(await db.get('SELECT * FROM menu_categories WHERE id = ?', [id]));
}));

router.delete('/categories/:id', requireRole('admin'), ah(async (req, res) => {
  await db.run('DELETE FROM menu_categories WHERE id = ? AND restaurant_id = ?',
    [req.params.id, req.user.restaurant_id]);
  res.json({ ok: true });
}));

// ---- Items del menú ----
async function itemWithCost(item) {
  if (!item.recipe_id) return { ...item, cost: null, margin: null };
  const row = await db.get(`
    SELECT COALESCE(SUM(ri.quantity * ii.unit_cost), 0) as total
    FROM recipe_ingredients ri JOIN inventory_items ii ON ii.id = ri.inventory_item_id
    WHERE ri.recipe_id = ?
  `, [item.recipe_id]);
  const cost = row.total;
  return { ...item, cost, margin: item.price - cost };
}

router.get('/items', ah(async (req, res) => {
  const items = await db.all(`
    SELECT mi.*, mc.name as category_name FROM menu_items mi
    LEFT JOIN menu_categories mc ON mc.id = mi.category_id
    WHERE mi.restaurant_id = ? ORDER BY mc.sort_order, mi.name
  `, [req.user.restaurant_id]);
  res.json(await Promise.all(items.map(itemWithCost)));
}));

router.post('/items', requireRole('admin'), ah(async (req, res) => {
  const { name, description, price, category_id, recipe_id } = req.body;
  if (!name || price == null) return res.status(400).json({ error: 'Nombre y precio son requeridos' });
  const id = uuidv4();
  await db.run(`
    INSERT INTO menu_items (id, restaurant_id, category_id, recipe_id, name, description, price)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [id, req.user.restaurant_id, category_id || null, recipe_id || null, name, description || null, price]);

  const item = await db.get('SELECT * FROM menu_items WHERE id = ?', [id]);
  const full = await itemWithCost(item);
  req.app.get('io').to(req.user.restaurant_id).emit('menu:changed', full);
  res.json(full);
}));

router.put('/items/:id', requireRole('admin'), ah(async (req, res) => {
  const item = await db.get('SELECT * FROM menu_items WHERE id = ? AND restaurant_id = ?',
    [req.params.id, req.user.restaurant_id]);
  if (!item) return res.status(404).json({ error: 'No encontrado' });

  const { name, description, price, category_id, recipe_id, available } = req.body;
  await db.run(`
    UPDATE menu_items SET
      name = COALESCE(?, name),
      description = ?,
      price = COALESCE(?, price),
      category_id = ?,
      recipe_id = ?,
      available = COALESCE(?, available),
      updated_at = ?
    WHERE id = ?
  `, [name, description, price, category_id, recipe_id, available, db.nowIso(), req.params.id]);

  const updated = await db.get('SELECT * FROM menu_items WHERE id = ?', [req.params.id]);
  const full = await itemWithCost(updated);
  // Este es el evento clave de "sincronización en tiempo real": todos los dispositivos
  // conectados al restaurante (caja, meseros, cocina) reciben el precio/disponibilidad actualizada al instante
  req.app.get('io').to(req.user.restaurant_id).emit('menu:changed', full);
  res.json(full);
}));

router.delete('/items/:id', requireRole('admin'), ah(async (req, res) => {
  await db.run('DELETE FROM menu_items WHERE id = ? AND restaurant_id = ?', [req.params.id, req.user.restaurant_id]);
  req.app.get('io').to(req.user.restaurant_id).emit('menu:deleted', { id: req.params.id });
  res.json({ ok: true });
}));

module.exports = router;
