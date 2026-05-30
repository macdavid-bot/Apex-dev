import pg from 'pg';
const { Pool } = pg;

let _pool = null;

export function getPool() {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set — point it to your VPS PostgreSQL instance (e.g. postgresql://user:pass@your-vps-ip:5432/apexdev)');
    _pool = new Pool({
      connectionString: url,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
    _pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message);
    });
  }
  return _pool;
}

export async function query(sql, params = []) {
  return getPool().query(sql, params);
}

export async function queryOne(sql, params = []) {
  const result = await getPool().query(sql, params);
  return result.rows[0] || null;
}

export async function dbAvailable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await getPool().query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
