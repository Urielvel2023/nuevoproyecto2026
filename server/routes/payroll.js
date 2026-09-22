const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const ah = require('../utils/asyncHandler');

const router = express.Router();
router.use(authMiddleware);

// ---- Perfiles de empleado (datos de nómina) ----
router.get('/employees', requireRole('admin'), ah(async (req, res) => {
  const rows = await db.all(`
    SELECT u.id as user_id, u.name, u.email, u.role,
           ep.position, ep.salary_type, ep.base_salary, ep.hire_date, ep.active
    FROM users u
    LEFT JOIN employee_profiles ep ON ep.user_id = u.id
    WHERE u.restaurant_id = ?
    ORDER BY u.name
  `, [req.user.restaurant_id]);
  res.json(rows);
}));

router.put('/employees/:userId', requireRole('admin'), ah(async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = ? AND restaurant_id = ?',
    [req.params.userId, req.user.restaurant_id]);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const { position, salary_type, base_salary, hire_date, active } = req.body;
  const existing = await db.get('SELECT * FROM employee_profiles WHERE user_id = ?', [req.params.userId]);

  if (existing) {
    await db.run(`
      UPDATE employee_profiles SET
        position = COALESCE(?, position), salary_type = COALESCE(?, salary_type),
        base_salary = COALESCE(?, base_salary), hire_date = COALESCE(?, hire_date),
        active = COALESCE(?, active)
      WHERE user_id = ?
    `, [position, salary_type, base_salary, hire_date, active != null ? (active ? 1 : 0) : null, req.params.userId]);
  } else {
    await db.run(`
      INSERT INTO employee_profiles (user_id, restaurant_id, position, salary_type, base_salary, hire_date, active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [req.params.userId, req.user.restaurant_id, position || null, salary_type || 'mensual',
        base_salary || 0, hire_date || null, active != null ? (active ? 1 : 0) : 1]);
  }

  res.json(await db.get('SELECT * FROM employee_profiles WHERE user_id = ?', [req.params.userId]));
}));

// ---- Control de asistencia (el propio usuario marca su entrada/salida) ----
router.get('/attendance/status', ah(async (req, res) => {
  const open = await db.get(`SELECT * FROM attendance_records WHERE user_id = ? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`,
    [req.user.id]);
  res.json({ open: open || null });
}));

router.post('/attendance/clock-in', ah(async (req, res) => {
  const open = await db.get(`SELECT * FROM attendance_records WHERE user_id = ? AND clock_out IS NULL LIMIT 1`, [req.user.id]);
  if (open) return res.status(400).json({ error: 'Ya tienes una entrada abierta' });

  const id = uuidv4();
  await db.run(`INSERT INTO attendance_records (id, restaurant_id, user_id, clock_in) VALUES (?, ?, ?, ?)`,
    [id, req.user.restaurant_id, req.user.id, db.nowIso()]);
  res.json(await db.get('SELECT * FROM attendance_records WHERE id = ?', [id]));
}));

router.post('/attendance/clock-out', ah(async (req, res) => {
  const open = await db.get(`SELECT * FROM attendance_records WHERE user_id = ? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`,
    [req.user.id]);
  if (!open) return res.status(400).json({ error: 'No tienes una entrada abierta' });

  await db.run('UPDATE attendance_records SET clock_out = ? WHERE id = ?', [db.nowIso(), open.id]);
  res.json(await db.get('SELECT * FROM attendance_records WHERE id = ?', [open.id]));
}));

router.get('/attendance', requireRole('admin'), ah(async (req, res) => {
  const { from, to, user_id } = req.query;
  let sql = `
    SELECT ar.*, u.name as user_name FROM attendance_records ar
    JOIN users u ON u.id = ar.user_id
    WHERE ar.restaurant_id = ?
  `;
  const params = [req.user.restaurant_id];
  if (from) { sql += ' AND substr(ar.clock_in, 1, 10) >= ?'; params.push(from); }
  if (to) { sql += ' AND substr(ar.clock_in, 1, 10) <= ?'; params.push(to); }
  if (user_id) { sql += ' AND ar.user_id = ?'; params.push(user_id); }
  sql += ' ORDER BY ar.clock_in DESC LIMIT 500';
  res.json(await db.all(sql, params));
}));

// ---- Períodos de nómina ----
router.get('/periods', requireRole('admin'), ah(async (req, res) => {
  res.json(await db.all('SELECT * FROM payroll_periods WHERE restaurant_id = ? ORDER BY period_start DESC',
    [req.user.restaurant_id]));
}));

router.post('/periods', requireRole('admin'), ah(async (req, res) => {
  const { period_start, period_end } = req.body;
  if (!period_start || !period_end) return res.status(400).json({ error: 'Debes indicar el rango del período' });
  const id = uuidv4();
  await db.run('INSERT INTO payroll_periods (id, restaurant_id, period_start, period_end) VALUES (?, ?, ?, ?)',
    [id, req.user.restaurant_id, period_start, period_end]);
  res.json(await db.get('SELECT * FROM payroll_periods WHERE id = ?', [id]));
}));

router.get('/periods/:id', requireRole('admin'), ah(async (req, res) => {
  const period = await db.get('SELECT * FROM payroll_periods WHERE id = ? AND restaurant_id = ?',
    [req.params.id, req.user.restaurant_id]);
  if (!period) return res.status(404).json({ error: 'No encontrado' });
  const items = await db.all(`
    SELECT pi.*, u.name as user_name FROM payroll_items pi
    JOIN users u ON u.id = pi.user_id
    WHERE pi.period_id = ? ORDER BY u.name
  `, [period.id]);
  res.json({ ...period, items });
}));

// Genera (o regenera) la nómina del período a partir de los perfiles de
// empleado activos y las horas registradas en asistencia. Deducciones por
// defecto tipo Colombia (salud 4% + pensión 4% a cargo del empleado),
// ajustables al momento de generar.
router.post('/periods/:id/generate', requireRole('admin'), ah(async (req, res) => {
  const period = await db.get('SELECT * FROM payroll_periods WHERE id = ? AND restaurant_id = ?',
    [req.params.id, req.user.restaurant_id]);
  if (!period) return res.status(404).json({ error: 'No encontrado' });
  if (period.status === 'pagado') return res.status(400).json({ error: 'Este período ya fue pagado, no se puede regenerar' });

  const { health_pct = 4, pension_pct = 4, bonuses_by_user = {} } = req.body || {};

  const employees = await db.all(`
    SELECT u.id as user_id, ep.salary_type, ep.base_salary
    FROM users u JOIN employee_profiles ep ON ep.user_id = u.id
    WHERE u.restaurant_id = ? AND ep.active = 1
  `, [req.user.restaurant_id]);

  const periodDays = Math.max(1, (new Date(period.period_end) - new Date(period.period_start)) / (1000 * 60 * 60 * 24) + 1);

  await db.tx(async (t) => {
    await t.run('DELETE FROM payroll_items WHERE period_id = ?', [period.id]);

    for (const emp of employees) {
      let workedHours = 0;
      let grossPay = 0;

      if (emp.salary_type === 'por_hora') {
        const records = await t.all(`
          SELECT clock_in, clock_out FROM attendance_records
          WHERE user_id = ? AND clock_out IS NOT NULL
            AND substr(clock_in, 1, 10) BETWEEN ? AND ?
        `, [emp.user_id, period.period_start, period.period_end]);
        workedHours = records.reduce((sum, r) => sum + (new Date(r.clock_out) - new Date(r.clock_in)) / (1000 * 60 * 60), 0);
        grossPay = workedHours * emp.base_salary;
      } else {
        grossPay = emp.base_salary * (periodDays / 30);
      }

      const bonuses = Number(bonuses_by_user[emp.user_id] || 0);
      const deductions = grossPay * ((health_pct + pension_pct) / 100);
      const netPay = grossPay + bonuses - deductions;

      await t.run(`
        INSERT INTO payroll_items (id, period_id, user_id, worked_hours, gross_pay, deductions, bonuses, net_pay, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [uuidv4(), period.id, emp.user_id, workedHours, grossPay, deductions, bonuses, netPay,
          JSON.stringify({ health_pct, pension_pct, salary_type: emp.salary_type })]);
    }
  });

  const items = await db.all(`
    SELECT pi.*, u.name as user_name FROM payroll_items pi
    JOIN users u ON u.id = pi.user_id
    WHERE pi.period_id = ? ORDER BY u.name
  `, [period.id]);
  res.json({ ...period, items });
}));

router.put('/periods/:id/status', requireRole('admin'), ah(async (req, res) => {
  const { status } = req.body;
  if (!['abierto', 'pagado'].includes(status)) return res.status(400).json({ error: 'Estado inválido' });
  await db.run('UPDATE payroll_periods SET status = ? WHERE id = ? AND restaurant_id = ?',
    [status, req.params.id, req.user.restaurant_id]);
  res.json(await db.get('SELECT * FROM payroll_periods WHERE id = ?', [req.params.id]));
}));

module.exports = router;
