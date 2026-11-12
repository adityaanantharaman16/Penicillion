// Replay the benchmark ledger independently of the live room implementation.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import pg from 'pg';

const file = process.argv[2];
const measured = JSON.parse(await readFile(file, 'utf8'));
assert.match(measured.db, /^penicillion_load_\d{13}$/);
const url = new URL(
  process.env.LOAD_ADMIN_URL || 'postgresql://penicillion:local-game@127.0.0.1:55442/penicillion',
);
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
url.pathname = '/' + measured.db;
const pool = new pg.Pool({ connectionString: url.href, max: 1 });
// The earlier 90-second relay smoke used the initial +20 Specialist value.
const specialistGain = process.argv[3] === 'initial-balance' ? 20 : 19;
const gains = { 10: 2, 15: 3, 30: 6, 60: 11, 85: specialistGain, 100: 24 };
try {
  const seats = (await pool.query('SELECT code,n,charge,lives FROM seats ORDER BY code,n')).rows;
  const events = (
    await pool.query('SELECT code,seq,kind,motion FROM room_events ORDER BY code,seq')
  ).rows;
  const rooms = new Map();
  for (const row of seats) {
    if (!rooms.has(row.code)) rooms.set(row.code, { seats: new Map(), holder: null });
    rooms.get(row.code).seats.set(row.n, { charge: 0, lives: 3, departed: false });
  }
  const counts = { passesByPoints: {}, bonusLives: 0, pops: 0, forfeits: 0, rematches: 0 };
  for (const { code, kind, motion } of events) {
    const room = rooms.get(code);
    if (kind === 'start') {
      room.holder = motion.toSlot;
      continue;
    }
    if (kind === 'rematch') {
      counts.rematches++;
      for (const seat of room.seats.values()) {
        seat.charge = 0;
        seat.lives = seat.departed ? 0 : 3;
      }
      room.holder = null;
      continue;
    }
    if (!kind.startsWith('pass-') && kind !== 'timeout' && kind !== 'forfeit') continue;
    const seat = room.seats.get(motion.fromSlot);
    assert.ok(seat);
    if (kind.startsWith('pass-')) {
      assert.equal(motion.fromSlot, room.holder);
      const points = Number(kind.slice(5)),
        gain = gains[points];
      const raw = seat.charge + gain,
        bonus = seat.lives < 3 && raw >= 100;
      seat.charge = bonus ? raw - 100 : Math.min(99, raw);
      if (bonus) {
        seat.lives++;
        counts.bonusLives++;
      }
      assert.deepEqual(
        [motion.chargeGain, motion.bonusLife, motion.chargeAfter],
        [gain, bonus, seat.charge],
      );
      counts.passesByPoints[points] = (counts.passesByPoints[points] || 0) + 1;
    } else if (kind === 'timeout') {
      counts.pops++;
      assert.equal(motion.fromSlot, room.holder);
      seat.lives--;
    } else {
      counts.forfeits++;
      seat.lives = 0;
      seat.departed = true;
    }
    assert.equal(motion.livesAfter, seat.lives);
    const surviving = [...room.seats].filter(([, s]) => s.lives > 0).map(([slot]) => slot);
    if (kind !== 'forfeit' || room.holder === motion.fromSlot || surviving.length <= 1) {
      const next =
        surviving.length < 2 ? null : (surviving.find((s) => s > motion.fromSlot) ?? surviving[0]);
      assert.equal(motion.toSlot, next);
      room.holder = next;
    }
  }
  for (const s of seats) {
    const replayed = rooms.get(s.code).seats.get(s.n);
    assert.deepEqual([s.charge, s.lives], [replayed.charge, replayed.lives]);
  }
  const audit = {
    measured: basename(file),
    db: measured.db,
    rooms: rooms.size,
    seats: seats.length,
    ledgerEvents: events.length,
    ...counts,
    gains,
    verified: true,
  };
  await writeFile(
    join(dirname(file), 'relay-meter-audit-' + basename(file).slice('measured-'.length)),
    JSON.stringify(audit, null, 2) + '\n',
  );
  console.log(audit);
} finally {
  await pool.end();
}
