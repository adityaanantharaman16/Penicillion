import pg from 'pg';
import { randomBytes } from 'node:crypto';
export const replicaId = process.env.REPLICA_ID || 'night-' + randomBytes(4).toString('hex');

const production = process.env.NODE_ENV === 'production';
const raw =
  process.env.DATABASE_URL ||
  (!production && 'postgresql://penicillion:local-game@127.0.0.1:55442/penicillion');
if (!raw) throw Error('DATABASE_URL is required.');
const url = new URL(raw);
const tls = production ? { ca: process.env.DATABASE_CA_PEM, rejectUnauthorized: true } : undefined;
if (production) {
  if (
    !tls.ca?.includes('BEGIN CERTIFICATE') ||
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.password.startsWith('local-')
  )
    throw Error(
      'Production requires a private database, independent credentials and the regional RDS CA bundle.',
    );
  // node-postgres connection-string SSL flags override explicit client TLS settings.
  for (const key of ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey'])
    url.searchParams.delete(key);
}
const max = Number(process.env.DB_POOL_SIZE || 16);
if (!Number.isInteger(max) || max < 1 || max > 64) throw Error('DB_POOL_SIZE must be 1–64.');
export const pool = new pg.Pool({
  connectionString: url.href,
  max,
  ssl: tls,
  connectionTimeoutMillis: 4000,
  idleTimeoutMillis: 30000,
  application_name: replicaId,
});
pg.types.setTypeParser(20, Number);
pg.types.setTypeParser(1082, (value) => value);
pool.on('error', () => console.error('An idle database connection closed.'));
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await fn(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
