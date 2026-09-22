const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { signToken } = require('../auth');

const router = express.Router();

// Registrar un nuevo restaurante (tenant) + su usuario admin
router.post('/register-restaurant', (req, res) => {
  const { restaurantName, country, currency, currencySymbol, taxName, taxRate,
          adminName, email, password } = req.body;

  if (!restaurantName || !adminName || !email || !password) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Ese correo ya está registrado' });

  const restaurantId = uuidv4();
  const userId = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO restaurants (id, name, country, currency, currency_symbol, tax_name, tax_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      restaurantId, restaurantName,
      country || 'CO', currency || 'COP', currencySymbol || '$',
      taxName || 'IVA', taxRate != null ? taxRate : 0
    );

    db.prepare(`
      INSERT INTO users (id, restaurant_id, name, email, password_hash, role)
      VALUES (?, ?, ?, ?, ?, 'admin')
    `).run(userId, restaurantId, adminName, email, passwordHash);

    // Mesas de ejemplo para empezar rápido
    ['Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Barra 1'].forEach(name => {
      db.prepare('INSERT INTO tables (id, restaurant_id, name) VALUES (?, ?, ?)')
        .run(uuidv4(), restaurantId, name);
    });
  });
  tx();

  const user = { id: userId, restaurant_id: restaurantId, role: 'admin', name: adminName, email };
  const token = signToken(user);
  res.json({ token, user });
});

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, restaurant_id: user.restaurant_id, role: user.role, name: user.name, email: user.email }
  });
});

// Admin crea usuarios adicionales (mesero, cocina) para su restaurante
router.post('/create-staff', require('../auth').authMiddleware, require('../auth').requireRole('admin'), (req, res) => {
  const { name, email, password, role } = req.body;
  if (!['mesero', 'cocina'].includes(role)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Ese correo ya está registrado' });

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare(`
    INSERT INTO users (id, restaurant_id, name, email, password_hash, role)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.user.restaurant_id, name, email, passwordHash, role);

  res.json({ id, name, email, role });
});

module.exports = router;
