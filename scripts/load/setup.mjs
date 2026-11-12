import pg from 'pg';
import { spawn } from 'node:child_process';
import { open, readFile, mkdir } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { createServer } from 'node:net';
import { migrateSolo, seed } from '../../server/solo/index.mjs';

export async function setup(total, directory, port) {
  if (process.env.NODE_ENV === 'production') throw Error('Run the benchmark locally.');
  const adminUrl = new URL(
    process.env.LOAD_ADMIN_URL || 'postgresql://penicillion:local-game@127.0.0.1:55442/penicillion',
  );
  if (
    !['localhost', '127.0.0.1'].includes(adminUrl.hostname) ||
    adminUrl.pathname !== '/penicillion'
  )
    throw Error('Use the local development PostgreSQL admin URL.');
  const name = 'penicillion_load_' + Date.now(),
    origin = 'http://127.0.0.1:' + port;
  for (const p of [port, port + 1, port + 2]) {
    await new Promise((resolve, reject) => {
      const probe = createServer();
      probe.once('error', () => reject(Error('Local load port ' + p + ' is already in use.')));
      probe.listen(p, '127.0.0.1', () => probe.close(resolve));
    });
  }
  const target = new URL(adminUrl);
  target.pathname = '/' + name;
  const admin = new pg.Pool({ connectionString: adminUrl.href, max: 1 });
  try {
    await admin.query('CREATE DATABASE "' + name + '"');
  } finally {
    await admin.end();
  }
  Object.assign(process.env, {
    DATABASE_URL: target.href,
    PUBLIC_ORIGIN: origin,
    LOCAL_OIDC_ORIGIN: 'http://127.0.0.1:' + (port + 3),
    CACHE_NAMESPACE: name + ':',
    REDIS_URL: 'redis://127.0.0.1:56389',
    EXTERNAL_LOCAL_IDP: '1',
  });
  const { pool } = await import('../../server/core.mjs');
  const { guest } = await import('../../server/identity.mjs');
  await pool.query(await readFile(new URL('../../server/001-core.sql', import.meta.url), 'utf8'));
  await migrateSolo(pool);
  const release = JSON.parse(
    await readFile(new URL('../../content/release.json', import.meta.url), 'utf8'),
  );
  await seed(pool, release, Date.now());
  const gameRole = await pool.query("SELECT 1 FROM pg_roles WHERE rolname='night_play'");
  if (!gameRole.rowCount)
    throw Error('Bootstrap the local game first so its restricted runtime role exists.');
  await pool.query(
    await readFile(new URL('../../ops/runtime-grants.sql', import.meta.url), 'utf8'),
  );
  const workerUrl = new URL(target.href);
  workerUrl.username = 'night_play';
  workerUrl.password = 'local-play-only';
  await mkdir(directory, { recursive: true });
  const logfile = await open(directory + '/workers.log', 'w');
  const supervisor = spawn(process.execPath, ['scripts/local.mjs'], {
    stdio: ['ignore', logfile.fd, logfile.fd],
    env: { ...process.env, DATABASE_URL: workerUrl.href },
  });
  await logfile.close();
  try {
    let ready = false;
    for (let i = 0; i < 80 && !ready; i++) {
      await sleep(250);
      ready = await fetch(origin + '/health/ready').then(
        (r) => r.ok,
        () => false,
      );
    }
    if (!ready)
      throw Error('Load workers did not become ready. Inspect ' + directory + '/workers.log');
    const actors = new Array(total);
    let cursor = 0;
    await Promise.all(
      Array.from({ length: 12 }, async () => {
        while (cursor < actors.length) {
          const i = cursor++;
          let cookie;
          const row = await guest({ setHeader: (_, value) => (cookie = value.split(';')[0]) });
          actors[i] = { id: row.id, cookie, csrf: row.csrf, index: i, last: 0 };
        }
      }),
    );
    return {
      pool,
      release,
      actors,
      origin,
      name,
      supervisor,
      close: async () => {
        supervisor.kill('SIGTERM');
        await pool.end();
      },
    };
  } catch (e) {
    supervisor.kill('SIGTERM');
    await pool.end();
    throw e;
  }
}
