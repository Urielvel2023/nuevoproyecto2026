const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { signToken, authMiddleware, requirePermission } = require('../auth');
const { ROLES, ROLE_LABELS, permissionsFor } = require('../permissions');
const { audit } = require('../services/audit');
const { ensureZoneTables } = require('../services/tables');
const { getCountry, LEGAL_VERSION } = require('../compliance');
const { trialEndDate } = require('../services/billing');
const ah = require('../utils/asyncHandler');

const router = express.Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const PASSWORD_MAX_AGE_DAYS = Number(process.env.PASSWORD_MAX_AGE_DAYS || 90);
const MIN_PASSWORD_LENGTH = 8;

function publicUser(u) {
  return { id: u.id, restaurant_id: u.restaurant_id, role: u.role, name: u.name, email: u.email };
}

function sessionPayload(u) {
  const changedAt = u.password_changed_at || u.created_at;
  const ageDays = changedAt ? (Date.now() - new Date(changedAt.replace(' ', 'T')).getTime()) / 86400000 : 0;
  return {
    token: signToken(u),
    user: publicUser(u),
    permissions: permissionsFor(u.role),
    password_expired: PASSWORD_MAX_AGE_DAYS > 0 && ageDays > PASSWORD_MAX_AGE_DAYS,
    has_pin: !!u.auth_pin_hash
  };
}

// Registrar un nuevo restaurante (tenant) + su usuario admin
router.post('/register-restaurant', ah(async (req, res) => {
  const { restaurantName, country, currency, currencySymbol, taxName, taxRate,
          adminName, email, password, terraceTables, acceptTerms } = req.body;

  if (!restaurantName || !adminName || !email || !password) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }
  if (acceptTerms !== true) {
    return res.status(400).json({ error: 'Debes aceptar los términos, la política de privacidad y la responsabilidad de cumplir la ley de tu país' });
  }
  // Valores por defecto según el perfil legal del país (configurables después)
  const profile = getCountry(country) || getCountry('OTHER');
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` });
  }

  const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) return res.status(409).json({ error: 'Ese correo ya está registrado' });

  const restaurantId = uuidv4();
  const userId = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);
  const now = db.nowIso();

  await db.tx(async (t) => {
    await t.run(`
      INSERT INTO restaurants (id, name, country, currency, currency_symbol, tax_name, tax_rate,
                               legal_version, legal_accepted_at, legal_accepted_by, legal_accepted_ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      restaurantId, restaurantName,
      profile.code, currency || profile.currency, currencySymbol || profile.symbol,
      taxName || profile.tax_name, taxRate != null ? taxRate : profile.tax_rate,
      LEGAL_VERSION, now, userId, req.headers['x-forwarded-for'] || req.ip || null
    ]);

    await t.run(`
      INSERT INTO users (id, restaurant_id, name, email, password_hash, role, password_changed_at)
      VALUES (?, ?, ?, ?, ?, 'admin', ?)
    `, [userId, restaurantId, adminName, email, passwordHash, now]);

    // Suscripción de prueba (28 días por defecto, TRIAL_DAYS en services/billing.js)
    const trialEndsAt = trialEndDate();
    await t.run(`
      INSERT INTO platform_subscriptions (restaurant_id, plan, status, trial_ends_at)
      VALUES (?, 'trial', 'trialing', ?)
    `, [restaurantId, trialEndsAt]);

    // Salón principal con 30 mesas, terraza (10 por defecto) y barra
    await ensureZoneTables(t, restaurantId, { terraza: terraceTables });
  });

  const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  await audit(db, req, { action: 'restaurante_registrado', entity: 'restaurants', entityId: restaurantId, user });
  res.json(sessionPayload(user));
}));

// Login con bloqueo temporal tras varios intentos fallidos
router.post('/login', ah(async (req, res) => {
  const { email, password } = req.body;
  const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

  if (!user.active) {
    await audit(db, req, { action: 'login_usuario_inactivo', entity: 'users', entityId: user.id, user });
    return res.status(403).json({ error: 'Usuario desactivado. Contacta a gerencia.' });
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return res.status(423).json({ error: `Usuario bloqueado por intentos fallidos hasta ${new Date(user.locked_until).toLocaleTimeString()}` });
  }

  const ok = bcrypt.compareSync(password || '', user.password_hash);
  if (!ok) {
    const attempts = (user.failed_attempts || 0) + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS
      ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null;
    await db.run('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?',
      [lock ? 0 : attempts, lock, user.id]);
    await audit(db, req, { action: lock ? 'usuario_bloqueado' : 'login_fallido', entity: 'users', entityId: user.id, user });
    return res.status(401).json({
      error: lock
        ? `Demasiados intentos. Usuario bloqueado ${LOCK_MINUTES} minutos.`
        : 'Credenciales inválidas'
    });
  }

  await db.run('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?',
    [db.nowIso(), user.id]);
  await audit(db, req, { action: 'login_ok', entity: 'users', entityId: user.id, user });
  res.json(sessionPayload(user));
}));

router.use(authMiddleware);

// Sesión actual (permisos frescos sin volver a iniciar sesión)
router.get('/me', ah(async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  const { token, ...rest } = sessionPayload(user);
  res.json(rest);
}));

router.get('/roles', (req, res) => {
  res.json(ROLES.map(r => ({ role: r, label: ROLE_LABELS[r], permissions: permissionsFor(r) })));
});

// Cambiar mi contraseña (también renueva la expiración)
router.put('/me/password', ah(async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!new_password || new_password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` });
  }
  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!bcrypt.compareSync(current_password || '', user.password_hash)) {
    return res.status(401).json({ error: 'La contraseña actual no es correcta' });
  }
  await db.run('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?',
    [bcrypt.hashSync(new_password, 10), db.nowIso(), user.id]);
  await audit(db, req, { action: 'password_cambiada', entity: 'users', entityId: user.id });
  res.json({ ok: true });
}));

// Definir mi clave de autorización especial (PIN de supervisor, 4-8 dígitos).
// Solo es útil para roles con permiso de aprobar autorizaciones.
router.put('/me/pin', ah(async (req, res) => {
  const { pin, current_password } = req.body;
  if (!/^\d{4,8}$/.test(String(pin || ''))) return res.status(400).json({ error: 'El PIN debe tener entre 4 y 8 dígitos' });
  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!bcrypt.compareSync(current_password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Confirma con tu contraseña actual' });
  }
  await db.run('UPDATE users SET auth_pin_hash = ? WHERE id = ?', [bcrypt.hashSync(String(pin), 10), user.id]);
  await audit(db, req, { action: 'pin_autorizacion_definido', entity: 'users', entityId: user.id });
  res.json({ ok: true });
}));

// ---- Gestión de usuarios por departamento ----
router.get('/staff', requirePermission('usuarios', 'ver'), ah(async (req, res) => {
  const rows = await db.all(`
    SELECT id, name, email, role, active, last_login_at, locked_until, created_at,
           CASE WHEN auth_pin_hash IS NULL THEN 0 ELSE 1 END as has_pin
    FROM users WHERE restaurant_id = ? ORDER BY role, name
  `, [req.user.restaurant_id]);
  res.json(rows);
}));

router.post('/create-staff', requirePermission('usuarios', 'crear'), ah(async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!ROLES.includes(role) || role === 'admin') return res.status(400).json({ error: 'Rol inválido' });
  if (role === 'gerencia' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Solo el administrador puede crear usuarios de gerencia' });
  }
  if (!name || !email || !password || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Nombre, correo y contraseña (mín. ${MIN_PASSWORD_LENGTH} caracteres) son requeridos` });
  }
  const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) return res.status(409).json({ error: 'Ese correo ya está registrado' });

  const id = uuidv4();
  await db.run(`
    INSERT INTO users (id, restaurant_id, name, email, password_hash, role, password_changed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [id, req.user.restaurant_id, name, email, bcrypt.hashSync(password, 10), role, db.nowIso()]);
  await audit(db, req, { action: 'usuario_creado', entity: 'users', entityId: id, after: { name, email, role } });
  res.json({ id, name, email, role, active: 1 });
}));

// Activar/desactivar, cambiar rol o desbloquear un usuario
router.put('/staff/:id', requirePermission('usuarios', 'editar'), ah(async (req, res) => {
  const target = await db.get('SELECT * FROM users WHERE id = ? AND restaurant_id = ?', [req.params.id, req.user.restaurant_id]);
  if (!target) return res.status(404).json({ error: 'No encontrado' });
  if (target.role === 'admin' || target.id === req.user.id) {
    return res.status(403).json({ error: 'No puedes modificar este usuario desde aquí' });
  }
  const { active, role, unlock } = req.body;
  if (role && (!ROLES.includes(role) || role === 'admin')) return res.status(400).json({ error: 'Rol inválido' });
  if ((role === 'gerencia' || target.role === 'gerencia') && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Solo el administrador gestiona usuarios de gerencia' });
  }
  await db.run(`
    UPDATE users SET active = COALESCE(?, active), role = COALESCE(?, role),
      locked_until = CASE WHEN ? = 1 THEN NULL ELSE locked_until END,
      failed_attempts = CASE WHEN ? = 1 THEN 0 ELSE failed_attempts END
    WHERE id = ?
  `, [active == null ? null : (active ? 1 : 0), role || null, unlock ? 1 : 0, unlock ? 1 : 0, target.id]);
  const after = await db.get('SELECT id, name, email, role, active FROM users WHERE id = ?', [target.id]);
  await audit(db, req, {
    action: 'usuario_modificado', entity: 'users', entityId: target.id,
    before: { role: target.role, active: target.active }, after: { role: after.role, active: after.active }
  });
  res.json(after);
}));

// Bitácora de auditoría
router.get('/audit-log', requirePermission('bitacora', 'ver'), ah(async (req, res) => {
  const rows = await db.all(`
    SELECT * FROM audit_log WHERE restaurant_id = ? ORDER BY created_at DESC LIMIT 300
  `, [req.user.restaurant_id]);
  res.json(rows);
}));

module.exports = router;
