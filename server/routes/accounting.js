const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const ah = require('../utils/asyncHandler');

const router = express.Router();
router.use(authMiddleware);
router.use(requireRole('admin'));

function dateFilter(req) {
  const from = req.query.from || '2000-01-01';
  const to = req.query.to || '2100-01-01';
  return { from, to };
}

// ---- Cuentas bancarias / caja ----
router.get('/bank-accounts', ah(async (req, res) => {
  const accounts = await db.all('SELECT * FROM bank_accounts WHERE restaurant_id = ? ORDER BY created_at',
    [req.user.restaurant_id]);
  res.json(accounts);
}));

router.post('/bank-accounts', ah(async (req, res) => {
  const { name, account_type, bank_name, account_number, initial_balance, is_default_sales_account } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' });
  const id = uuidv4();

  await db.tx(async (t) => {
    if (is_default_sales_account) {
      await t.run('UPDATE bank_accounts SET is_default_sales_account = 0 WHERE restaurant_id = ?', [req.user.restaurant_id]);
    }
    await t.run(`
      INSERT INTO bank_accounts (id, restaurant_id, name, account_type, bank_name, account_number, initial_balance, is_default_sales_account)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, req.user.restaurant_id, name, account_type || 'banco', bank_name || null, account_number || null,
        initial_balance || 0, is_default_sales_account ? 1 : 0]);
  });

  res.json(await db.get('SELECT * FROM bank_accounts WHERE id = ?', [id]));
}));

router.put('/bank-accounts/:id', ah(async (req, res) => {
  const account = await db.get('SELECT * FROM bank_accounts WHERE id = ? AND restaurant_id = ?',
    [req.params.id, req.user.restaurant_id]);
  if (!account) return res.status(404).json({ error: 'No encontrada' });

  const { name, account_type, bank_name, account_number, initial_balance, is_default_sales_account } = req.body;
  await db.tx(async (t) => {
    if (is_default_sales_account) {
      await t.run('UPDATE bank_accounts SET is_default_sales_account = 0 WHERE restaurant_id = ?', [req.user.restaurant_id]);
    }
    await t.run(`
      UPDATE bank_accounts SET
        name = COALESCE(?, name), account_type = COALESCE(?, account_type),
        bank_name = ?, account_number = ?, initial_balance = COALESCE(?, initial_balance),
        is_default_sales_account = COALESCE(?, is_default_sales_account)
      WHERE id = ?
    `, [name, account_type, bank_name, account_number, initial_balance,
        is_default_sales_account != null ? (is_default_sales_account ? 1 : 0) : null, req.params.id]);
  });

  res.json(await db.get('SELECT * FROM bank_accounts WHERE id = ?', [req.params.id]));
}));

router.delete('/bank-accounts/:id', ah(async (req, res) => {
  await db.run('DELETE FROM bank_accounts WHERE id = ? AND restaurant_id = ?', [req.params.id, req.user.restaurant_id]);
  res.json({ ok: true });
}));

// ---- Categorías de gastos/ingresos ----
router.get('/categories', ah(async (req, res) => {
  const cats = await db.all('SELECT * FROM expense_categories WHERE restaurant_id = ? ORDER BY name',
    [req.user.restaurant_id]);
  res.json(cats);
}));

router.post('/categories', ah(async (req, res) => {
  const { name, kind } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' });
  const id = uuidv4();
  await db.run('INSERT INTO expense_categories (id, restaurant_id, name, kind) VALUES (?, ?, ?, ?)',
    [id, req.user.restaurant_id, name, kind || 'gasto']);
  res.json(await db.get('SELECT * FROM expense_categories WHERE id = ?', [id]));
}));

router.delete('/categories/:id', ah(async (req, res) => {
  await db.run('DELETE FROM expense_categories WHERE id = ? AND restaurant_id = ?', [req.params.id, req.user.restaurant_id]);
  res.json({ ok: true });
}));

// ---- Movimientos (ingresos y gastos) ----
router.get('/transactions', ah(async (req, res) => {
  const { from, to } = dateFilter(req);
  const { type, bank_account_id } = req.query;

  let sql = `
    SELECT tr.*, ba.name as bank_account_name, ec.name as category_name
    FROM transactions tr
    LEFT JOIN bank_accounts ba ON ba.id = tr.bank_account_id
    LEFT JOIN expense_categories ec ON ec.id = tr.category_id
    WHERE tr.restaurant_id = ? AND substr(tr.occurred_at, 1, 10) BETWEEN ? AND ?
  `;
  const params = [req.user.restaurant_id, from, to];
  if (type && ['ingreso', 'gasto'].includes(type)) { sql += ' AND tr.type = ?'; params.push(type); }
  if (bank_account_id) { sql += ' AND tr.bank_account_id = ?'; params.push(bank_account_id); }
  sql += ' ORDER BY tr.occurred_at DESC LIMIT 500';

  res.json(await db.all(sql, params));
}));

router.post('/transactions', ah(async (req, res) => {
  const { bank_account_id, category_id, type, description, supplier, amount, occurred_at, receipt_url } = req.body;
  if (!['ingreso', 'gasto'].includes(type)) return res.status(400).json({ error: 'Tipo inválido' });
  if (!amount || amount <= 0) return res.status(400).json({ error: 'El monto debe ser mayor a cero' });

  const id = uuidv4();
  await db.run(`
    INSERT INTO transactions (id, restaurant_id, bank_account_id, category_id, type, description, supplier, amount, source, occurred_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)
  `, [id, req.user.restaurant_id, bank_account_id || null, category_id || null, type,
      description || null, supplier || null, amount, occurred_at || db.nowIso(), req.user.id]);

  res.json(await db.get('SELECT * FROM transactions WHERE id = ?', [id]));
}));

router.delete('/transactions/:id', ah(async (req, res) => {
  const tx = await db.get('SELECT * FROM transactions WHERE id = ? AND restaurant_id = ?', [req.params.id, req.user.restaurant_id]);
  if (!tx) return res.status(404).json({ error: 'No encontrado' });
  if (tx.source === 'venta') return res.status(400).json({ error: 'No se pueden borrar los ingresos automáticos de ventas' });
  await db.run('DELETE FROM transactions WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// ---- Resumen / estado de resultados (P&L) ----
router.get('/summary', ah(async (req, res) => {
  const { from, to } = dateFilter(req);
  const restaurantId = req.user.restaurant_id;

  const totals = await db.get(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'ingreso' THEN amount ELSE 0 END), 0) as total_income,
      COALESCE(SUM(CASE WHEN type = 'gasto' THEN amount ELSE 0 END), 0) as total_expense
    FROM transactions
    WHERE restaurant_id = ? AND substr(occurred_at, 1, 10) BETWEEN ? AND ?
  `, [restaurantId, from, to]);

  const byCategory = await db.all(`
    SELECT COALESCE(ec.name, 'Sin categoría') as category_name, tr.type,
           SUM(tr.amount) as total
    FROM transactions tr
    LEFT JOIN expense_categories ec ON ec.id = tr.category_id
    WHERE tr.restaurant_id = ? AND substr(tr.occurred_at, 1, 10) BETWEEN ? AND ?
    GROUP BY ec.id, ec.name, tr.type
    ORDER BY total DESC
  `, [restaurantId, from, to]);

  const accounts = await db.all('SELECT * FROM bank_accounts WHERE restaurant_id = ?', [restaurantId]);
  const balances = await Promise.all(accounts.map(async (acc) => {
    const movement = await db.get(`
      SELECT COALESCE(SUM(CASE WHEN type = 'ingreso' THEN amount ELSE -amount END), 0) as net
      FROM transactions WHERE bank_account_id = ?
    `, [acc.id]);
    return { ...acc, balance: acc.initial_balance + movement.net };
  }));

  res.json({
    total_income: totals.total_income,
    total_expense: totals.total_expense,
    net_profit: totals.total_income - totals.total_expense,
    by_category: byCategory,
    bank_balances: balances
  });
}));

module.exports = router;
