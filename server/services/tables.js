// Configuración de zonas y mesas: salón principal (mínimo 30 mesas),
// terraza (configurable, por defecto 10), barra, VIP y delivery.
const { v4: uuidv4 } = require('uuid');

const ZONES = {
  salon:    { label: 'Salón principal', prefix: 'S', defaultCount: 30, minCount: 30, capacity: 4 },
  terraza:  { label: 'Terraza', prefix: 'T', defaultCount: 10, minCount: 0, capacity: 4 },
  barra:    { label: 'Barra', prefix: 'B', defaultCount: 6, minCount: 0, capacity: 1 },
  vip:      { label: 'VIP', prefix: 'V', defaultCount: 0, minCount: 0, capacity: 6 },
  delivery: { label: 'Delivery / Para llevar', prefix: 'D', defaultCount: 0, minCount: 0, capacity: 1 }
};

const TABLE_STATUSES = ['libre', 'ocupada', 'por_limpiar', 'reservada', 'unida', 'bloqueada'];

function tableName(zone, number) {
  return `${ZONES[zone].prefix}${String(number).padStart(2, '0')}`;
}

// Garantiza que cada zona tenga al menos `counts[zone]` mesas activas.
// Nunca borra mesas (tienen historial de ventas): solo crea las faltantes.
async function ensureZoneTables(t, restaurantId, counts = {}) {
  const created = [];
  for (const [zone, cfg] of Object.entries(ZONES)) {
    const wanted = Math.max(cfg.minCount, Number.isFinite(+counts[zone]) ? +counts[zone] : cfg.defaultCount);
    const row = await t.get('SELECT COUNT(*) as n, MAX(number) as maxn FROM tables WHERE restaurant_id = ? AND zone = ?',
      [restaurantId, zone]);
    let n = Number(row.n);
    let next = Number(row.maxn || 0) + 1;
    while (n < wanted) {
      const id = uuidv4();
      await t.run(`
        INSERT INTO tables (id, restaurant_id, name, zone, number, capacity, status)
        VALUES (?, ?, ?, ?, ?, ?, 'libre')
      `, [id, restaurantId, tableName(zone, next), zone, next, cfg.capacity]);
      created.push(id);
      n++; next++;
    }
  }
  return created;
}

module.exports = { ZONES, TABLE_STATUSES, ensureZoneTables, tableName };
