// Bitácora de auditoría (quién, qué, cuándo, desde dónde, antes/después) y
// claves de autorización especial (PIN de supervisor) para anulaciones,
// descuentos, cortesías y cierres.
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { can } = require('../permissions');

async function audit(db, req, { action, entity = null, entityId = null, before = null, after = null, authorizedBy = null, user = null }) {
  const u = user || req.user || {};
  try {
    await db.run(`
      INSERT INTO audit_log (id, restaurant_id, user_id, user_name, user_role, action, entity, entity_id,
                             before_data, after_data, authorized_by, ip, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      uuidv4(), u.restaurant_id, u.id || null, u.name || null, u.role || null, action, entity, entityId,
      before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, authorizedBy,
      req ? (req.headers['x-forwarded-for'] || req.ip || null) : null,
      req ? (req.headers['user-agent'] || null) : null,
      new Date().toISOString()
    ]);
  } catch (e) {
    // La bitácora nunca debe tumbar la operación, pero sí dejar rastro en logs
    console.error('No se pudo escribir en la bitácora:', e.message);
  }
}

// Valida un PIN de autorización: debe pertenecer a un usuario activo del
// mismo restaurante cuyo rol tenga permiso "aprobar" en "autorizaciones".
// Devuelve el usuario autorizador o null.
async function verifyAuthorizationPin(db, restaurantId, pin) {
  if (!pin) return null;
  const candidates = await db.all(
    'SELECT id, name, role, auth_pin_hash FROM users WHERE restaurant_id = ? AND active = 1 AND auth_pin_hash IS NOT NULL',
    [restaurantId]
  );
  for (const c of candidates) {
    if (can(c.role, 'autorizaciones', 'aprobar') && bcrypt.compareSync(String(pin), c.auth_pin_hash)) {
      return { id: c.id, name: c.name, role: c.role };
    }
  }
  return null;
}

// Lanza 403 con un mensaje claro si la autorización no es válida.
async function requireAuthorization(db, req, pin) {
  // Un usuario con permiso de aprobar se autoriza a sí mismo sin PIN
  if (can(req.user.role, 'autorizaciones', 'aprobar')) return { id: req.user.id, name: req.user.name, role: req.user.role };
  const approver = await verifyAuthorizationPin(db, req.user.restaurant_id, pin);
  if (!approver) {
    await audit(db, req, { action: 'autorizacion_rechazada' });
    const err = new Error('Se requiere clave de autorización de un supervisor válida');
    err.status = 403;
    throw err;
  }
  return approver;
}

module.exports = { audit, verifyAuthorizationPin, requireAuthorization };
