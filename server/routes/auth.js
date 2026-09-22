const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { signToken, authMiddleware, requireRole } = require('../auth');
const ah = require('../utils/asyncHandler');

const router = express.Router();

// Registrar un nuevo restaurante (tenant) + su usuario admin
router.post('/register-restaurant', ah(async (req, res) => {
  const { restaurantName, country, currency, currencySymbol, taxName, taxRate,
          adminName, email, password } = req.body;

  if (!restaurantName || !adminName || !email || !password) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) return res.status(409).json({ error: 'Ese correo ya está registrado' });

  const restaurantId = uuidv4();
  const userId = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);

  await db.tx(async (t) => {
    await t.run(`
      INSERT INTO restaurants (id, name, country, currency, currency_symbol, tax_name, tax_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      restaurantId, restaurantName,
      country || 'CO', currency || 'COP', currencySymbol || '$',
      taxName || 'IVA', taxRate != null ? taxRate : 0
    ]);

    await t.run(`
      INSERT INTO users (id, restaurant_id, name, email, password_hash, role)
      VALUES (?, ?, ?, ?, ?, 'admin')
    `, [userId, restaurantId, adminName, email, passwordHash]);

    // Suscripción de prueba de 14 días por defecto (ver server/routes/billing.js)
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    await t.run(`
      INSERT INTO platform_subscriptions (restaurant_id, plan, status, trial_ends_at)
      VALUES (?, 'trial', 'trialing', ?)
    `, [restaurantId, trialEndsAt]);

    // Mesas de ejemplo para empezar rápido
    for (const name of ['Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Barra 1']) {
      await t.run('INSERT INTO tables (id, restaurant_id, name) VALUES (?, ?, ?)', [uuidv4(), restaurantId, name]);
    }
  });

  const user = { id: userId, restaurant_id: restaurantId, role: 'admin', name: adminName, email };
  const token = signToken(user);
  res.json({ token, user });
}));

// Login
router.post('/login', ah(async (req, res) => {
  const { email, password } = req.body;
  const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, restaurant_id: user.restaurant_id, role: user.role, name: user.name, email: user.email }
  });
}));

// Admin crea usuarios adicionales (mesero, cocina) para su restaurante
router.post('/create-staff', authMiddleware, requireRole('admin'), ah(async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!['mesero', 'cocina'].includes(role)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }
  const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) return res.status(409).json({ error: 'Ese correo ya está registrado' });

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);
  await db.run(`
    INSERT INTO users (id, restaurant_id, name, email, password_hash, role)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, req.user.restaurant_id, name, email, passwordHash, role]);

  res.json({ id, name, email, role });
}));

module.exports = router;
