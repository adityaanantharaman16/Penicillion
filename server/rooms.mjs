import { rarities, rarityFor, relayChargeTarget as chargeTarget } from '../web/rarity.js';
import { randomInt } from 'node:crypto';
import {
  pool,
  one,
  rows,
  transaction,
  need,
  fields,
  keyOK,
  fingerprint,
  problem,
} from './core.mjs';
// The existing event kind persists the awarded band for replay and reconnect.
const passKinds = new Map(
  rarities.filter((tier) => tier.points).map((tier) => ['pass-' + tier.points, tier]),
);
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const roomCodeOK = (code) => typeof code === 'string' && /^[A-HJ-NP-Z2-9]{7}$/.test(code);
const makeCode = () =>
  Array.from({ length: 7 }, () => alphabet[randomInt(alphabet.length)]).join('');
const fuse = (now) => now + randomInt(10_000, 30_001);
const idle = 30 * 60_000,
  grace = 45_000;
const seatQuery = `SELECT s.*,coalesce(p.handle,'Guest '||(s.n+1)::text) AS name FROM seats s JOIN principals p ON p.id=s.actor WHERE s.code=$1 ORDER BY s.n`;
const alive = (seats) => seats.filter((s) => !s.departed && s.lives > 0);
const nextSeat = (survivors, n) => survivors.find((s) => s.n > n) || survivors[0];
function chargeSeat(seat, points) {
  const { chargeGain } = rarityFor(points);
  if (!chargeGain) throw Error('Unrecognized relay score.');
  const total = seat.charge + chargeGain;
  const bonusLife = seat.lives < 3 && total >= chargeTarget;
  seat.charge = bonusLife ? total - chargeTarget : Math.min(chargeTarget - 1, total);
  if (bonusLife) seat.lives++;
  return { chargeGain, bonusLife, chargeAfter: seat.charge, livesAfter: seat.lives };
}
// Cached receipts retain their original historical state. Old snapshots used
// tokens and had no stable slot IDs, so never reconstruct motion from them.
function readReceipt(result) {
  if (!result.room || result.room.chargeTarget !== undefined) return result;
  return {
    ...result,
    room: {
      ...result.room,
      chargeTarget,
      seats: result.room.seats.map((s) => ({ ...s, charge: s.charge * 33 })),
    },
  };
}
function view(room, seats, actor, events, now) {
  return {
    code: room.code,
    status: room.status,
    quick: room.quick,
    hostId: room.host,
    selfId: actor,
    epoch: room.epoch,
    version: room.version,
    activeId: room.active,
    winnerId: room.winner,
    chargeTarget,
    urgency:
      room.status !== 'playing' || room.fuse - now > 12000
        ? 'steady'
        : room.fuse - now > 5000
          ? 'warming'
          : 'urgent',
    prompt: room.status === 'playing' ? { text: room.prompt_text, scope: room.scope } : null,
    notice: room.notice,
    events: events.map(({ kind, motion, ...event }) => {
      const tier = passKinds.get(kind);
      return {
        ...event,
        ...(motion || {}),
        kind: tier ? 'pass' : kind === 'timeout' ? 'pop' : kind,
        ...(tier ? { tier: tier.label, points: tier.points } : {}),
      };
    }),
    seats: seats
      .filter((s) => !s.departed || room.status === 'finished')
      .map((s) => ({
        id: s.actor,
        slot: s.n,
        name: s.name,
        ready: s.ready,
        lives: s.lives,
        charge: s.charge,
        connected: !s.departed && now - s.last_seen <= 14000,
        active: s.actor === room.active,
      })),
  };
}
export function makeRooms(solo, publish = async () => {}) {
  async function mutate(code, actor, effect, now = Date.now(), replay = null) {
    const result = await transaction(async (c) => {
      const r = await one(c, 'SELECT * FROM rooms WHERE code=$1 FOR UPDATE', [code]);
      need(r, 404, 'Room unavailable.');
      const seats = await rows(c, seatQuery, [code]);
      const self = seats.find((s) => s.actor === actor);
      if (replay) {
        const old = await one(
          c,
          'SELECT signature,result,occupied_id FROM room_commands WHERE code=$1 AND actor=$2 AND cmd=$3',
          [code, actor, replay.id],
        );
        if (old) {
          if (!self || self.departed) {
            need(
              replay.action === 'leave' &&
                old.result.room === null &&
                old.signature === replay.signature,
              403,
              'Join this room first.',
            );
            return { payload: { room: null }, changed: false };
          }
          need(
            old.occupied_id === self.occupied_id,
            409,
            'This receipt belongs to a previous seat.',
          );
          need(old.signature === replay.signature, 409, 'Command ID reused.');
          const failure = old.result.commandFailure;
          return failure
            ? { error: problem(failure.status, failure.message), changed: false }
            : { payload: readReceipt(old.result), changed: false };
        }
      }
      if (actor) need(self && !self.departed, 403, 'Join this room first.');
      const initial = r.version;
      async function stamp(message, kind = 'update', motion = null) {
        r.version++;
        r.notice = message;
        r.updated = now;
        r.expires = now + idle;
        await c.query(
          'INSERT INTO room_events(code,seq,message,committed_at,epoch,kind,motion) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [r.code, r.version, message, Date.now(), r.epoch, kind, motion],
        );
      }
      async function choose() {
        const pool = await solo.relayPool(c);
        need(pool.length, 503, 'The relay catalogue is being prepared.');
        const recent = new Set(r.previous_prompts.slice(-Math.min(7, pool.length - 1)));
        const choices = pool.filter((p) => !recent.has(p.id));
        const p = choices[randomInt(choices.length)];
        r.prompt_id = p.id;
        r.prompt_text = p.text;
        r.scope = p.scope;
        r.prompt_count = Number(p.answerCount);
        r.previous_prompts = [...r.previous_prompts.slice(-15), p.id];
        r.used = [];
        r.fuse = fuse(now);
      }
      async function settle(held, reason, lose = true) {
        const kind = lose ? 'timeout' : 'forfeit';
        if (lose) held.lives = Math.max(0, held.lives - 1);
        const survivors = alive(seats);
        const motion = { fromSlot: held.n, toSlot: null, livesAfter: held.lives };
        if (survivors.length < 2) {
          r.status = survivors.length ? 'finished' : 'expired';
          r.winner = survivors[0]?.actor || null;
          r.active = null;
          r.fuse = null;
          r.epoch++;
          await stamp(
            survivors.length ? survivors[0].name + ' wins the relay.' : 'The relay closed.',
            kind,
            motion,
          );
          return;
        }
        const next = nextSeat(survivors, held.n);
        r.active = next.actor;
        r.epoch++;
        await choose();
        await stamp(reason + ' ' + next.name + ' opens a new category.', kind, {
          ...motion,
          toSlot: next.n,
        });
      }
      async function advanceClock() {
        const allGone = alive(seats).every((seat) => now - seat.last_seen > grace);
        if (
          (allGone && ['playing', 'lobby'].includes(r.status)) ||
          (r.expires <= now && ['lobby', 'playing'].includes(r.status)) ||
          (r.status === 'playing' && r.fuse < now - 30_000)
        ) {
          r.status = 'expired';
          r.fuse = null;
          r.active = null;
          r.epoch++;
          for (const seat of seats) seat.departed = true;
          await stamp('The room expired. No winner was recorded.');
          return;
        }
        if (r.status === 'playing' && r.fuse <= now) {
          const held = seats.find((s) => s.actor === r.active);
          if (held) await settle(held, held.name + ' lost a life.');
        }
        for (const lost of seats.filter(
          (s) => !s.departed && s.lives > 0 && now - s.last_seen > grace,
        )) {
          if (r.status !== 'playing' && r.status !== 'lobby') break;
          lost.departed = true;
          lost.lives = 0;
          if (r.status === 'playing' && (lost.actor === r.active || alive(seats).length <= 1))
            await settle(lost, lost.name + ' forfeited.', false);
          else
            await stamp(lost.name + ' left the room.', 'forfeit', {
              fromSlot: lost.n,
              toSlot: null,
              livesAfter: 0,
            });
        }
        if (!seats.some((s) => !s.departed && s.actor === r.host))
          r.host = seats.find((s) => !s.departed)?.actor || r.host;
      }
      async function start() {
        const ready = seats.filter((s) => !s.departed);
        need(
          r.status === 'lobby' && ready.length >= 2 && ready.every((s) => s.ready),
          409,
          'At least two seats must be ready.',
        );
        r.status = 'playing';
        r.active = ready[0].actor;
        r.epoch++;
        await choose();
        await stamp(ready[0].name + ' has the first slide.', 'start', { toSlot: ready[0].n });
      }
      await advanceClock();
      const beforeAction = r.version;
      let extra = {},
        postError = null;
      try {
        extra = (await effect?.({ c, r, seats, self, stamp, start, settle, choose })) || {};
      } catch (error) {
        // A stale command can coincide with a real timeout. Commit that timeout before replying.
        if (error.status && r.version === beforeAction) postError = error;
        else throw error;
      }
      if (r.version !== initial) {
        await c.query(
          `UPDATE rooms SET host=$2,status=$3,epoch=$4,version=$5,active=$6,winner=$7,prompt_id=$8,prompt_text=$9,scope=$10,prompt_count=$11,used=$12,previous_prompts=$13,fuse=$14,updated=$15,expires=$16,notice=$17 WHERE code=$1`,
          [
            code,
            r.host,
            r.status,
            r.epoch,
            r.version,
            r.active,
            r.winner,
            r.prompt_id,
            r.prompt_text,
            r.scope,
            r.prompt_count,
            r.used,
            r.previous_prompts,
            r.fuse,
            r.updated,
            r.expires,
            r.notice,
          ],
        );
        for (const seat of seats)
          await c.query(
            'UPDATE seats SET ready=$3,lives=$4,charge=$5,departed=$6,last_seen=greatest(last_seen,$7) WHERE code=$1 AND actor=$2',
            [code, seat.actor, seat.ready, seat.lives, seat.charge, seat.departed, seat.last_seen],
          );
      }
      const events = await rows(
        c,
        'SELECT seq,message AS text,kind,motion,committed_at AS "recordedAt" FROM (SELECT seq,message,kind,motion,committed_at FROM room_events WHERE code=$1 ORDER BY seq DESC LIMIT 10) h ORDER BY seq',
        [code],
      );
      const payload = {
        room: self?.departed ? null : view(r, seats, actor, events, now),
        ...(extra.feedback ? { feedback: extra.feedback } : {}),
      };
      const receipt = extra.ledger || (postError && postError.status < 500 ? replay : null);
      if (receipt) {
        const stored = postError
          ? { commandFailure: { status: postError.status, message: postError.message } }
          : payload;
        await c.query(
          'INSERT INTO room_commands(code,actor,cmd,signature,result,occupied_id) VALUES($1,$2,$3,$4,$5::jsonb,$6)',
          [code, actor, receipt.id, receipt.signature, JSON.stringify(stored), self.occupied_id],
        );
      }
      return { payload, changed: r.version !== initial, error: postError };
    });
    if (result.changed) await publish(code).catch(() => {});
    if (result.error) throw result.error;
    return result.payload;
  }
  async function createOrJoin(actor, mode, body) {
    fields(body, mode === 'join' ? ['code'] : []);
    const code = String(body.code || '')
      .trim()
      .toUpperCase();
    if (mode === 'join') need(roomCodeOK(code), 404, 'Room unavailable.');
    const joined = await transaction(async (c) => {
      await c.query('SELECT id FROM principals WHERE id=$1 FOR UPDATE', [actor]);
      const current = await one(
        c,
        'SELECT r.code,r.status FROM rooms r JOIN seats s ON s.code=r.code WHERE s.actor=$1 AND NOT s.departed',
        [actor],
      );
      if (current && current.status !== 'finished' && current.status !== 'expired') {
        need(
          mode === 'match' || mode === 'create' || current.code === code,
          409,
          'Leave your current room before joining another.',
        );
        return current.code;
      }
      if (current)
        await c.query('UPDATE seats SET departed=true WHERE code=$1 AND actor=$2', [
          current.code,
          actor,
        ]);
      let r;
      if (mode === 'join') r = await one(c, 'SELECT * FROM rooms WHERE code=$1 FOR UPDATE', [code]);
      if (mode === 'match') {
        await c.query('SELECT pg_advisory_xact_lock(19924783)');
        r = await one(
          c,
          `SELECT r.* FROM rooms r WHERE r.quick AND r.status='lobby' AND r.expires>$1 AND (SELECT count(*) FROM seats WHERE code=r.code AND NOT departed)<8 ORDER BY updated LIMIT 1 FOR UPDATE`,
          [Date.now()],
        );
      }
      const now = Date.now();
      if (!r) {
        need(mode !== 'join', 404, 'Room unavailable.');
        await c.query('SELECT pg_advisory_xact_lock(19924784)');
        need(
          (
            await one(
              c,
              "SELECT count(*) n FROM rooms WHERE status IN ('lobby','playing') AND expires>$1",
              [now],
            )
          ).n < 1500,
          503,
          'All local benches are busy.',
        );
        for (let attempt = 0; attempt < 3 && !r; attempt++)
          r = await one(
            c,
            "INSERT INTO rooms(code,host,status,quick,updated,expires,notice) VALUES($1,$2,'lobby',$3,$4,$5,'Waiting for ready seats.') ON CONFLICT DO NOTHING RETURNING *",
            [makeCode(), actor, mode === 'match', now, now + idle],
          );
      }
      need(r && r.status === 'lobby' && r.expires > now, 409, 'This relay has already started.');
      const others = await rows(c, 'SELECT n,actor FROM seats WHERE code=$1 AND NOT departed', [
        r.code,
      ]);
      need(others.length < 8, 409, 'All seats are taken.');
      await c.query('DELETE FROM seats WHERE code=$1 AND departed', [r.code]);
      const slot = Array.from({ length: 8 }, (_, n) => n).find(
        (n) => !others.some((v) => v.n === n),
      );
      await c.query('INSERT INTO seats(code,actor,n,last_seen) VALUES($1,$2,$3,$4)', [
        r.code,
        actor,
        slot,
        now,
      ]);
      await c.query('UPDATE rooms SET version=version+1,updated=$2,expires=$3 WHERE code=$1', [
        r.code,
        now,
        now + idle,
      ]);
      return r.code;
    });
    await publish(joined).catch(() => {});
    return snapshot(joined, actor);
  }
  async function command(code, actor, body, now = Date.now()) {
    fields(
      body,
      body?.action === 'answer'
        ? ['action', 'epoch', 'commandId', 'answer']
        : ['action', 'epoch', 'commandId'],
    );
    need(
      keyOK(body.commandId) &&
        Number.isSafeInteger(body.epoch) &&
        body.epoch >= 0 &&
        ['ready', 'start', 'leave', 'answer', 'rematch'].includes(body.action),
      400,
      'Invalid relay command.',
    );
    if (body.action === 'answer')
      need(
        typeof body.answer === 'string' &&
          body.answer.length <= 96 &&
          !body.answer.includes('\0') &&
          body.answer.trim(),
        400,
        'Enter one term of up to 96 characters.',
      );
    const signature = fingerprint(JSON.stringify([body.action, body.epoch, body.answer || '']));
    // Check the receipt under the same room lock, including retries of a committed leave.
    return mutate(
      code,
      actor,
      async ({ c, r, seats, self, stamp, start, settle, choose }) => {
        const ledger = { id: body.commandId, signature };
        if (self.departed) return { ledger, feedback: 'Your seat has expired.' };
        if (body.epoch !== r.epoch)
          return { ledger, feedback: 'The slide has moved. Your screen has been refreshed.' };
        if (body.action === 'leave') {
          self.lives = 0;
          self.departed = true;
          if (r.host === actor) r.host = seats.find((s) => !s.departed)?.actor || r.host;
          if (r.status === 'playing' && (r.active === actor || alive(seats).length <= 1))
            await settle(self, self.name + ' left.', false);
          else {
            if (!seats.some((s) => !s.departed)) r.status = 'expired';
            await stamp(self.name + ' left.', 'forfeit', {
              fromSlot: self.n,
              toSlot: null,
              livesAfter: 0,
            });
          }
        } else if (body.action === 'rematch') {
          need(r.status === 'finished', 409, 'Complete the relay first.');
          r.winner = null;
          r.status = 'lobby';
          r.active = null;
          r.epoch++;
          r.used = [];
          r.previous_prompts = [];
          for (const seat of seats) {
            seat.ready = false;
            seat.charge = 0;
            seat.lives = seat.departed ? 0 : 3;
          }
          await stamp('A new relay is open. Ready your seat.', 'rematch');
        } else if (body.action === 'ready') {
          need(r.status === 'lobby', 409, 'The room has started.');
          self.ready = !self.ready;
          await stamp(self.name + (self.ready ? ' is ready.' : ' is waiting.'));
          if (r.quick && alive(seats).length >= 2 && alive(seats).every((s) => s.ready))
            await start();
        } else if (body.action === 'start') {
          need(r.host === actor, 403, 'Only the host can start the room.');
          await start();
        } else {
          need(r.status === 'playing' && r.active === actor, 409, 'Wait for your turn.');
          const hit = await solo.relayMatch(r.prompt_id, body.answer, c);
          if (!hit) return { ledger, feedback: 'That term is outside this index. Try another.' };
          if (r.used.includes(hit.id))
            return { ledger, feedback: 'That concept has already been used in this category.' };
          r.used.push(hit.id);
          const next = nextSeat(alive(seats), self.n);
          r.active = next.actor;
          r.epoch++;
          const meter = chargeSeat(self, hit.points);
          let notice = self.name + ' passed to ' + next.name + ' with ' + hit.term + '.';
          if (meter.bonusLife) notice += ' ' + self.name + ' recovered a life.';
          if (r.used.length >= r.prompt_count) {
            await choose();
            notice += ' All concepts found. New category.';
          } else r.fuse = Math.max(r.fuse, now + 8000);
          await stamp(notice, 'pass-' + hit.points, { fromSlot: self.n, toSlot: next.n, ...meter });
        }
        return { ledger };
      },
      now,
      { id: body.commandId, signature, action: body.action },
    );
  }
  async function snapshot(code, actor) {
    // One SQL snapshot makes room, seats and the event cursor agree on both replicas.
    const r = await one(
      pool,
      `SELECT r.*,
      (SELECT jsonb_agg(to_jsonb(seat) ORDER BY seat.n) FROM (${seatQuery}) seat) AS seat_list,
      (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY seq),'[]'::jsonb) FROM
        (SELECT seq,message AS text,kind,motion,committed_at AS "recordedAt" FROM room_events
         WHERE code=$1 AND seq<=r.version ORDER BY seq DESC LIMIT 10) e) AS event_list
      FROM rooms r WHERE r.code=$1`,
      [code],
    );
    need(r, 404, 'Room unavailable.');
    const seats = r.seat_list || [];
    need(
      seats.some((s) => s.actor === actor && !s.departed),
      403,
      'Join this room first.',
    );
    return { room: view(r, seats, actor, r.event_list, Date.now()) };
  }
  async function current(actor) {
    const seat = await one(pool, 'SELECT s.code FROM seats s WHERE s.actor=$1 AND NOT departed', [
      actor,
    ]);
    return seat ? snapshot(seat.code, actor) : { room: null };
  }
  async function heartbeat(code, actor) {
    await pool.query(
      'UPDATE seats SET last_seen=$3 WHERE code=$1 AND actor=$2 AND NOT departed AND last_seen<$3::bigint-5000',
      [code, actor, Date.now()],
    );
  }
  let sweeping = false;
  async function sweep() {
    if (sweeping) return;
    sweeping = true;
    try {
      const now = Date.now();
      const due = await rows(
        pool,
        `SELECT code FROM rooms r WHERE status IN ('lobby','playing') AND (expires<=$1 OR fuse<=$1 OR EXISTS(SELECT 1 FROM seats s WHERE s.code=r.code AND NOT departed AND lives>0 AND last_seen<$2)) ORDER BY updated LIMIT 100`,
        [now, now - grace],
      );
      for (const { code } of due) await mutate(code, null, null, now);
      await pool.query(
        "UPDATE seats SET departed=true WHERE NOT departed AND code IN (SELECT code FROM rooms WHERE status IN ('finished','expired') AND expires<$1)",
        [now],
      );
      await pool.query('DELETE FROM rooms WHERE expires<$1', [now - 86400_000]);
    } finally {
      sweeping = false;
    }
  }
  async function exit(actor) {
    const v = await current(actor);
    if (v.room)
      await command(v.room.code, actor, {
        action: 'leave',
        epoch: v.room.epoch,
        commandId: crypto.randomUUID(),
      });
  }
  return { createOrJoin, command, snapshot, current, sweep, heartbeat, exit };
}
