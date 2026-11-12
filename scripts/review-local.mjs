import { spawn } from 'node:child_process';
import pg from 'pg';

// A separate database keeps reviewer standings and reports out of a fresh game.
if (process.env.NODE_ENV === 'production') throw Error('Local review only.');
const port = Number(process.env.REVIEW_PORT || 4340),
  db = process.env.REVIEW_DB || 'penicillion_review';
if (
  !/^penicillion_review(?:_[a-z0-9]+)?$/.test(db) ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65000
)
  throw Error('Invalid local review settings.');
const adminUrl = 'postgresql://penicillion:local-game@127.0.0.1:55442/';
const admin = new pg.Client({ connectionString: adminUrl + 'penicillion' });
await admin.connect();
try {
  if (!(await admin.query('SELECT datname FROM pg_database WHERE datname=$1', [db])).rowCount)
    await admin.query('CREATE DATABASE ' + pg.escapeIdentifier(db));
} finally {
  await admin.end();
}
async function run(file, args = [], env = {}) {
  const child = spawn(file, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (c) => (c === 0 ? resolve() : reject(Error('Child exited ' + c))));
  });
}
await run(process.execPath, ['scripts/migrate.mjs'], { DATABASE_URL: adminUrl + db });
await run(process.execPath, ['scripts/seed.mjs'], { DATABASE_URL: adminUrl + db });
await run('docker', [
  'compose',
  'exec',
  '-T',
  'db',
  'psql',
  '-X',
  '-v',
  'ON_ERROR_STOP=1',
  '-U',
  'penicillion',
  '-d',
  db,
  '-f',
  '/sql/local-access.sql',
]);
const game = spawn(process.execPath, ['scripts/local.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: 'postgresql://night_play:local-play-only@127.0.0.1:55442/' + db,
    CACHE_NAMESPACE: db + ':',
    PUBLIC_ORIGIN: 'http://127.0.0.1:' + port,
  },
});
process.on('SIGINT', () => game.kill('SIGINT'));
process.on('SIGTERM', () => game.kill('SIGTERM'));
game.on('exit', (code) => {
  process.exitCode = code || 0;
});
