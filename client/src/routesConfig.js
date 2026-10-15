// Pantallas del sistema y el permiso (módulo, acción) que exige cada una.
// La matriz de permisos vive en el servidor (server/permissions.js) y llega al
// iniciar sesión; aquí solo se decide qué ve cada departamento.
export const SCREENS = [
  { path: '/app/mesero/mesas', label: '🍽️ Mesas', module: 'mesas' },
  { path: '/app/cocina', label: '👨‍🍳 Cocina / Bar (KDS)', module: 'kds' },
  { path: '/app/domicilios', label: '🛵 Domicilios', module: 'delivery' },
  { path: '/app/admin/reportes', label: '📊 Reportes', module: 'reportes' },
  { path: '/app/admin/inventario', label: '📦 Almacén', module: 'inventario' },
  { path: '/app/admin/recetas', label: '📋 Recetas / Costeo', module: 'recetas' },
  { path: '/app/admin/menu', label: '🍔 Menú', module: 'menu', action: 'crear' },
  { path: '/app/admin/facturacion', label: '🧾 Facturación', module: 'facturacion' },
  { path: '/app/admin/contabilidad', label: '💰 Contabilidad', module: 'contabilidad' },
  { path: '/app/admin/nomina', label: '🧑‍💼 Nómina', module: 'nomina' },
  { path: '/app/admin/personal', label: '👥 Usuarios y accesos', module: 'usuarios' },
  { path: '/app/admin/configuracion', label: '⚙️ Configuración', module: 'configuracion' },
  { path: '/app/admin/cumplimiento', label: '⚖️ Cumplimiento legal', module: 'cumplimiento' },
  { path: '/app/admin/bitacora', label: '🕵️ Bitácora', module: 'bitacora' },
  { path: '/app/admin/suscripcion', label: '💳 Suscripción', module: 'suscripcion' },
  { path: '/app/mi-cuenta', label: '🔑 Mi clave / PIN', module: null }
];
