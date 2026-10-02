// Matriz única de accesos por departamento (rol) × módulo × acción.
// Es la fuente de verdad tanto del backend (middlewares) como del frontend
// (el login devuelve los permisos del rol para pintar el menú y proteger rutas).
//
// Acciones: V=ver, C=crear, E=editar, D=eliminar, A=aprobar, N=anular, X=exportar
// Ajusta aquí la política del negocio; no hace falta tocar las rutas.

const ROLES = [
  'admin',       // dueño / superusuario del sistema
  'gerencia',
  'contaduria',
  'rrhh',        // talento humano / nómina
  'cocina',
  'bar',
  'mesero',      // salón / meseros
  'caja',
  'almacen',     // almacén / compras
  'auditoria'
];

const ROLE_LABELS = {
  admin: 'Administrador (dueño)',
  gerencia: 'Gerencia',
  contaduria: 'Contaduría',
  rrhh: 'Talento Humano / Nómina',
  cocina: 'Cocina',
  bar: 'Bar',
  mesero: 'Salón / Mesero',
  caja: 'Caja',
  almacen: 'Almacén / Compras',
  auditoria: 'Auditoría'
};

const ACTIONS = { V: 'ver', C: 'crear', E: 'editar', D: 'eliminar', A: 'aprobar', N: 'anular', X: 'exportar' };

const ALL = 'VCEDANX';

// módulo -> rol -> acciones permitidas. 'admin' siempre tiene todo.
const MATRIX = {
  // mesas: crear/eliminar = configurar zonas; editar = cambiar estado (por limpiar → libre);
  // aprobar = bloquear mesas y reasignar mesero
  mesas:          { gerencia: ALL, mesero: 'VE', bar: 'VE', caja: 'VE', auditoria: 'VX' },
  pedidos:        { gerencia: ALL, mesero: 'VCE', bar: 'VCE', caja: 'V', auditoria: 'VX' },
  // Cobros: en el MVP el mesero puede cobrar (restaurantes pequeños). Para
  // segregar funciones quita 'C' al mesero y deja el cobro solo en caja.
  cobros:         { gerencia: ALL, caja: 'VCNX', mesero: 'VC', bar: 'VC', contaduria: 'VX', auditoria: 'VX' },
  // Autorizaciones especiales (anulaciones, descuentos, cortesías, cierres) con clave/PIN
  autorizaciones: { gerencia: 'VA', auditoria: 'V' },
  kds:            { gerencia: ALL, cocina: 'VE', bar: 'VE', mesero: 'VE', auditoria: 'V' },
  menu:           { gerencia: ALL, cocina: 'V', bar: 'V', mesero: 'V', caja: 'V', almacen: 'V', contaduria: 'V', auditoria: 'VX' },
  recetas:        { gerencia: ALL, cocina: 'VCE', bar: 'VCE', almacen: 'V', contaduria: 'V', auditoria: 'VX' },
  inventario:     { gerencia: ALL, almacen: 'VCEX', cocina: 'V', bar: 'V', contaduria: 'VX', auditoria: 'VX' },
  nomina:         { gerencia: 'VAX', rrhh: 'VCEAX', contaduria: 'VX', auditoria: 'VX' },
  contabilidad:   { gerencia: 'VAX', contaduria: 'VCEAX', auditoria: 'VX' },
  facturacion:    { gerencia: 'VCEANX', contaduria: 'VCEANX', caja: 'VC', mesero: 'C', auditoria: 'VX' },
  reportes:       { gerencia: 'VX', contaduria: 'VX', caja: 'V', auditoria: 'VX' },
  delivery:       { gerencia: ALL, mesero: 'VCE', caja: 'VCE', auditoria: 'V' },
  usuarios:       { gerencia: 'VCE', rrhh: 'V', auditoria: 'V' },
  bitacora:       { gerencia: 'VX', auditoria: 'VX' },
  cumplimiento:   { gerencia: 'V', contaduria: 'V', auditoria: 'V' },
  suscripcion:    {}
};

function can(role, module, action) {
  if (role === 'admin') return true;
  const letter = Object.keys(ACTIONS).find(k => ACTIONS[k] === action) || action;
  const allowed = (MATRIX[module] && MATRIX[module][role]) || '';
  return allowed.includes(letter);
}

// Permisos del rol en formato { modulo: ['ver','crear',...] } para el frontend
function permissionsFor(role) {
  const out = {};
  for (const module of Object.keys(MATRIX)) {
    const actions = Object.values(ACTIONS).filter(a => can(role, module, a));
    if (actions.length) out[module] = actions;
  }
  return out;
}

module.exports = { ROLES, ROLE_LABELS, ACTIONS, MATRIX, can, permissionsFor };
