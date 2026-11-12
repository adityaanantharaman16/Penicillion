import { readFile } from 'node:fs/promises';
import { pool } from '../server/database.mjs';
import { validateRelease } from '../content/validate.mjs';
import { seed } from '../server/solo/seed.mjs';
try {
  const release = JSON.parse(
    await readFile(new URL('../content/release.json', import.meta.url), 'utf8'),
  );
  validateRelease(release);
  await seed(pool, release, Date.now());
  console.log('Installed ' + release.id + ' and refilled the issue schedule.');
} finally {
  await pool.end();
}
