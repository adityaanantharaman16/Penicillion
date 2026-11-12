// Separate adversarial checks against an already-running local load gateway.
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
const origin = 'http://127.0.0.1:' + Number(process.env.LOAD_PORT ?? 4350);
if (!['http://127.0.0.1:4350', 'http://127.0.0.1:4360'].includes(origin))
  throw Error('Use the isolated load gateway.');
async function guest() {
  const res = await fetch(origin + '/api/session');
  const replica = res.headers.get('x-game-replica');
  assert.ok(replica?.startsWith('night-' + new URL(origin).port + '-'));
  const body = await res.json();
  return { cookie: res.headers.get('set-cookie').split(';')[0], csrf: body.csrfToken, replica };
}
async function send(actor, path, body, extra = {}) {
  const start = performance.now();
  const res = await fetch(origin + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      cookie: actor.cookie,
      'x-csrf-token': actor.csrf,
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: res.status,
    value: await res.json(),
    replica: res.headers.get('x-game-replica'),
    retryAfter: res.headers.get('Retry-After'),
    elapsed: performance.now() - start,
  };
}
const a = await guest(),
  b = await guest();
const started = await send(a, '/api/runs', { mode: 'daily', commandId: randomUUID() });
assert.equal(started.status, 200);
const r = started.value,
  path = '/api/runs/' + r.id + '/answer',
  make = (answer) => ({ answer, roundId: r.roundId, commandId: randomUUID() });
const privateRead = (await send(b, '/api/runs/' + r.id)).status;
const crossOrigin = (await send(a, path, make('x'), { origin: 'https://other.invalid' })).status;
const extraScore = (
  await send(a, '/api/runs', { mode: 'daily', points: 700, commandId: randomUUID() })
).status;
const tooLarge = (await send(a, path, make('x'.repeat(4000)))).status;
assert.equal(privateRead, 404);
assert.equal(crossOrigin, 403);
assert.equal(extraScore, 400);
assert.equal(tooLarge, 413);
const codes = [],
  replicas = new Set();
for (let i = 0; i < 13; i++) {
  const hit = await send(
    a,
    path,
    make(i % 2 === 0 ? 'unlisted fixture' : 'another unlisted fixture'),
  );
  codes.push(hit.status);
  if (hit.replica) replicas.add(hit.replica);
  if (i === 12) assert.ok(Number(hit.retryAfter) > 0);
}
assert.equal(codes.filter((n) => n === 200).length, 12);
assert.equal(codes.at(-1), 429);
assert.equal(replicas.size, 2);
// A real submit races the first read after expiry. The result may be a legal
// accepted score or timeout, depending on when the body reaches the worker.
const run = (await send(b, '/api/runs', { mode: 'daily', commandId: randomUUID() })).value;
const answers = (await import('node:fs/promises')).readFile;
const release = JSON.parse(
  await answers(new URL('../../content/release.json', import.meta.url), 'utf8'),
);
const canonical = release.prompts.find((p) => p.text === run.prompt).answers[0].term;
await sleep(Math.max(0, run.deadline - Date.now() - 7));
const attempt = send(b, '/api/runs/' + run.id + '/answer', {
  answer: canonical,
  roundId: run.roundId,
  commandId: randomUUID(),
});
await sleep(9);
const reading = send(b, '/api/runs/' + run.id);
const [outcome, readback] = await Promise.all([attempt, reading]);
const stable = await send(b, '/api/runs/' + run.id);
assert.equal(stable.value.results.length, 1);
assert.equal(stable.value.total, stable.value.results[0].points);
assert.equal(outcome.value.total, stable.value.total);
assert.equal(readback.value.total, stable.value.total);
const report = {
  time: new Date().toISOString(),
  origin,
  privateRead,
  crossOrigin,
  extraScore,
  tooLarge,
  ordinaryRetries: 12,
  intentionalRateLimits: 1,
  servingWorkers: [...replicas],
  deadlineRace: {
    submission: outcome.value.results[0].status,
    points: outcome.value.total,
    stableOutcomeCount: stable.value.results.length,
  },
};
await mkdir('evidence/load', { recursive: true });
const evidenceFile = origin.endsWith(':4350')
  ? 'negative-probes.json'
  : 'negative-probes-4360.json';
await writeFile('evidence/load/' + evidenceFile, JSON.stringify(report, null, 2));
console.log(report);
