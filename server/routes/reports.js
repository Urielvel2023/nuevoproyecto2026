const express = require('express');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const ah = require('../utils/asyncHandler');

const router = express.Router();
router.use(authMiddleware);
router.use(requireRole('admin'));

// Filtro de fechas opcional: ?from=2026-01-01&to=2026-12-31
function dateFilter(req) {
  const from = req.query.from || '2000-01-01';
  const to = req.query.to || '2100-01-01';
  return { from, to };
}

// Nota: se usa substr(x,1,10) en vez de date(x) para extraer 'YYYY-MM-DD'
// de las columnas de fecha (guardadas como texto ISO), porque substr()
// funciona igual en SQLite y PostgreSQL; date() no existe para texto en Postgres.

// Resumen general: ventas totales, número de cuentas cerradas, ticket promedio
router.get('/summary', ah(async (req, res) => {
  const { from, to } = dateFilter(req);
  const row = await db.get(`
    SELECT
      COUNT(DISTINCT o.id) as orders_count,
      COALESCE(SUM(oi.price_snapshot * oi.quantity), 0) as total_sales
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.restaurant_id = ? AND o.status = 'cerrada'
      AND substr(o.closed_at, 1, 10) BETWEEN ? AND ?
  `, [req.user.restaurant_id, from, to]);

  const avg_ticket = row.orders_count > 0 ? row.total_sales / row.orders_count : 0;
  res.json({ ...row, avg_ticket });
}));

// Ventas por mesero
router.get('/by-waiter', ah(async (req, res) => {
  const { from, to } = dateFilter(req);
  const rows = await db.all(`
    SELECT u.id as waiter_id, u.name as waiter_name,
           COUNT(DISTINCT o.id) as orders_count,
           COALESCE(SUM(oi.price_snapshot * oi.quantity), 0) as total_sales
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    JOIN users u ON u.id = o.waiter_id
    WHERE o.restaurant_id = ? AND o.status = 'cerrada'
      AND substr(o.closed_at, 1, 10) BETWEEN ? AND ?
    GROUP BY u.id, u.name
    ORDER BY total_sales DESC
  `, [req.user.restaurant_id, from, to]);
  res.json(rows);
}));

// Ventas por plato/bebida/postre (agrupado también por categoría de menú)
router.get('/by-item', ah(async (req, res) => {
  const { from, to } = dateFilter(req);
  const rows = await db.all(`
    SELECT oi.menu_item_id, oi.name_snapshot as name,
           mc.name as category_name,
           COUNT(*) as times_ordered,
           SUM(oi.quantity) as units_sold,
           SUM(oi.price_snapshot * oi.quantity) as total_sales
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
    LEFT JOIN menu_categories mc ON mc.id = mi.category_id
    WHERE o.restaurant_id = ? AND o.status = 'cerrada'
      AND substr(o.closed_at, 1, 10) BETWEEN ? AND ?
    GROUP BY oi.menu_item_id, oi.name_snapshot, mc.name
    ORDER BY total_sales DESC
  `, [req.user.restaurant_id, from, to]);
  res.json(rows);
}));

// Ventas por categoría (platos fuertes, bebidas, postres, etc.)
router.get('/by-category', ah(async (req, res) => {
  const { from, to } = dateFilter(req);
  const rows = await db.all(`
    SELECT COALESCE(mc.name, 'Sin categoría') as category_name,
           SUM(oi.quantity) as units_sold,
           SUM(oi.price_snapshot * oi.quantity) as total_sales
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
    LEFT JOIN menu_categories mc ON mc.id = mi.category_id
    WHERE o.restaurant_id = ? AND o.status = 'cerrada'
      AND substr(o.closed_at, 1, 10) BETWEEN ? AND ?
    GROUP BY mc.id, mc.name
    ORDER BY total_sales DESC
  `, [req.user.restaurant_id, from, to]);
  res.json(rows);
}));

// Ventas por día (para gráfica de tendencia)
router.get('/by-day', ah(async (req, res) => {
  const { from, to } = dateFilter(req);
  const rows = await db.all(`
    SELECT substr(o.closed_at, 1, 10) as day,
           SUM(oi.price_snapshot * oi.quantity) as total_sales
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.restaurant_id = ? AND o.status = 'cerrada'
      AND substr(o.closed_at, 1, 10) BETWEEN ? AND ?
    GROUP BY day
    ORDER BY day
  `, [req.user.restaurant_id, from, to]);
  res.json(rows);
}));

module.exports = router;
