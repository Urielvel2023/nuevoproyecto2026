const jwt = require('jsonwebtoken');
const { can } = require('./permissions');

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  // Con una clave por defecto cualquiera podría falsificar sesiones de otros restaurantes
  throw new Error('JWT_SECRET es obligatorio en producción (mínimo 32 caracteres)');
}
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
  // Se consulta el usuario en cada petición: si lo desactivan o le cambian el
  // rol, el cambio aplica de inmediato aunque su token siga vigente.
  const db = require('./db');
  db.get('SELECT active, role FROM users WHERE id = ? AND restaurant_id = ?', [payload.id, payload.restaurant_id])
    .then((row) => {
      if (!row || row.active === 0 || row.active === false) {
        return res.status(401).json({ error: 'Usuario inactivo' });
      }
      req.user = { ...payload, role: row.role }; // { id, restaurant_id, role, name, email }
      next();
    })
    .catch(next);
}

const METHOD_ACTION = { GET: 'ver', POST: 'crear', PUT: 'editar', PATCH: 'editar', DELETE: 'eliminar' };

// Marca a qué módulo de la matriz de accesos pertenece un router (ver index.js).
function moduleGuard(module) {
  return (req, res, next) => { req.permModule = module; next(); };
}

// Solo los roles listados (y admin). Para rutas que de verdad son exclusivas.
function requireRole(...roles) {
  return (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || roles.includes(req.user.role))) return next();
    return res.status(403).json({ error: 'No tienes permiso para esta acción' });
  };
}

// Rutas de departamento: autoriza según la matriz, usando el módulo del router
// (moduleGuard) y la acción equivalente al método HTTP. Solo para rutas donde
// "crear/editar/eliminar/ver" es lo que de verdad pasa; anular, aprobar o ver
// secretos usan requirePermission con la acción explícita.
function requireModule() {
  return (req, res, next) => {
    const action = METHOD_ACTION[req.method] || 'ver';
    if (req.user && req.permModule && can(req.user.role, req.permModule, action)) return next();
    return res.status(403).json({ error: 'No tienes permiso para esta acción' });
  };
}

function requirePermission(module, action) {
  return (req, res, next) => {
    if (req.user && can(req.user.role, module, action)) return next();
    return res.status(403).json({ error: `Tu rol no puede ${action} en ${module}` });
  };
}

module.exports = { signToken, authMiddleware, requireRole, requireModule, requirePermission, moduleGuard, JWT_SECRET };
