// Pantallas del sistema y el permiso (módulo, acción) que exige cada una.
// La matriz de permisos vive en el servidor (server/permissions.js) y llega al
// iniciar sesión; aquí solo se decide qué ve cada departamento.
export const SCREENS = [
  { path: '/mesero/mesas', label: '🍽️ Mesas', module: 'mesas' },
  { path: '/cocina', label: '👨‍🍳 Cocina / Bar (KDS)', module: 'kds' },
  { path: '/domicilios', label: '🛵 Domicilios', module: 'delivery' },
  { path: '/admin/reportes', label: '📊 Reportes', module: 'reportes' },
  { path: '/admin/inventario', label: '📦 Almacén', module: 'inventario' },
  { path: '/admin/recetas', label: '📋 Recetas / Costeo', module: 'recetas' },
  { path: '/admin/menu', label: '🍔 Menú', module: 'menu', action: 'crear' },
  { path: '/admin/facturacion', label: '🧾 Facturación', module: 'facturacion' },
  { path: '/admin/contabilidad', label: '💰 Contabilidad', module: 'contabilidad' },
  { path: '/admin/nomina', label: '🧑‍💼 Nómina', module: 'nomina' },
  { path: '/admin/personal', label: '👥 Usuarios y accesos', module: 'usuarios' },
  { path: '/admin/bitacora', label: '🕵️ Bitácora', module: 'bitacora' },
  { path: '/admin/suscripcion', label: '💳 Suscripción', module: 'suscripcion' },
  { path: '/mi-cuenta', label: '🔑 Mi clave / PIN', module: null }
];
