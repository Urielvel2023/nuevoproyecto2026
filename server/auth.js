const jwt = require('jsonwebtoken');
const { can } = require('./permissions');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      restaurant_id: user.restaurant_id,
      role: user.role,
      name: user.name,
      email: user.email
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
  // Un usuario desactivado pierde el acceso de inmediato, aunque su token siga vigente
  const db = require('./db');
  db.get('SELECT active FROM users WHERE id = ?', [payload.id])
    .then((row) => {
      if (!row || row.active === 0 || row.active === false) {
        return res.status(401).json({ error: 'Usuario inactivo' });
      }
      req.user = payload; // { id, restaurant_id, role, name, email }
      next();
    })
    .catch(next);
}

const METHOD_ACTION = { GET: 'ver', POST: 'crear', PUT: 'editar', PATCH: 'editar', DELETE: 'eliminar' };

// Marca a qué módulo de la matriz de accesos pertenece un router (ver index.js).
function moduleGuard(module) {
  return (req, res, next) => { req.permModule = module; next(); };
}

// Compatibilidad con las rutas existentes: requireRole('admin') deja pasar,
// además de los roles listados, a cualquier rol que tenga en la matriz el
// permiso equivalente al método HTTP sobre el módulo del router.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    if (req.user.role === 'admin' || roles.includes(req.user.role)) return next();
    const action = METHOD_ACTION[req.method] || 'ver';
    if (req.permModule && can(req.user.role, req.permModule, action)) return next();
    return res.status(403).json({ error: 'No tienes permiso para esta acción' });
  };
}

function requirePermission(module, action) {
  return (req, res, next) => {
    if (req.user && can(req.user.role, module, action)) return next();
    return res.status(403).json({ error: `Tu rol no puede ${action} en ${module}` });
  };
}

module.exports = { signToken, authMiddleware, requireRole, requirePermission, moduleGuard, JWT_SECRET };
