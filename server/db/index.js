// Capa de acceso a datos: usa PostgreSQL en producción (cuando hay DATABASE_URL)
// y SQLite localmente para desarrollo rápido sin instalar nada.
//
// Expone una API async uniforme (get/all/run/tx) con placeholders "?" estilo
// SQLite; internamente se traducen a "$1, $2, ..." cuando el motor es Postgres.
const path = require('path');
const fs = require('fs');

const usePostgres = !!process.env.DATABASE_URL;

function toPgSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Timestamp portable para usar como parámetro en vez de funciones SQL
// propias de cada motor (datetime('now') en SQLite, now() en Postgres).
function nowIso() {
  return new Date().toISOString();
}

let impl;

if (usePostgres) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
  });

  const schema = fs.readFileSync(path.join(__dirname, 'schema.pg.sql'), 'utf8');
  const ready = pool.query(schema).then(() => {});

  impl = {
    kind: 'postgres',
    ready,
    nowIso,
    async get(sql, params = []) {
      const r = await pool.query(toPgSql(sql), params);
      return r.rows[0];
    },
    async all(sql, params = []) {
      const r = await pool.query(toPgSql(sql), params);
      return r.rows;
    },
    async run(sql, params = []) {
      const r = await pool.query(toPgSql(sql), params);
      return { changes: r.rowCount };
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const t = {
          nowIso,
          async get(sql, params = []) {
            return (await client.query(toPgSql(sql), params)).rows[0];
          },
          async all(sql, params = []) {
            return (await client.query(toPgSql(sql), params)).rows;
          },
          async run(sql, params = []) {
            const r = await client.query(toPgSql(sql), params);
            return { changes: r.rowCount };
          }
        };
        const result = await fn(t);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
  };
} else {
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, 'restaurant.db');
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  sqlite.exec(schema);

  impl = {
    kind: 'sqlite',
    ready: Promise.resolve(),
    nowIso,
    async get(sql, params = []) {
      return sqlite.prepare(sql).get(...params);
    },
    async all(sql, params = []) {
      return sqlite.prepare(sql).all(...params);
    },
    async run(sql, params = []) {
      const r = sqlite.prepare(sql).run(...params);
      return { changes: r.changes };
    },
    // SQLite (better-sqlite3) usa una única conexión síncrona, así que basta
    // envolver la operación en BEGIN/COMMIT y reusar los mismos métodos.
    async tx(fn) {
      sqlite.exec('BEGIN');
      try {
        const result = await fn(impl);
        sqlite.exec('COMMIT');
        return result;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    }
  };
}

module.exports = impl;
