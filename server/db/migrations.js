// Migraciones versionadas. schema.sql / schema.pg.sql crean la base inicial
// (CREATE TABLE IF NOT EXISTS) y aquí se aplican, una sola vez y en orden,
// los cambios posteriores sobre bases ya existentes. Cada migración queda
// registrada en schema_migrations.
//
// SQLite no permite cambiar un CHECK con ALTER TABLE, así que en ese motor
// las tablas afectadas se reconstruyen (crear nueva → copiar → renombrar).

const ROLES_SQL = `'admin','gerencia','contaduria','rrhh','cocina','bar','mesero','caja','almacen','auditoria'`;
const TABLE_STATUS_SQL = `'libre','ocupada','por_limpiar','reservada','unida','bloqueada'`;

// Columnas nuevas comunes a ambos motores ({REAL} se traduce por motor)
const NEW_COLUMNS = [
  ['restaurants', 'tip_suggested_pct', '{REAL} NOT NULL DEFAULT 10'],
  ['restaurants', 'prices_include_tax', 'INTEGER NOT NULL DEFAULT 0'],
  ['orders', 'guests', 'INTEGER NOT NULL DEFAULT 1'],
  ['orders', 'discount_type', 'TEXT'],                 // porcentaje | monto | cortesia
  ['orders', 'discount_value', '{REAL} NOT NULL DEFAULT 0'],
  ['orders', 'discount_reason', 'TEXT'],
  ['orders', 'discount_authorized_by', 'TEXT'],
  ['orders', 'tip_amount', '{REAL} NOT NULL DEFAULT 0'],
  ['orders', 'closed_by', 'TEXT'],
  ['order_items', 'notes', 'TEXT'],                    // modificadores: "sin cebolla", "término medio"
  ['order_items', 'seat', 'INTEGER'],                  // comensal (para dividir la cuenta)
  ['order_items', 'status', `TEXT NOT NULL DEFAULT 'activo'`], // activo | anulado
  ['order_items', 'cost_snapshot', '{REAL}'],          // costo teórico de receta al vender
  ['order_items', 'void_reason', 'TEXT'],
  ['order_items', 'voided_by', 'TEXT'],
  ['order_items', 'void_authorized_by', 'TEXT'],
  ['order_items', 'voided_at', 'TEXT']
];

const NEW_TABLES = `
CREATE TABLE IF NOT EXISTS order_payments (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  method TEXT NOT NULL,          -- efectivo | tarjeta_debito | tarjeta_credito | transferencia | pago_movil | divisas | otro
  amount {REAL} NOT NULL,         -- aplicado a la cuenta (sin propina)
  tip_amount {REAL} NOT NULL DEFAULT 0,
  reference TEXT,
  payer_label TEXT,              -- "Comensal 2", "Parte 1/3", etc.
  received_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  user_id TEXT,
  user_name TEXT,
  user_role TEXT,
  action TEXT NOT NULL,          -- login_ok, login_fallido, item_anulado, descuento, mesa_transferida...
  entity TEXT,
  entity_id TEXT,
  before_data TEXT,              -- JSON
  after_data TEXT,               -- JSON
  authorized_by TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_restaurant ON audit_log(restaurant_id, created_at);
`;

function sqliteRebuild(sqlite, table, createSql, columns) {
  sqlite.exec(createSql.replace(`CREATE TABLE ${table} (`, `CREATE TABLE ${table}__new (`));
  sqlite.exec(`INSERT INTO ${table}__new (${columns}) SELECT ${columns} FROM ${table}`);
  sqlite.exec(`DROP TABLE ${table}`);
  sqlite.exec(`ALTER TABLE ${table}__new RENAME TO ${table}`);
}

const migrations = [
  {
    id: '001_mesas_zonas_seguridad_pagos',
    sqlite(sqlite) {
      sqliteRebuild(sqlite, 'users', `
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN (${ROLES_SQL})),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          active INTEGER NOT NULL DEFAULT 1,
          failed_attempts INTEGER NOT NULL DEFAULT 0,
          locked_until TEXT,
          auth_pin_hash TEXT,
          password_changed_at TEXT,
          last_login_at TEXT
        )`, 'id, restaurant_id, name, email, password_hash, role, created_at');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_users_restaurant ON users(restaurant_id)');

      sqliteRebuild(sqlite, 'tables', `
        CREATE TABLE tables (
          id TEXT PRIMARY KEY,
          restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
          name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'libre' CHECK (status IN (${TABLE_STATUS_SQL})),
          zone TEXT NOT NULL DEFAULT 'salon',
          number INTEGER,
          capacity INTEGER NOT NULL DEFAULT 4,
          assigned_waiter_id TEXT REFERENCES users(id),
          merged_into TEXT,
          occupied_since TEXT,
          active INTEGER NOT NULL DEFAULT 1
        )`, 'id, restaurant_id, name, status');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_tables_restaurant ON tables(restaurant_id)');

      for (const [table, col, type] of NEW_COLUMNS) {
        sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type.replace('{REAL}', 'REAL')}`);
      }
      sqlite.exec(NEW_TABLES.replace(/\{REAL\}/g, 'REAL'));
    },
    pg: `
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (${ROLES_SQL}));
      ALTER TABLE users ADD COLUMN IF NOT EXISTS active INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_pin_hash TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TEXT;

      ALTER TABLE tables DROP CONSTRAINT IF EXISTS tables_status_check;
      ALTER TABLE tables ADD CONSTRAINT tables_status_check CHECK (status IN (${TABLE_STATUS_SQL}));
      ALTER TABLE tables ADD COLUMN IF NOT EXISTS zone TEXT NOT NULL DEFAULT 'salon';
      ALTER TABLE tables ADD COLUMN IF NOT EXISTS number INTEGER;
      ALTER TABLE tables ADD COLUMN IF NOT EXISTS capacity INTEGER NOT NULL DEFAULT 4;
      ALTER TABLE tables ADD COLUMN IF NOT EXISTS assigned_waiter_id TEXT REFERENCES users(id);
      ALTER TABLE tables ADD COLUMN IF NOT EXISTS merged_into TEXT;
      ALTER TABLE tables ADD COLUMN IF NOT EXISTS occupied_since TEXT;
      ALTER TABLE tables ADD COLUMN IF NOT EXISTS active INTEGER NOT NULL DEFAULT 1;

      ${NEW_COLUMNS.map(([t, c, type]) =>
        `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS ${c} ${type.replace('{REAL}', 'DOUBLE PRECISION')};`).join('\n')}
      ${NEW_TABLES.replace(/\{REAL\}/g, 'DOUBLE PRECISION')}
    `
  },
  {
    // Aceptación de términos, privacidad y responsabilidad legal local
    id: '002_cumplimiento_legal',
    sqlite(sqlite) {
      for (const col of ['legal_version TEXT', 'legal_accepted_at TEXT', 'legal_accepted_by TEXT', 'legal_accepted_ip TEXT']) {
        sqlite.exec(`ALTER TABLE restaurants ADD COLUMN ${col}`);
      }
    },
    pg: `
      ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS legal_version TEXT;
      ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS legal_accepted_at TEXT;
      ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS legal_accepted_by TEXT;
      ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS legal_accepted_ip TEXT;
    `
  }
];

async function runSqliteMigrations(sqlite) {
  sqlite.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(sqlite.prepare('SELECT id FROM schema_migrations').all().map(r => r.id));
  for (const m of migrations) {
    if (applied.has(m.id)) continue;
    // Las FK se desactivan fuera de la transacción para poder reconstruir tablas
    sqlite.pragma('foreign_keys = OFF');
    try {
      sqlite.transaction(() => {
        m.sqlite(sqlite);
        const broken = sqlite.prepare('PRAGMA foreign_key_check').all();
        if (broken.length) throw new Error(`Migración ${m.id}: claves foráneas rotas`);
        sqlite.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(m.id, new Date().toISOString());
      })();
    } finally {
      sqlite.pragma('foreign_keys = ON');
    }
    console.log(`Migración aplicada: ${m.id}`);
  }
}

async function runPgMigrations(pool) {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const { rows } = await pool.query('SELECT id FROM schema_migrations');
  const applied = new Set(rows.map(r => r.id));
  for (const m of migrations) {
    if (applied.has(m.id)) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(m.pg);
      await client.query('INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2)', [m.id, new Date().toISOString()]);
      await client.query('COMMIT');
      console.log(`Migración aplicada: ${m.id}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

module.exports = { migrations, runSqliteMigrations, runPgMigrations };
