import { readFile } from 'node:fs/promises';
import { pool } from '../server/database.mjs';
try {
  await pool.query(await readFile(new URL('../ops/runtime-grants.sql', import.meta.url), 'utf8'));
  console.log('Applied runtime-role grants.');
} finally {
  await pool.end();
}
