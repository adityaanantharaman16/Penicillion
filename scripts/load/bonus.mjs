// Two extra local test seats play actual passes until a lost life is restored.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const port = Number(process.env.LOAD_PORT ?? 4360);
assert.ok([4350, 4360].includes(port));
const origin = 'http://127.0.0.1:' + port;
const release = JSON.parse(
  await readFile(new URL('../../content/release.json', import.meta.url), 'utf8'),
);
async function request(actor, path, body) {
  const res = await fetch(origin + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      origin,
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(actor ? { cookie: actor.cookie, 'x-csrf-token': actor.csrf } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.match(res.headers.get('x-game-replica') || '', new RegExp('^night-' + port + '-'));
  assert.equal(res.status, 200);
  const data = await res.json();
  if (!actor)
    return {
      id: data.actor.id,
      cookie: res.headers.getSetCookie()[0].split(';')[0],
      csrf: data.csrfToken,
    };
  return data.room;
}
const [a, b] = await Promise.all([request(null, '/api/session'), request(null, '/api/session')]);
let room = await request(a, '/api/rooms', {});
const path = '/api/rooms/' + room.code;
async function move(actor, action, answer) {
  const command = {
    action,
    epoch: room.epoch,
    commandId: randomUUID(),
    ...(answer ? { answer } : {}),
  };
  room = await request(actor, path + '/command', command);
  return command;
}
await request(b, '/api/rooms/join', { code: room.code });
await move(a, 'ready');
await move(b, 'ready');
await move(a, 'start');
const cutoff = Date.now() + 35_000;
while (room.seats[0].lives === 3 && Date.now() < cutoff) {
  await sleep(800);
  room = await request(a, path);
}
assert.equal(room.seats[0].lives, 2);
assert.equal(room.activeId, b.id);
let category, used, restored;
const gains = [];
for (let i = 0; i < 40 && !restored; i++) {
  if (room.prompt.text !== category) {
    category = room.prompt.text;
    used = new Set();
  }
  const actor = room.activeId === a.id ? a : b;
  const options = release.prompts
    .find((p) => p.text === category)
    .answers.filter((x) => !used.has(x.id))
    .sort((x, y) => (actor === a ? y.points - x.points : x.points - y.points));
  assert.ok(options.length);
  const pick = options[0];
  const command = await move(actor, 'answer', pick.term);
  const event = room.events.at(-1);
  assert.equal(event.kind, 'pass');
  assert.equal(event.fromSlot, actor === a ? 0 : 1);
  assert.equal(event.points, pick.points);
  used.add(pick.id);
  if (actor === a)
    gains.push({
      points: event.points,
      gain: event.chargeGain,
      charge: event.chargeAfter,
      lives: event.livesAfter,
    });
  if (event.bonusLife) {
    assert.equal(actor, a);
    const replay = await request(a, path + '/command', command);
    const peer = await request(b, path);
    assert.equal(peer.seats[0].lives, 3);
    assert.deepEqual(peer.events.at(-1), event);
    assert.deepEqual(replay.events.at(-1), event);
    restored = true;
  }
  // Pace each account below the shared write limit and carry the fuse.
  await sleep(650);
}
assert.ok(restored);
await move(a, 'leave');
room = await request(b, path);
await move(b, 'leave');
const report = {
  time: new Date().toISOString(),
  release: release.id,
  players: 2,
  timedOutNaturally: true,
  gains,
  peerAndIdenticalRetryAgreed: true,
};
await writeFile('evidence/load/relay-meter-bonus.json', JSON.stringify(report, null, 2) + '\n');
console.log(report);
