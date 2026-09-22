const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const { requireActiveSubscription } = require('../services/billing');
const ah = require('../utils/asyncHandler');

const router = express.Router();
router.use(authMiddleware);
router.use(requireActiveSubscription);

async function getRecipeWithCost(recipeId, restaurantId) {
  const recipe = await db.get('SELECT * FROM recipes WHERE id = ? AND restaurant_id = ?',
    [recipeId, restaurantId]);
  if (!recipe) return null;

  const ingredients = await db.all(`
    SELECT ri.id, ri.quantity, ii.id as inventory_item_id, ii.name, ii.unit, ii.unit_cost,
           (ri.quantity * ii.unit_cost) as line_cost
    FROM recipe_ingredients ri
    JOIN inventory_items ii ON ii.id = ri.inventory_item_id
    WHERE ri.recipe_id = ?
  `, [recipeId]);

  const total_cost = ingredients.reduce((sum, i) => sum + i.line_cost, 0);
  return { ...recipe, ingredients, total_cost };
}

// Listar recetas con costo calculado
router.get('/', ah(async (req, res) => {
  const recipes = await db.all('SELECT * FROM recipes WHERE restaurant_id = ? ORDER BY name',
    [req.user.restaurant_id]);
  const withCost = await Promise.all(recipes.map(r => getRecipeWithCost(r.id, req.user.restaurant_id)));
  res.json(withCost);
}));

// Obtener una receta
router.get('/:id', ah(async (req, res) => {
  const recipe = await getRecipeWithCost(req.params.id, req.user.restaurant_id);
  if (!recipe) return res.status(404).json({ error: 'No encontrada' });
  res.json(recipe);
}));

// Crear receta con ingredientes: { name, type, notes, ingredients: [{inventory_item_id, quantity}] }
router.post('/', requireRole('admin'), ah(async (req, res) => {
  const { name, type, notes, ingredients } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' });

  const id = uuidv4();
  await db.tx(async (t) => {
    await t.run(`
      INSERT INTO recipes (id, restaurant_id, name, type, notes)
      VALUES (?, ?, ?, ?, ?)
    `, [id, req.user.restaurant_id, name, type || 'cocina', notes || null]);

    for (const ing of (ingredients || [])) {
      await t.run(`
        INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity)
        VALUES (?, ?, ?, ?)
      `, [uuidv4(), id, ing.inventory_item_id, ing.quantity]);
    }
  });

  res.json(await getRecipeWithCost(id, req.user.restaurant_id));
}));

// Actualizar receta (reemplaza ingredientes)
router.put('/:id', requireRole('admin'), ah(async (req, res) => {
  const recipe = await db.get('SELECT * FROM recipes WHERE id = ? AND restaurant_id = ?',
    [req.params.id, req.user.restaurant_id]);
  if (!recipe) return res.status(404).json({ error: 'No encontrada' });

  const { name, type, notes, ingredients } = req.body;
  await db.tx(async (t) => {
    await t.run(`UPDATE recipes SET name = COALESCE(?, name), type = COALESCE(?, type), notes = ? WHERE id = ?`,
      [name, type, notes, req.params.id]);

    if (ingredients) {
      await t.run('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [req.params.id]);
      for (const ing of ingredients) {
        await t.run(`
          INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity)
          VALUES (?, ?, ?, ?)
        `, [uuidv4(), req.params.id, ing.inventory_item_id, ing.quantity]);
      }
    }
  });

  res.json(await getRecipeWithCost(req.params.id, req.user.restaurant_id));
}));

router.delete('/:id', requireRole('admin'), ah(async (req, res) => {
  await db.run('DELETE FROM recipes WHERE id = ? AND restaurant_id = ?', [req.params.id, req.user.restaurant_id]);
  res.json({ ok: true });
}));

module.exports = router;
