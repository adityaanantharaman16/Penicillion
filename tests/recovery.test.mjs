import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';
import WebSocket from 'ws';
import { migrateSolo, seed } from '../server/solo/seed.mjs';

async function unusedPort() {
  const s = net.createServer();
  s.listen(0, '127.0.0.1');
  await once(s, 'listening');
  const port = s.address().port;
  await new Promise((r) => s.close(r));
  return port;
}
async function until(check, limit = 10000) {
  const start = Date.now();
  do {
    try {
      if (await check()) return;
    } catch {}
    await sleep(100);
  } while (Date.now() - start < limit);
  throw Error('Timed out waiting for local recovery.');
}

test(
  'Both workers recover a committed handoff lost before broadcast; shared-cache outage closes writes',
  { timeout: 35000 },
  async (t) => {
    const adminUrl =
      process.env.DATABASE_URL || 'postgresql://penicillion:local-game@127.0.0.1:55442/penicillion';
    const redis = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:56389');
    assert.ok(['127.0.0.1', 'localhost'].includes(redis.hostname), 'Local recovery test only');
    const admin = new pg.Pool({ connectionString: adminUrl, max: 1 }),
      schema = 'recovery_' + randomUUID().replaceAll('-', '');
    await admin.query('CREATE SCHEMA ' + pg.escapeIdentifier(schema));
    const scoped = new URL(adminUrl);
    scoped.searchParams.set('options', '-csearch_path=' + schema);
    const db = new pg.Pool({ connectionString: scoped.href, max: 2 });
    const children = [],
      connections = new Set();
    let pass = true,
      ws;
    const gate = net.createServer((front) => {
      if (!pass) {
        front.destroy();
        return;
      }
      const back = net.connect(Number(redis.port) || 6379, redis.hostname);
      connections.add(front);
      connections.add(back);
      front.on('error', () => back.destroy());
      back.on('error', () => front.destroy());
      front.on('close', () => {
        connections.delete(front);
        back.destroy();
      });
      back.on('close', () => {
        connections.delete(back);
        front.destroy();
      });
      front.pipe(back).pipe(front);
    });
    t.after(async () => {
      ws?.terminate();
      for (const c of children) if (c.exitCode === null && c.signalCode === null) c.kill('SIGTERM');
      for (const c of connections) c.destroy();
      gate.close();
      await db.end();
      await admin.query('DROP SCHEMA ' + pg.escapeIdentifier(schema) + ' CASCADE');
      await admin.end();
    });
    gate.listen(0, '127.0.0.1');
    await once(gate, 'listening');
    const first = await unusedPort(),
      second = await unusedPort(),
      origin = 'http://127.0.0.1:' + first;
    const env = {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: scoped.href,
      REDIS_URL: 'redis://127.0.0.1:' + gate.address().port,
      PUBLIC_ORIGIN: origin,
      CACHE_NAMESPACE: schema + ':',
    };
    await db.query(await readFile(new URL('../server/001-core.sql', import.meta.url), 'utf8'));
    await migrateSolo(db);
    const bank = JSON.parse(
      await readFile(new URL('../content/release.json', import.meta.url), 'utf8'),
    );
    await seed(db, bank);
    for (const port of [first, second])
      children.push(
        spawn(process.execPath, ['server/app.mjs'], {
          env: { ...env, PORT: String(port) },
          stdio: 'ignore',
        }),
      );
    const ready = (port) =>
      fetch('http://127.0.0.1:' + port + '/health/ready').then((r) => r.status);
    await until(async () => (await ready(first)) === 200 && (await ready(second)) === 200);
    async function request(port, path, actor, body) {
      const h = { Host: new URL(origin).host, Origin: origin };
      if (actor) {
        h.Cookie = actor.cookie;
        h['X-CSRF-Token'] = actor.csrf;
      }
      if (body) h['Content-Type'] = 'application/json';
      return new Promise((resolve, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port, path, headers: h, method: body ? 'POST' : 'GET' },
          async (resp) => {
            try {
              const data = [];
              for await (const part of resp) data.push(part);
              resolve({
                status: resp.statusCode,
                body: JSON.parse(Buffer.concat(data)),
                cookie: resp.headers['set-cookie']?.[0]?.split(';')[0],
              });
            } catch (e) {
              reject(e);
            }
          },
        );
        req.on('error', reject);
        req.end(body ? JSON.stringify(body) : undefined);
      });
    }
    async function guest() {
      const r = await request(first, '/api/session');
      return { id: r.body.actor.id, csrf: r.body.csrfToken, cookie: r.cookie };
    }
    const [a, b] = await Promise.all([guest(), guest()]);
    let r = (await request(first, '/api/rooms', a, {})).body.room;
    const path = '/api/rooms/' + r.code;
    await request(first, '/api/rooms/join', b, { code: r.code });
    for (const actor of [a, b])
      await request(first, path + '/command', actor, {
        action: 'ready',
        epoch: r.epoch,
        commandId: randomUUID(),
      });
    r = (
      await request(first, path + '/command', a, {
        action: 'start',
        epoch: r.epoch,
        commandId: randomUUID(),
      })
    ).body.room;
    ws = new WebSocket('ws://127.0.0.1:' + second + path + '/live', {
      origin,
      headers: { Host: new URL(origin).host, Cookie: b.cookie },
    });
    let observed = 0;
    ws.on('error', () => {});
    ws.on('message', (raw) => {
      const v = JSON.parse(raw);
      if (v.room) observed = Math.max(observed, v.room.version);
    });
    await until(() => observed === r.version);
    const answer = bank.prompts.find((p) => p.text === r.prompt.text).answers[0].term,
      cmd = { commandId: randomUUID(), action: 'answer', epoch: r.epoch, answer };
    // A separate process dies inside the post-commit notification step. No test
    // hook or simulated clock exists in a network-facing app process.
    const fault = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
   import {pool} from './server/core.mjs';
   import {makeSolo} from './server/solo/index.mjs';
   import {makeRooms} from './server/rooms.mjs';
   const [code,actor,cmd]=process.argv.slice(1);
   await makeRooms(makeSolo(pool),async()=>process.kill(process.pid,'SIGKILL')).command(code,actor,JSON.parse(cmd));
 `,
        r.code,
        a.id,
        JSON.stringify(cmd),
      ],
      { env, stdio: 'ignore' },
    );
    const [, signal] = await once(fault, 'exit');
    assert.equal(signal, 'SIGKILL');
    await until(() => observed > r.version, 7500);
    const replay = await request(first, path + '/command', a, cmd);
    assert.equal(replay.body.room.activeId, b.id);
    assert.equal(replay.body.room.epoch, r.epoch + 1);
    const accepted = replay.body.room.events.at(-1);
    assert.equal(accepted.kind, 'pass');
    assert.deepEqual([accepted.fromSlot, accepted.toSlot], [0, 1]);
    assert.ok(accepted.chargeGain > 0);
    assert.equal(replay.body.room.seats[0].charge, accepted.chargeAfter);
    const current = await request(second, path, b);
    assert.equal(current.status, 200, JSON.stringify(current.body));
    assert.equal(current.body.room.version, replay.body.room.version);
    assert.deepEqual(current.body.room.events.at(-1), accepted);
    assert.equal(current.body.room.seats[0].charge, accepted.chargeAfter);
    assert.equal(
      (await db.query('SELECT count(*)::int n FROM room_commands WHERE cmd=$1', [cmd.commandId]))
        .rows[0].n,
      1,
    );
    pass = false;
    for (const c of connections) c.destroy();
    await until(async () => (await ready(first)) === 503 && (await ready(second)) === 503);
    const blocked = await request(first, '/api/runs', a, {
      mode: 'practice',
      commandId: randomUUID(),
    });
    assert.equal(blocked.status, 503);
    pass = true;
    await until(async () => (await ready(first)) === 200 && (await ready(second)) === 200);
    const resumed = await request(first, path, a);
    assert.equal(resumed.body.room.epoch, r.epoch + 1);
    assert.equal(resumed.body.room.seats[0].charge, accepted.chargeAfter);
  },
);
