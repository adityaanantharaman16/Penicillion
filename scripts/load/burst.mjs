// Additional synthetic seats target one deadline under the ongoing steady load.
// Ports are restricted to the load runner's owned loopback gateways.
import http from 'node:http';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
const port = Number(process.env.LOAD_PORT ?? 4350);
assert.ok([4350, 4360].includes(port), 'Use the isolated load gateway.');
const origin = 'http://127.0.0.1:' + port,
  agent = new http.Agent({ keepAlive: true, maxSockets: 200, maxFreeSockets: 180 });
function request(actor, path, body) {
  return new Promise((resolve, reject) => {
    const raw = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
      origin + path,
      {
        agent,
        method: raw ? 'POST' : 'GET',
        headers: {
          origin,
          ...(raw ? { 'content-type': 'application/json', 'content-length': raw.length } : {}),
          ...(actor ? { cookie: actor.cookie, 'x-csrf-token': actor.csrf } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (b) => chunks.push(b));
        res.on('end', () => {
          try {
            const json = JSON.parse(Buffer.concat(chunks));
            assert.equal(res.statusCode, 200, 'Unexpected game response ' + res.statusCode);
            assert.ok(
              res.headers['x-game-replica']?.startsWith('night-' + port + '-'),
              'The response did not come from this load gateway.',
            );
            resolve({ json, headers: res.headers, at: Date.now() });
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.once('error', reject);
    req.setTimeout(10000, () => req.destroy(Error('Game response timed out.')));
    req.end(raw);
  });
}
const release = JSON.parse(
  await readFile(new URL('../../content/release.json', import.meta.url), 'utf8'),
);
try {
  const actors = await Promise.all(
    Array.from({ length: 160 }, async () => {
      const { headers, json } = await request(null, '/api/session');
      return { cookie: headers['set-cookie'][0].split(';')[0], csrf: json.csrfToken };
    }),
  );
  const opened = await Promise.all(
    actors.map((actor) => request(actor, '/api/runs', { mode: 'daily', commandId: randomUUID() })),
  );
  const prompt = opened[0].json.prompt;
  assert.ok(opened.every((r) => r.json.prompt === prompt));
  const entry = release.prompts.find((p) => p.text === prompt);
  assert.ok(entry, 'The generator needs the published term list for this issue.');
  const term = entry.answers[0].term;
  const sent = [],
    ms = [],
    early = [],
    late = [];
  await Promise.all(
    actors.map(async (actor, i) => {
      const run = opened[i].json,
        after = i >= 128;
      await sleep(Math.max(0, run.deadline + (after ? 75 : -500) - Date.now()));
      const begin = Date.now();
      sent.push(begin);
      const { json, at } = await request(actor, '/api/runs/' + run.id + '/answer', {
        commandId: randomUUID(),
        roundId: run.roundId,
        answer: term,
      });
      assert.equal(json.results.length, 1);
      assert.equal(json.total, json.results[0].points);
      const target = after ? late : early;
      target.push({ status: json.results[0].status, at, receipt: json.serverNow - run.deadline });
      ms.push(at - begin);
    }),
  );
  early.sort((a, b) => a.at - b.at);
  let oneSecond = 0,
    j = 0;
  for (let i = 0; i < early.length; i++) {
    while (j <= i && early[i].at - early[j].at >= 1000) j++;
    const accepted = early.slice(j, i + 1).filter((r) => r.status === 'accepted').length;
    oneSecond = Math.max(oneSecond, accepted);
  }
  ms.sort((a, b) => a - b);
  const report = {
    time: new Date().toISOString(),
    origin,
    extraSimulatedGuests: 160,
    scheduledBefore: 128,
    scheduledAfter: 32,
    earlyAccepted: early.filter((x) => x.status === 'accepted').length,
    earlyTimeout: early.filter((x) => x.status === 'timeout').length,
    lateAccepted: late.filter((x) => x.status === 'accepted').length,
    lateTimeout: late.filter((x) => x.status === 'timeout').length,
    maxEarlyAcceptedIn1000ms: oneSecond,
    earlyReceiptOffsetMs: [
      Math.min(...early.map((x) => x.receipt)),
      Math.max(...early.map((x) => x.receipt)),
    ],
    lateReceiptOffsetMs: [
      Math.min(...late.map((x) => x.receipt)),
      Math.max(...late.map((x) => x.receipt)),
    ],
    endToEndP95ms: ms[Math.ceil(ms.length * 0.95) - 1],
  };
  await writeFile(
    'evidence/load/deadline-burst-' + port + '.json',
    JSON.stringify(report, null, 2),
  );
  console.log(report);
  assert.equal(report.lateAccepted, 0);
  assert.ok(oneSecond >= 100, 'Fewer than 100 accepted writes in the burst window.');
} finally {
  agent.destroy();
}
