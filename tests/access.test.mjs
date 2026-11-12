import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

test('Private groups, permission changes, ranked ties and account deletion', async (t) => {
  const db =
    process.env.DATABASE_URL || 'postgresql://penicillion:local-game@127.0.0.1:55442/penicillion';
  const admin = new pg.Pool({ connectionString: db, max: 1 }),
    schema = 'group_test_' + randomUUID().replaceAll('-', '');
  await admin.query('CREATE SCHEMA ' + pg.escapeIdentifier(schema));
  const url = new URL(db);
  url.searchParams.set('options', '-csearch_path=' + schema);
  process.env.DATABASE_URL = url.href;
  const { pool, localDate } = await import('../server/core.mjs');
  t.after(async () => {
    await pool.end();
    await admin.query('DROP SCHEMA ' + pg.escapeIdentifier(schema) + ' CASCADE');
    await admin.end();
  });
  const { social } = await import('../server/social.mjs'),
    { accountAction, validHandle } = await import('../server/identity.mjs');
  await pool.query(await readFile(new URL('../server/001-core.sql', import.meta.url), 'utf8'));
  await pool.query(
    'CREATE TABLE solo_ranked(actor_id text,date text,total int,completed_at bigint,run_id text)',
  );
  const date = localDate(),
    completed = new Set();
  const solo = {
    completed: async (id) => completed.has(id),
    handle: async () => ({ results: [{ term: 'Test finding', tier: 'Test tier', points: 10 }] }),
    deleteActor: async (id) => pool.query('DELETE FROM solo_ranked WHERE actor_id=$1', [id]),
  };
  const [a, b, c, d] = await Promise.all(
    ['Amber', 'Coral', 'Mint', 'Indigo'].map(async (handle) => {
      const id = randomUUID();
      await pool.query(
        "INSERT INTO principals(id,created_at,kind,handle,listed) VALUES($1,0,'account',$2,true)",
        [id, handle],
      );
      return { id, kind: 'account', handle };
    }),
  );
  const call = (s, path, body) =>
    social(
      path.split('?')[0],
      body ? 'POST' : 'GET',
      new URL(path, 'http://localhost'),
      body,
      s,
      solo,
    );
  assert.ok(!validHandle('admin'));
  assert.ok(!validHandle('<script>'));
  assert.ok(validHandle('Coral_1'));
  const { id } = await call(a, '/api/groups', { name: 'Slide night' });
  const group = '/api/groups/' + id;
  await assert.rejects(call(d, group), { status: 403 });
  assert.equal((await call(a, group)).locked, true);
  const first = await call(a, group + '/invite', {});
  await call(a, group + '/revoke', {});
  await assert.rejects(call(b, '/api/groups/join', { token: first.token }), { status: 404 });
  const { token } = await call(a, group + '/invite', {});
  await call(b, '/api/groups/join', { token });
  await call(c, '/api/groups/join', { token });
  for (const [p, total] of [
    [a, 200],
    [b, 200],
    [c, 100],
    [d, 300],
  ]) {
    completed.add(p.id);
    await pool.query('INSERT INTO solo_ranked VALUES($1,$2,$3,$4,$5)', [
      p.id,
      date,
      total,
      Date.now(),
      randomUUID(),
    ]);
  }
  const data = await call(a, group);
  assert.deepEqual(
    data.daily.map((r) => r.rank),
    [1, 1, 3],
  );
  assert.deepEqual(
    data.weekly.map((r) => r.total),
    [200, 200, 100],
  );
  assert.deepEqual(
    (await call(a, '/api/boards')).rows.map((r) => r.rank),
    [1, 2, 2, 4],
  );
  await assert.rejects(call(a, group + '/answers?member=' + b.id), { status: 403 });
  await pool.query('UPDATE principals SET share_answers=true WHERE id=$1', [b.id]);
  assert.equal((await call(a, group + '/answers?member=' + b.id)).rows[0].points, 10);
  await call(a, group + '/block', { id: b.id });
  await assert.rejects(call(b, group), { status: 403 });
  await assert.rejects(call(a, group + '/answers?member=' + b.id), { status: 403 });
  await assert.rejects(call(b, '/api/groups/join', { token }), { status: 403 });
  assert.equal((await call(a, '/api/boards')).rows.length, 3);
  const res = { setHeader() {} };
  await accountAction('/api/account/delete', a, { confirm: 'DELETE' }, res, solo, async () => {});
  assert.equal((await call(c, group)).role, 'owner');
});
