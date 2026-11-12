// Local logical restore drill with two fresh, disposable databases.
// The live game's tables are never read, copied, or replaced.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import assert from 'node:assert/strict';
import pg from 'pg';
import { migrateSolo, seed, makeSolo } from '../server/solo/index.mjs';

if (process.env.NODE_ENV === 'production')
  throw Error('Use the managed RDS restore procedure for hosted data.');
const port = Number(process.env.GAME_DB_PORT || 55442);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error('Invalid local database port.');
const prefix = 'postgresql://penicillion:local-game@127.0.0.1:' + port + '/';
const admin = new pg.Pool({ connectionString: prefix + 'postgres', max: 1 }),
  created = [],
  pools = [];
const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
async function fresh(label) {
  const name = 'penicillion_drill_' + label + '_' + suffix;
  await admin.query('CREATE DATABASE ' + pg.escapeIdentifier(name));
  created.push(name);
  const pool = new pg.Pool({ connectionString: prefix + name, max: 2 });
  pools.push(pool);
  return { name, pool };
}
function complete(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(Error('Backup tool exited ' + code)),
    );
  });
}
try {
  const source = await fresh('source'),
    restored = await fresh('restore');
  const release = JSON.parse(
    await readFile(new URL('../content/release.json', import.meta.url), 'utf8'),
  );
  await source.pool.query(
    await readFile(new URL('../server/001-core.sql', import.meta.url), 'utf8'),
  );
  await migrateSolo(source.pool);
  await seed(source.pool, release);
  const actor = randomUUID(),
    now = Date.now();
  await source.pool.query("INSERT INTO principals(id,kind,created_at) VALUES($1,'guest',$2)", [
    actor,
    now,
  ]);
  const solo = makeSolo(source.pool);
  async function post(path, body) {
    return solo.handle({
      actorId: actor,
      path,
      method: 'POST',
      now,
      body: { ...body, commandId: randomUUID() },
    });
  }
  let run = await post('/api/runs', { mode: 'daily' });
  const runPath = '/api/runs/' + run.id;
  for (let i = 0; i < 7; i++) {
    const prompt = release.prompts.find((p) => p.text === run.prompt);
    run = await post(runPath + '/answer', { roundId: run.roundId, answer: prompt.answers[0].term });
    run = await post(runPath + '/next', { roundId: run.roundId });
  }
  assert.equal(run.phase, 'recap');
  const start = performance.now();
  const dump = spawn(
    'docker',
    ['compose', 'exec', '-T', 'db', 'pg_dump', '-U', 'penicillion', '-d', source.name, '-Fc'],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const restore = spawn(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'pg_restore',
      '-U',
      'penicillion',
      '-d',
      restored.name,
      '--no-owner',
      '--exit-on-error',
    ],
    { stdio: ['pipe', 'ignore', 'inherit'] },
  );
  await Promise.all([complete(dump), complete(restore), pipeline(dump.stdout, restore.stdin)]);
  const elapsed = Math.round(performance.now() - start);
  const replay = await makeSolo(restored.pool).handle({
    actorId: actor,
    path: runPath,
    method: 'GET',
    now,
  });
  assert.equal(replay.total, run.total);
  assert.deepEqual(replay.results, run.results);
  assert.equal(replay.scoringRelease, run.scoringRelease);
  const proof = await restored.pool.query(
    'SELECT (SELECT count(*)::int FROM solo_issue) issues,(SELECT count(*)::int FROM solo_issue_slot) slots,(SELECT count(*)::int FROM solo_mapping) mappings,(SELECT count(*)::int FROM solo_outcome) outcomes',
  );
  console.log(
    JSON.stringify(
      {
        release: release.id,
        method: 'Local pg_dump -Fc streamed to pg_restore',
        elapsedMs: elapsed,
        total: replay.total,
        matchesAllSeven: true,
        ...proof.rows[0],
      },
      null,
      2,
    ),
  );
} finally {
  for (const p of pools) await p.end();
  for (const name of created) await admin.query('DROP DATABASE ' + pg.escapeIdentifier(name));
  await admin.end();
}
