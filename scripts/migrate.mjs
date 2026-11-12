import { readFile } from 'node:fs/promises';
import { pool, transaction } from '../server/database.mjs';
import { migrateSolo } from '../server/solo/seed.mjs';
try {
  const sql = await readFile(new URL('../server/001-core.sql', import.meta.url), 'utf8');
  await transaction(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(22474401)');
    await c.query(sql);
  });
  await migrateSolo(pool);
  console.log('Night Culture database migrations applied.');
} finally {
  await pool.end();
}
