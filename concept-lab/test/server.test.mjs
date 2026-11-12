import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { get as httpGet } from 'node:http';
import { makeDemoService, demoServer } from '../server.mjs';

const command = (action, fields = {}) => ({ action, commandId: randomUUID(), ...fields });

test('two takes persist across restart, reveal waits, repeated commands award once', t => {
  const path = mkdtempSync(join(tmpdir(), 'penicillion-concept-test-'));
  const options = { database: join(path, 'demo.sqlite') };
  let service = makeDemoService(options);
  t.after(() => { service.close(); rmSync(path, { recursive: true }); });
  const token = service.session(null, 1000);
  const read = (action, now) => service.dispatch(token, 'A', action, now);
  const original = read(command('start'), 1000).body;
  assert.equal(original.deadline, 26_000);
  assert.equal(read(null, 7_000).body.deadline, original.deadline);
  service.close();
  service = makeDemoService(options);
  assert.equal(service.session(token, 8_000), token);
  const { roundId } = original;
  assert.equal(read(command('answer', { roundId, answer: 'bank of the thames' }), 9_000).body.deadline, original.deadline);
  const accepted = command('answer', { roundId, answer: 'scalpel' });
  const result = read(accepted, 25_999);
  assert.equal(result.body.total, 10);
  assert.equal(result.body.results[0].term, 'Scalpel');
  assert.ok(result.body.results[0].source.url.startsWith('https://'));
  assert.deepEqual(read(accepted, 27_000), result);
  assert.throws(() => read({ ...accepted, answer: 'rongeur' }, 27_000), { status: 409 });
  assert.equal(read(command('skip', { roundId }), 28_000).status, 409);
  assert.equal(read(null, 100_000).body.phase, 'reveal');
  const next = read(command('next', { roundId }), 100_001).body;
  assert.equal(next.deadline, 125_001);
  assert.equal(next.take, 2);
  assert.equal(read(command('answer', { roundId, answer: 'rongeur' }), 100_002).status, 409);
  assert.equal(read(command('answer', { roundId: next.roundId, answer: 'rongeur' }), 100_003).body.total, 95);
  const recap = read(command('next', { roundId: next.roundId }), 100_004).body;
  assert.equal(recap.phase, 'recap');
  assert.equal(recap.results.length, 2);
  assert.equal(recap.deadline, null);
  assert.equal(read(command('replay'), 100_005).body.total, 0);
});

test('timeout at exact deadline, skip and isolation between guests and concepts', t => {
  const service = makeDemoService({ database: ':memory:' });
  t.after(() => service.close());
  const token = service.session(null, 0);
  const other = service.session(null, 0);
  const open = service.dispatch(token, 'A', command('start'), 1500).body;
  assert.equal(service.dispatch(other, 'A', command('skip', { roundId: open.roundId }), 1510).status, 409);
  assert.equal(service.dispatch(token, 'B', null, 1510).body.phase, 'landing');
  const late = service.dispatch(token, 'A', command('answer', { roundId: open.roundId, answer: 'rongeur' }), open.deadline).body;
  assert.equal(late.results[0].status, 'timeout');
  assert.equal(late.total, 0);
  const second = service.dispatch(token, 'A', command('next', { roundId: open.roundId }), open.deadline + 1).body;
  const skipped = service.dispatch(token, 'A', command('skip', { roundId: second.roundId }), open.deadline + 2).body;
  assert.equal(skipped.results[1].status, 'skipped');
  assert.equal(skipped.total, 0);
  assert.notEqual(service.session(token, 86_400_000), token);
});

test('loopback HTTP uses private guest cookies and refuses private files, tampering and foreign origins', async t => {
  const server = demoServer({ database: ':memory:' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(done => server.close(done)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const get = await fetch(base + '/api/demo/B');
  assert.equal(get.status, 200);
  const cookie = get.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; SameSite=Strict/);
  const landing = await get.json();
  assert.deepEqual(landing.results, []);
  assert.doesNotMatch(JSON.stringify(landing), /rongeur|scalpel/i);
  const send = (data, headers = {}) => fetch(base + '/api/demo/B', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie.split(';')[0], ...headers },
    body: JSON.stringify(data)
  });
  assert.equal((await send(command('start'), { Origin: 'https://other.example' })).status, 403);
  assert.equal((await send(command('start', { points: 100 }))).status, 400);
  assert.equal((await send(command('start'), { Origin: base })).status, 200);
  assert.equal((await fetch(base + '/private/content.mjs')).status, 404);
  assert.equal((await fetch(base + '/art/../server.mjs')).status, 404);
  const wrongHost = await new Promise((resolve, reject) => {
    httpGet(base + '/api/demo/B', { headers: { Host: 'other.example' } }, response => {
      response.resume();
      resolve(response.statusCode);
    }).once('error', reject);
  });
  assert.equal(wrongHost, 403);
});
