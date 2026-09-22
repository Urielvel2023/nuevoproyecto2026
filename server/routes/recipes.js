const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');

const router = express.Router();
router.use(authMiddleware);

function getRecipeWithCost(recipeId, restaurantId) {
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND restaurant_id = ?')
    .get(recipeId, restaurantId);
  if (!recipe) return null;

  const ingredients = db.prepare(`
    SELECT ri.id, ri.quantity, ii.id as inventory_item_id, ii.name, ii.unit, ii.unit_cost,
           (ri.quantity * ii.unit_cost) as line_cost
    FROM recipe_ingredients ri
    JOIN inventory_items ii ON ii.id = ri.inventory_item_id
    WHERE ri.recipe_id = ?
  `).all(recipeId);

  const total_cost = ingredients.reduce((sum, i) => sum + i.line_cost, 0);
  return { ...recipe, ingredients, total_cost };
}

// Listar recetas con costo calculado
router.get('/', (req, res) => {
  const recipes = db.prepare('SELECT * FROM recipes WHERE restaurant_id = ? ORDER BY name')
    .all(req.user.restaurant_id);
  const withCost = recipes.map(r => getRecipeWithCost(r.id, req.user.restaurant_id));
  res.json(withCost);
});

// Obtener una receta
router.get('/:id', (req, res) => {
  const recipe = getRecipeWithCost(req.params.id, req.user.restaurant_id);
  if (!recipe) return res.status(404).json({ error: 'No encontrada' });
  res.json(recipe);
});

// Crear receta con ingredientes: { name, type, notes, ingredients: [{inventory_item_id, quantity}] }
router.post('/', requireRole('admin'), (req, res) => {
  const { name, type, notes, ingredients } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' });

  const id = uuidv4();
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO recipes (id, restaurant_id, name, type, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, req.user.restaurant_id, name, type || 'cocina', notes || null);

    (ingredients || []).forEach(ing => {
      db.prepare(`
        INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity)
        VALUES (?, ?, ?, ?)
      `).run(uuidv4(), id, ing.inventory_item_id, ing.quantity);
    });
  });
  tx();

  res.json(getRecipeWithCost(id, req.user.restaurant_id));
});

// Actualizar receta (reemplaza ingredientes)
router.put('/:id', requireRole('admin'), (req, res) => {
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND restaurant_id = ?')
    .get(req.params.id, req.user.restaurant_id);
  if (!recipe) return res.status(404).json({ error: 'No encontrada' });

  const { name, type, notes, ingredients } = req.body;
  const tx = db.transaction(() => {
    db.prepare(`UPDATE recipes SET name = COALESCE(?, name), type = COALESCE(?, type), notes = ? WHERE id = ?`)
      .run(name, type, notes, req.params.id);

    if (ingredients) {
      db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(req.params.id);
      ingredients.forEach(ing => {
        db.prepare(`
          INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity)
          VALUES (?, ?, ?, ?)
        `).run(uuidv4(), req.params.id, ing.inventory_item_id, ing.quantity);
      });
    }
  });
  tx();

  res.json(getRecipeWithCost(req.params.id, req.user.restaurant_id));
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM recipes WHERE id = ? AND restaurant_id = ?')
    .run(req.params.id, req.user.restaurant_id);
  res.json({ ok: true });
});

module.exports = router;
