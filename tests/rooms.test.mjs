import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

test('Relay ledger, clock boundaries, reconnection and membership in isolated PostgreSQL', async (t) => {
  const db =
    process.env.DATABASE_URL || 'postgresql://penicillion:local-game@127.0.0.1:55442/penicillion';
  const admin = new pg.Pool({ connectionString: db, max: 1 });
  const schema = 'room_test_' + randomUUID().replaceAll('-', '');
  await admin.query('CREATE SCHEMA ' + pg.escapeIdentifier(schema));
  const url = new URL(db);
  url.searchParams.set('options', '-csearch_path=' + schema);
  process.env.DATABASE_URL = url.href;
  const { pool } = await import('../server/core.mjs');
  t.after(async () => {
    await pool.end();
    await admin.query('DROP SCHEMA ' + pg.escapeIdentifier(schema) + ' CASCADE');
    await admin.end();
  });
  const migration = await readFile(new URL('../server/001-core.sql', import.meta.url), 'utf8');
  await pool.query(migration);
  const { makeRooms } = await import('../server/rooms.mjs');
  const poolStub = [
    { id: 'cells', text: 'Name a cell', scope: 'Human cells', answerCount: 2 },
    { id: 'cells2', text: 'Another cell prompt', scope: 'Human cells', answerCount: 2 },
  ];
  const matching = new Map([
    ['erythrocyte', { id: 'rbc', term: 'Red blood cell', points: 10 }],
    ['red blood cell', { id: 'rbc', term: 'Red blood cell', points: 10 }],
    ['astrocyte', { id: 'astro', term: 'Astrocyte', points: 85 }],
  ]);
  const catalogue = {
    relayPool: async () => poolStub,
    relayMatch: async (_id, s) => matching.get(s),
  };
  const rooms = makeRooms(catalogue);
  const actors = Array.from({ length: 10 }, () => randomUUID());
  for (const id of actors)
    await pool.query("INSERT INTO principals(id,kind,created_at) VALUES($1,'guest',$2)", [
      id,
      Date.now(),
    ]);
  const [a, b, stranger] = actors;
  let r = (await rooms.createOrJoin(a, 'create', {})).room;
  const code = r.code;
  const cmd = (actor, action, room, extra = {}, at) =>
    rooms.command(
      code,
      actor,
      { action, commandId: randomUUID(), epoch: room.epoch, ...extra },
      at,
    );
  await assert.rejects(rooms.snapshot(code, stranger), { status: 403 });
  await assert.rejects(rooms.createOrJoin(b, 'join', { code, role: 'owner' }), { status: 400 });
  await rooms.createOrJoin(b, 'join', { code });
  await rooms.createOrJoin(b, 'join', { code });
  assert.equal((await rooms.snapshot(code, a)).room.seats.length, 2);
  const early = { action: 'start', epoch: r.epoch, commandId: randomUUID() };
  await assert.rejects(rooms.command(code, a, early), { status: 409 });
  await assert.rejects(rooms.command(code, a, { ...early, action: 'ready' }), {
    status: 409,
    message: 'Command ID reused.',
  });
  await cmd(a, 'ready', r);
  await cmd(b, 'ready', r);
  await assert.rejects(cmd(b, 'start', r), { status: 403 });
  await assert.rejects(rooms.command(code, a, early), { status: 409 });
  r = (await cmd(a, 'start', r)).room;
  assert.equal(r.activeId, a);
  assert.equal(r.chargeTarget, 100);
  assert.deepEqual(
    r.seats.map((s) => s.slot),
    [0, 1],
  );
  assert.equal(r.events.at(-1).toSlot, 0);
  assert.ok(!Object.hasOwn(r, 'fuse') && !Object.hasOwn(r, 'used'));
  const key = { action: 'answer', commandId: randomUUID(), epoch: r.epoch, answer: 'erythrocyte' };
  const [x, y] = await Promise.all([rooms.command(code, a, key), rooms.command(code, a, key)]);
  assert.deepEqual(x, y);
  assert.equal(x.room.activeId, b);
  assert.equal(x.room.events.at(-1).tier, 'Classic');
  assert.equal(x.room.events.at(-1).points, 10);
  assert.equal(x.room.events.at(-1).kind, 'pass');
  await assert.rejects(rooms.command(code, a, { ...key, chargeGain: 99 }), { status: 400 });
  assert.deepEqual([x.room.events.at(-1).fromSlot, x.room.events.at(-1).toSlot], [0, 1]);
  assert.equal(x.room.seats[0].charge, 2);
  await assert.rejects(rooms.command(code, a, { ...key, answer: 'astrocyte' }), { status: 409 });
  await assert.rejects(cmd(a, 'answer', x.room, { answer: 'astrocyte' }), { status: 409 });
  const clock = async () =>
    (await pool.query('SELECT fuse FROM rooms WHERE code=$1', [code])).rows[0].fuse;
  const before = await clock();
  const dup = await cmd(b, 'answer', x.room, { answer: 'red blood cell' });
  assert.match(dup.feedback, /already/);
  assert.equal(await clock(), before);
  assert.equal(dup.room.seats[1].charge, 0);
  const miss = await cmd(b, 'answer', x.room, { answer: 'X' });
  assert.equal(miss.room.seats[1].charge, 0);
  assert.equal(miss.room.version, x.room.version);
  let rotated = (await cmd(b, 'answer', x.room, { answer: 'astrocyte' })).room;
  assert.equal(rotated.activeId, a);
  assert.equal(rotated.seats[1].charge, 19);
  assert.match(rotated.notice, /All concepts/);
  assert.equal((await rooms.snapshot(code, b)).room.events.at(-1).tier, 'Specialist');
  // Restore an old saved room and receipt, including both nonzero token values.
  await pool.query('ALTER TABLE seats DROP CONSTRAINT seat_charge_points');
  await pool.query('UPDATE seats SET charge=n+1');
  await pool.query(
    'ALTER TABLE seats ADD CONSTRAINT seats_charge_check CHECK(charge BETWEEN 0 AND 2)',
  );
  const legacy = structuredClone(x);
  delete legacy.room.chargeTarget;
  for (const seat of legacy.room.seats) {
    seat.charge = seat.slot + 1;
    delete seat.slot;
  }
  await pool.query('UPDATE room_commands SET result=$1 WHERE code=$2 AND cmd=$3', [
    legacy,
    code,
    key.commandId,
  ]);
  await pool.query(migration);
  await pool.query(migration);
  const restarted = makeRooms(catalogue);
  assert.deepEqual(
    (await restarted.snapshot(code, a)).room.seats.map((s) => s.charge),
    [33, 66],
  );
  const oldReceipt = await restarted.command(code, a, key);
  assert.equal(oldReceipt.room.chargeTarget, 100);
  assert.deepEqual(
    oldReceipt.room.seats.map((s) => s.charge),
    [33, 66],
  );
  assert.equal(oldReceipt.room.version, x.room.version);
  // Every awarded tier uses its published meter increment. Category rotation
  // on each pair of moves also exercises progress across distinct categories.
  await pool.query('UPDATE seats SET lives=2,charge=0 WHERE code=$1 AND actor=$2', [code, a]);
  let balance = 0;
  for (const [points, gain] of [
    [10, 2],
    [15, 3],
    [30, 6],
    [60, 11],
    [85, 19],
    [100, 24],
  ]) {
    const term = 'tier' + points;
    matching.set(term, { id: term, term, points });
    const passed = (await cmd(a, 'answer', rotated, { answer: term })).room;
    const ev = passed.events.at(-1);
    balance += gain;
    assert.deepEqual(
      [ev.chargeGain, ev.chargeAfter, ev.bonusLife, ev.livesAfter],
      [gain, balance, false, 2],
    );
    assert.equal(passed.seats[0].charge, balance);
    rotated = (await cmd(b, 'answer', passed, { answer: 'erythrocyte' })).room;
  }
  // Four or five Specialist finds plus ordinary passes restore a life.
  for (const [sequence, surplus] of [
    [['tier85', 'tier85', 'tier85', 'tier85', 'tier85', 'tier10', 'tier15'], 0],
    [['tier85', 'tier85', 'tier85', 'tier85', 'tier30', 'tier30', 'tier30', 'tier30'], 0],
    [['tier100', 'tier100', 'tier100', 'tier100', 'tier30'], 2],
  ]) {
    await pool.query('UPDATE seats SET lives=1,charge=0 WHERE code=$1 AND actor=$2', [code, a]);
    for (const [i, answer] of sequence.entries()) {
      const passed = (await cmd(a, 'answer', rotated, { answer })).room;
      assert.equal(passed.events.at(-1).bonusLife, i === sequence.length - 1);
      assert.equal(passed.seats[0].lives, i === sequence.length - 1 ? 2 : 1);
      if (i === sequence.length - 1) assert.equal(passed.seats[0].charge, surplus);
      rotated = (await cmd(b, 'answer', passed, { answer: 'erythrocyte' })).room;
    }
  }
  for (const lives of [2, 3]) {
    await pool.query('UPDATE seats SET lives=$3,charge=99 WHERE code=$1 AND actor=$2', [
      code,
      a,
      lives,
    ]);
    const answerKey = {
      action: 'answer',
      commandId: randomUUID(),
      epoch: rotated.epoch,
      answer: 'astrocyte',
    };
    const response = await rooms.command(code, a, answerKey);
    assert.deepEqual(await restarted.command(code, a, answerKey), response);
    const award = response.room;
    assert.equal(award.seats[0].lives, 3);
    assert.equal(award.seats[0].charge, lives === 2 ? 18 : 99);
    assert.equal(award.events.at(-1).bonusLife, lives === 2);
    assert.deepEqual((await restarted.snapshot(code, b)).room.events.at(-1), award.events.at(-1));
    rotated = (await cmd(b, 'answer', award, { answer: 'erythrocyte' })).room;
  }
  const expires = await clock();
  const late = await Promise.all([
    cmd(a, 'answer', rotated, { answer: 'astrocyte' }, expires),
    cmd(a, 'answer', rotated, { answer: 'erythrocyte' }, expires),
  ]);
  assert.equal(late[0].room.seats[0].lives, 2);
  assert.equal(late[0].room.seats[0].charge, 99);
  const pop = late[0].room.events.at(-1);
  assert.deepEqual([pop.kind, pop.fromSlot, pop.toSlot, pop.livesAfter], ['pop', 0, 1, 2]);
  assert.equal(late[1].room.epoch, late[0].room.epoch);
  assert.equal(
    (
      await pool.query("SELECT count(*)::int n FROM room_events WHERE code=$1 AND kind='timeout'", [
        code,
      ])
    ).rows[0].n,
    1,
  );
  const leave = { action: 'leave', epoch: late[0].room.epoch, commandId: randomUUID() };
  const win = (await rooms.command(code, a, leave)).room;
  assert.equal(win, null);
  assert.deepEqual(await rooms.command(code, a, leave), { room: null });
  await assert.rejects(rooms.command(code, a, key), { status: 403 });
  const finished = (await rooms.snapshot(code, b)).room;
  assert.equal(finished.winnerId, b);
  const reset = (await cmd(b, 'rematch', finished)).room;
  assert.equal(reset.status, 'lobby');
  assert.equal(reset.seats[0].charge, 0);
  assert.equal(reset.seats[0].lives, 3);
  await rooms.createOrJoin(a, 'join', { code });
  await assert.rejects(rooms.command(code, a, key), {
    status: 409,
    message: 'This receipt belongs to a previous seat.',
  });
  await assert.rejects(rooms.command(code, a, leave), { status: 409 });
  await cmd(a, 'leave', reset);
  await cmd(b, 'leave', reset);
  const q = (await rooms.createOrJoin(stranger, 'match', {})).room;
  const q2 = (await rooms.createOrJoin(b, 'match', {})).room;
  assert.equal(q2.code, q.code);
  for (const who of [stranger, b])
    await rooms.command(q.code, who, { action: 'ready', epoch: q.epoch, commandId: randomUUID() });
  const quick = (await rooms.snapshot(q.code, b)).room;
  assert.equal(quick.status, 'playing');
  // A final pop has no successor. Its event still identifies the eliminated
  // slot even though activeId is now null.
  await pool.query('UPDATE seats SET lives=1 WHERE code=$1 AND actor=$2', [q.code, quick.activeId]);
  const expiry = (await pool.query('SELECT fuse FROM rooms WHERE code=$1', [q.code])).rows[0].fuse;
  const finish = (
    await rooms.command(
      q.code,
      quick.activeId,
      { action: 'answer', epoch: quick.epoch, commandId: randomUUID(), answer: 'astrocyte' },
      expiry,
    )
  ).room;
  assert.equal(finish.status, 'finished');
  assert.equal(finish.activeId, null);
  const lastPop = finish.events.at(-1);
  assert.deepEqual(
    [lastPop.kind, lastPop.fromSlot, lastPop.toSlot, lastPop.livesAfter],
    ['pop', 0, null, 0],
  );
  const lobby = (
    await rooms.command(q.code, b, {
      action: 'rematch',
      epoch: finish.epoch,
      commandId: randomUUID(),
    })
  ).room;
  for (const seat of lobby.seats) assert.deepEqual([seat.lives, seat.charge], [3, 0]);
  await pool.query('UPDATE seats SET last_seen=last_seen-60000 WHERE code=$1', [q.code]);
  await rooms.sweep();
  const closed = (await pool.query('SELECT status,winner FROM rooms WHERE code=$1', [q.code]))
    .rows[0];
  assert.deepEqual(closed, { status: 'expired', winner: null });
  const full = (await rooms.createOrJoin(a, 'create', {})).room;
  for (const actor of actors.slice(1, 8))
    await rooms.createOrJoin(actor, 'join', { code: full.code });
  assert.equal((await rooms.snapshot(full.code, a)).room.seats.length, 8);
  await assert.rejects(rooms.createOrJoin(actors[8], 'join', { code: full.code }), { status: 409 });
});
