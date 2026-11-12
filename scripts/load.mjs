// Local-only synthetic traffic. This runner creates a new DB and Redis namespace.
import http from 'node:http';
import os from 'node:os';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { WebSocket } from 'ws';
import { setup } from './load/setup.mjs';

const soloCount = Number(process.env.LOAD_SOLO ?? 1500),
  roomCount = Number(process.env.LOAD_ROOMS ?? 100);
const duration = Number(process.env.LOAD_SECONDS ?? 1800) * 1000,
  port = Number(process.env.LOAD_PORT ?? 4350);
if (
  !Number.isInteger(soloCount) ||
  soloCount < 1 ||
  soloCount > 1500 ||
  !Number.isInteger(roomCount) ||
  roomCount < 1 ||
  roomCount > 100 ||
  !Number.isInteger(duration) ||
  duration < 10000 ||
  duration > 1800000 ||
  ![4350, 4360].includes(port)
)
  throw Error(
    'Supported range: 1–1,500 solo, 1–100 five-seat rooms, 10–1,800 seconds, port 4350 or 4360.',
  );
const total = soloCount + roomCount * 5,
  stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = '.local/load/' + stamp,
  reportDir = 'evidence/load';
const exec = promisify(execFile);
await mkdir(dir, { recursive: true });
const sys = await setup(total + 2, dir, port);
const { pool, actors, origin, release } = sys;
const catalog = new Map(release.prompts.map((p) => [p.text, p.answers]));
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 256, maxFreeSockets: 96 });
const profiles = { ramp: record(), steady: record() };
let stage = 'ramp',
  running = true,
  began = 0,
  stopAt = Infinity,
  liveSockets = 0;
const rooms = [],
  workerTasks = [],
  samples = [],
  failures = [],
  bursts = new Map();
const resources = {};
let trafficBytes = 0;
const lag = monitorEventLoopDelay({ resolution: 20 });
lag.enable();
function record() {
  return {
    http: 0,
    negative: 0,
    limited: 0,
    unexpected: 0,
    wsCommands: 0,
    wsErrors: 0,
    wsRetries: 0,
    duplicateChecks: 0,
    scoreChecks: 0,
    successfulWrites: 0,
    soloAnswers: 0,
    relayPasses: 0,
    timeouts: 0,
    expectedRaces: 0,
    replicas: {},
    submit: [],
    peer: [],
    firstSnapshotAges: [],
    dialToFirstSnapshot: [],
    httpMs: [],
    serverMs: [],
  };
}
function metric() {
  return profiles[stage];
}
function fail(message) {
  metric().unexpected++;
  if (failures.length < 60)
    failures.push({ stage, t: new Date().toISOString(), message: String(message).slice(0, 180) });
}
function write() {
  metric().successfulWrites++;
  if (stage === 'steady') {
    const key = Math.floor((Date.now() - began) / 1000);
    bursts.set(key, (bursts.get(key) || 0) + 1);
  }
}
function dist(xs) {
  const v = xs.slice().sort((a, b) => a - b);
  const p = (n) =>
    v.length ? Math.round(v[Math.min(v.length - 1, Math.ceil(v.length * n) - 1)] * 10) / 10 : null;
  return { n: v.length, p50: p(0.5), p95: p(0.95), p99: p(0.99), max: p(1) };
}
const jitter = (lo, hi) => lo + Math.random() * (hi - lo);
async function wait(ms) {
  await sleep(Math.max(1, Math.min(ms, stopAt - Date.now())));
}
function req(actor, path, body, negative = false) {
  const start = performance.now(),
    m = metric();
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const headers = {
      cookie: actor.cookie,
      accept: 'application/json',
      origin,
      'X-CSRF-Token': actor.csrf,
      ...(data
        ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) }
        : {}),
    };
    const request = http.request(
      origin + path,
      { agent: httpAgent, method: data ? 'POST' : 'GET', headers },
      (res) => {
        const chunks = [];
        res.on('data', (b) => chunks.push(b));
        res.on('end', () => {
          try {
            const raw = Buffer.concat(chunks);
            trafficBytes += raw.length;
            const v = JSON.parse(raw.toString() || '{}');
            m.http++;
            m.httpMs.push(performance.now() - start);
            if (res.statusCode === 429) {
              m.limited++;
              if (!negative) fail('Unexpected rate limit on ' + path.split('/').at(-1));
            } else if (res.statusCode >= 400) {
              if (negative) m.negative++;
              else fail(res.statusCode + ' ' + String(v.error).slice(0, 100));
            } else {
              actor.last = Date.now();
              const id = res.headers['x-game-replica'];
              if (id) m.replicas[id] = (m.replicas[id] || 0) + 1;
              const elapsed = Number(res.headers['server-timing']?.split('=')[1]);
              if (Number.isFinite(elapsed)) {
                m.serverMs.push(elapsed);
                if (path.endsWith('/answer')) m.submit.push(elapsed);
              }
            }
            resolve({ status: res.statusCode, v });
          } catch (e) {
            fail(e.message);
            reject(e);
          }
        });
      },
    );
    request.setTimeout(20000, () => request.destroy(Error('HTTP timeout')));
    request.on('error', (e) => {
      fail(e.message);
      reject(e);
    });
    request.end(data);
  });
}
async function ok(actor, path, body) {
  const { status, v } = await req(actor, path, body);
  if (status !== 200) throw Error(status + ' ' + v.error);
  return v;
}
const cmd = (body) => ({ ...body, commandId: randomUUID() });
async function runSolo(actor, i, delay) {
  await wait(delay);
  let state,
    run = 0,
    steps = 0;
  while (running && Date.now() < stopAt) {
    try {
      if (!state || state.phase === 'recap' || state.phase === 'expired') {
        if (state) await wait(jitter(2000, 4600));
        if (!running || Date.now() >= stopAt) break;
        state = await ok(actor, '/api/runs', cmd({ mode: run++ === 0 ? 'daily' : 'practice' }));
        write();
        continue;
      }
      const path = '/api/runs/' + state.id;
      if (state.phase === 'prompt') {
        // Some answers cluster near the boundary. Other players think for 12–21 s.
        const near = (i + steps) % 12 === 0;
        const target = state.deadline - (near ? jitter(450, 1600) : jitter(4300, 13000));
        await wait(target - Date.now());
        if (!running || Date.now() >= stopAt) break;
        const answers = catalog.get(state.prompt);
        if (!answers) throw Error('Unrecognized issued prompt');
        const pick = answers[(i + steps) % answers.length];
        const body = cmd({ roundId: state.roundId, answer: pick.term });
        let fresh;
        if ((i + steps) % 89 === 0) {
          const [a, b] = await Promise.all([
            ok(actor, path + '/answer', body),
            ok(actor, path + '/answer', body),
          ]);
          metric().duplicateChecks++;
          if (a.total !== b.total || a.phase !== b.phase || a.results.length !== b.results.length)
            fail('Duplicate acknowledgment mismatch');
          fresh = a;
        } else fresh = await ok(actor, path + '/answer', body);
        const result = fresh.results.at(-1);
        if (result?.status === 'accepted') {
          metric().scoreChecks++;
          if (
            result.term !== pick.term ||
            result.points !== pick.points ||
            fresh.total !== state.total + pick.points
          )
            fail('Accepted score disagrees with pinned editorial mapping.');
          metric().soloAnswers++;
          write();
        } else if (result?.status === 'timeout') {
          metric().timeouts++;
        } else fail('Valid canonical answer was rejected');
        state = fresh;
        steps++;
        continue;
      }
      await wait(jitter(4300, 9600));
      if (!running || Date.now() >= stopAt) break;
      state = await ok(actor, path + '/next', cmd({ roundId: state.roundId }));
      write();
    } catch {
      await wait(1200);
      if (state)
        try {
          state = await ok(actor, '/api/runs/' + state.id);
        } catch {}
    }
  }
}
function updateRoom(control, v) {
  if (v && (!control.state || v.version >= control.state.version)) control.state = v;
}
function connect(control, actor) {
  return new Promise((resolve, reject) => {
    const dialStarted = performance.now();
    const ws = new WebSocket(
      origin.replace(/^http:/, 'ws:') + '/api/rooms/' + control.code + '/live',
      { origin, headers: { Cookie: actor.cookie }, handshakeTimeout: 10000 },
    );
    control.sockets.set(actor.id, ws);
    let opened = false,
      last = 0;
    ws.on('open', () => {
      opened = true;
      liveSockets++;
      resolve();
    });
    ws.on('error', (e) => {
      if (!opened) reject(e);
      else if (running) fail(e.message);
    });
    ws.on('close', () => {
      if (opened) liveSockets--;
    });
    ws.on('message', (raw) => {
      trafficBytes += raw.length;
      try {
        const packet = JSON.parse(raw),
          v = packet.room;
        if (packet.error) {
          if (/turn|stale|moved/i.test(packet.error)) metric().expectedRaces++;
          else {
            metric().wsErrors++;
            fail(packet.error);
          }
          return;
        }
        if (!v) return;
        const prior = last;
        if (!prior) metric().dialToFirstSnapshot.push(performance.now() - dialStarted);
        last = Math.max(last, v.version);
        updateRoom(control, v);
        actor.last = Date.now();
        const event = v.events?.at(-1),
          sent = control.pending;
        if (
          sent &&
          v.version > sent.version &&
          v.epoch > sent.epoch &&
          String(v.notice).includes(' passed to ')
        ) {
          if (!sent.counted) {
            sent.counted = true;
            metric().relayPasses++;
            write();
            control.used.add(sent.term);
          }
          if (
            actor.id !== sent.actor &&
            v.version > prior &&
            event?.seq === v.version &&
            Number.isFinite(Number(event.recordedAt))
          ) {
            // A first snapshot after a reconnect legitimately replays an
            // earlier event. Its age is distinct from commit-to-peer delivery.
            const destination = prior ? metric().peer : metric().firstSnapshotAges;
            destination.push(Math.max(0, Date.now() - Number(event.recordedAt)));
          }
        }
      } catch (e) {
        fail(e.message);
      }
    });
  });
}
async function roomCmd(actor, control, action) {
  const v = await ok(
    actor,
    '/api/rooms/' + control.code + '/command',
    cmd({ action, epoch: control.state.epoch }),
  );
  updateRoom(control, v.room);
}
async function ready(control) {
  for (const actor of control.actors) await roomCmd(actor, control, 'ready');
  await roomCmd(control.actors[0], control, 'start');
}
async function setRoom(i) {
  const players = actors.slice(soloCount + 5 * i, soloCount + 5 * i + 5);
  const created = await ok(players[0], '/api/rooms', {});
  const c = {
    actors: players,
    code: created.room.code,
    state: created.room,
    sockets: new Map(),
    used: new Set(),
    prompt: null,
    pending: null,
  };
  rooms.push(c);
  await Promise.all(
    players
      .slice(1)
      .map(async (a) => updateRoom(c, (await ok(a, '/api/rooms/join', { code: c.code })).room)),
  );
  await Promise.all(players.map((a) => connect(c, a)));
  await ready(c);
  return c;
}
async function relayLoop(c) {
  while (running && Date.now() < stopAt) {
    await wait(jitter(5200, 11000));
    if (!running || Date.now() >= stopAt) break;
    try {
      if (c.state.status === 'finished') {
        await roomCmd(c.actors[0], c, 'rematch');
        await ready(c);
        c.used.clear();
        continue;
      }
      if (c.state.status !== 'playing') {
        fail('Relay outside playing/finished state');
        break;
      }
      const a = c.actors.find((p) => p.id === c.state.activeId);
      if (!a) throw Error('Missing relay holder.');
      const ws = c.sockets.get(a.id);
      if (ws?.readyState !== WebSocket.OPEN) continue;
      if (
        c.prompt !== c.state.prompt.text ||
        (c.pending && c.state.notice.includes('lost a life'))
      ) {
        c.prompt = c.state.prompt.text;
        c.used.clear();
      }
      const options = catalog.get(c.prompt)?.filter((t) => !c.used.has(t.id));
      if (!options?.length) {
        c.used.clear();
        continue;
      }
      const pick = options[Math.floor(Math.random() * options.length)];
      c.pending = {
        actor: a.id,
        epoch: c.state.epoch,
        version: c.state.version,
        term: pick.id,
        counted: false,
      };
      ws.send(JSON.stringify(cmd({ action: 'answer', epoch: c.state.epoch, answer: pick.term })));
      metric().wsCommands++;
    } catch (e) {
      fail(e.message);
    }
  }
}
async function storm() {
  const sockets = rooms.flatMap((c) => c.actors.map((a) => [c, a, c.sockets.get(a.id)]));
  const start = Date.now();
  sockets.forEach(([, , ws]) => ws?.terminate());
  let opened = 0,
    at = 0;
  await Promise.all(
    Array.from({ length: 30 }, async () => {
      while (at < sockets.length) {
        const [c, a] = sockets[at++];
        try {
          await connect(c, a);
          opened++;
        } catch (e) {
          fail('Reconnect: ' + e.message);
        }
      }
    }),
  );
  return { attempted: sockets.length, opened, milliseconds: Date.now() - start };
}
async function checkClaim() {
  const guest = actors[total],
    account = actors[total + 1];
  const g = await ok(guest, '/api/runs', cmd({ mode: 'daily' })),
    a = await ok(account, '/api/runs', cmd({ mode: 'daily' }));
  await pool.query("UPDATE principals SET kind='account' WHERE id=$1", [account.id]);
  await pool.query('UPDATE sessions SET pending_guest=$1 WHERE actor=$2', [guest.id, account.id]);
  await ok(account, '/api/claim', { import: true });
  const { rows } = await pool.query(
    'SELECT id,ranked,actor_id FROM solo_run WHERE id=ANY($1::text[])',
    [[g.id, a.id]],
  );
  return rows.every((r) => r.actor_id === account.id && r.ranked === (r.id === a.id));
}
async function resourceSample() {
  const {
    rows: [db],
  } =
    await pool.query(`SELECT count(*)::int AS connections,count(*) FILTER(WHERE state='active')::int AS active,pg_database_size(current_database())::float8 AS bytes
 FROM pg_stat_activity WHERE datname=current_database()`);
  const ids = await exec('pgrep', ['-P', String(sys.supervisor.pid)]).then(
    (r) => r.stdout.trim().split(/\s+/),
    () => [],
  );
  const ps = await exec('ps', [
    '-o',
    'pid=,pcpu=,rss=',
    '-p',
    [sys.supervisor.pid, ...ids, process.pid].join(','),
  ]).then(
    (r) => r.stdout.trim(),
    () => null,
  );
  return {
    time: new Date().toISOString(),
    elapsed: began ? Math.round((Date.now() - began) / 1000) : 0,
    activeSolo: actors.slice(0, soloCount).filter((a) => a.last > Date.now() - 60000).length,
    openSockets: liveSockets,
    playingRooms: rooms.filter((c) => c.state.status === 'playing').length,
    pg: db,
    processCPUandRssKiB: ps,
    generatorRSS: process.memoryUsage().rss,
    eventLoopP99ms: Math.round(lag.percentile(99) / 1e5) / 10,
  };
}
async function audit() {
  const one = async (sql, args = []) => (await pool.query(sql, args)).rows[0];
  const runs =
    await one(`WITH facts AS(SELECT r.id,r.total,r.completed_at,count(o.round_id)::int AS n,COALESCE(sum(o.points),0)::int AS earned
 FROM solo_run r JOIN solo_round s ON s.run_id=r.id LEFT JOIN solo_outcome o ON o.round_id=s.id GROUP BY r.id)
 SELECT count(*)::int AS runs,sum(n)::int AS persisted_outcomes,count(*) FILTER(WHERE total<>earned)::int AS score_mismatches,
 count(*) FILTER(WHERE (completed_at IS NOT NULL)<>(n=7))::int AS finish_mismatches FROM facts`);
  const missing =
    await one(`SELECT count(*)::int AS n FROM solo_cmd c WHERE c.response->>'phase'='reveal' AND EXISTS
 (SELECT 1 FROM solo_run r WHERE r.id=c.response->>'id') AND NOT EXISTS
 (SELECT 1 FROM solo_outcome o WHERE o.round_id=c.response->>'roundId' AND o.points=(c.response->'results'->-1->>'points')::int)`);
  const room = await one(`SELECT count(*) FILTER(WHERE kind='timeout')::int AS pops,
  count(*) FILTER(WHERE kind='timeout')::int-count(DISTINCT(code,epoch)) FILTER(WHERE kind='timeout')::int AS duplicate_pops,
  count(*)::int AS events FROM room_events`);
  const density = await one(
    'SELECT count(*)::int AS prompts,(SELECT count(*)::int FROM solo_mapping) AS mappings FROM solo_prompt',
  );
  const dup = await one(
    'SELECT count(*)::int AS n FROM (SELECT actor_id,date FROM solo_run WHERE ranked GROUP BY 1,2 HAVING count(*)>1) x',
  );
  return {
    runs,
    missingAcknowledgedOutcomes: missing.n,
    duplicateRankedAllocations: dup.n,
    room,
    density,
  };
}
function compact(m) {
  return {
    ...m,
    submit: dist(m.submit),
    peer: dist(m.peer),
    firstSnapshotAges: dist(m.firstSnapshotAges),
    dialToFirstSnapshot: dist(m.dialToFirstSnapshot),
    mixedPeerAndFirstSnapshotAges: dist([...m.peer, ...m.firstSnapshotAges]),
    httpMs: dist(m.httpMs),
    serverMs: dist(m.serverMs),
  };
}
async function launch() {
  let reconnect, claim, resourcesTask;
  const cpu = os.cpus();
  resources.hardware = {
    model: cpu[0]?.model,
    logicalCPUs: cpu.length,
    ram: os.totalmem(),
    platform: os.platform() + ' ' + os.release() + ' ' + os.arch(),
    node: process.version,
  };
  resources.docker = await exec('docker', [
    'info',
    '--format',
    '{{.NCPU}} CPUs, {{.MemTotal}} bytes RAM',
  ]).then(
    (x) => x.stdout.trim(),
    () => null,
  );
  try {
    console.log(
      JSON.stringify({
        event: 'ramp',
        db: sys.name,
        dir,
        release: release.id,
        soloCount,
        roomCount,
        durationSeconds: duration / 1000,
      }),
    );
    const rampTime = roomCount > 60 ? 105000 : Math.max(7000, roomCount * 470);
    for (let i = 0; i < soloCount; i++)
      workerTasks.push(
        runSolo(
          actors[i],
          i,
          i < Math.min(125, Math.round(soloCount / 8)) ? 0 : (i / soloCount) * rampTime,
        ),
      );
    await Promise.all(
      Array.from({ length: roomCount }, async (_, i) => {
        await wait((i * rampTime) / roomCount);
        const room = await setRoom(i);
        workerTasks.push(relayLoop(room));
      }),
    );
    const rampDeadline = Date.now() + Math.max(30000, rampTime);
    while (actors.slice(0, soloCount).some((a) => a.last === 0) || liveSockets < roomCount * 5) {
      if (Date.now() > rampDeadline)
        throw Error('Ramp did not reach all requested solo players and relay connections.');
      await sleep(400);
    }
    stage = 'steady';
    began = Date.now();
    stopAt = began + duration;
    lag.reset();
    claim = await checkClaim();
    console.log(
      JSON.stringify({
        event: 'plateau',
        start: new Date(began).toISOString(),
        ends: new Date(stopAt).toISOString(),
        liveSockets,
        claim,
      }),
    );
    let lastDocker = 0;
    while (Date.now() < stopAt) {
      const s = await resourceSample();
      samples.push(s);
      if (Date.now() - lastDocker > 60000) {
        lastDocker = Date.now();
        s.containerStats = await exec('docker', [
          'stats',
          '--no-stream',
          '--format',
          '{{.Name}} {{.CPUPerc}} {{.MemUsage}}',
        ]).then(
          (x) =>
            x.stdout
              .trim()
              .split('\n')
              .filter((l) => l.startsWith('penicillion-night-culture-')),
          () => null,
        );
        console.log(
          JSON.stringify({
            event: 'sample',
            elapsed: s.elapsed,
            activeSolo: s.activeSolo,
            sockets: s.openSockets,
            writes: metric().successfulWrites,
            errors: metric().unexpected,
          }),
        );
      }
      if (!reconnect && Date.now() - began >= duration / 2) reconnect = await storm();
      await writeFile(
        dir + '/progress.json',
        JSON.stringify(
          { began, stopAt, now: Date.now(), latest: s, steady: compact(metric()), failures },
          null,
          2,
        ),
      );
      await wait(Math.min(15000, duration / 4));
    }
    const steadyEndedAt = Date.now();
    running = false;
    await Promise.allSettled(workerTasks);
    const evidence = await audit();
    const seconds = [...bursts.values()];
    const report = {
      recordedAt: new Date().toISOString(),
      steadyStartedAt: new Date(began).toISOString(),
      steadyEndedAt: new Date(steadyEndedAt).toISOString(),
      runtimeRole: 'night_play',
      durationSeconds: duration / 1000,
      soloCount,
      roomCount,
      relaySeats: roomCount * 5,
      release: release.id,
      db: sys.name,
      resources,
      ramp: compact(profiles.ramp),
      steady: compact(profiles.steady),
      peakSuccessfulWritesPerSecond: Math.max(0, ...seconds),
      secondsAbove100Writes: seconds.filter((n) => n >= 100).length,
      claimCollisionPreserved: claim,
      reconnect,
      audit: evidence,
      samples,
      failures,
      trafficBytes,
      method:
        'HTTP gameplay against two workers behind the local proxy. WebSocket relay passes and peer snapshots. Server-Timing submit durations include server authorization, rate limit, transaction and serialization before headers. Peer latency is a conservative upper bound from the event ledger stamp before commit to receipt at a different seat. Established identities are pre-issued in this new load-only database. All scored game actions use the real APIs.',
    };
    await mkdir(reportDir, { recursive: true });
    const file = reportDir + '/measured-' + stamp + '.json';
    await writeFile(file, JSON.stringify(report, null, 2));
    console.log(
      JSON.stringify({
        event: 'done',
        file,
        summary: {
          steady: report.steady,
          peak: report.peakSuccessfulWritesPerSecond,
          claim,
          reconnect,
          audit: evidence,
          failures: failures.slice(0, 3),
        },
      }),
    );
  } finally {
    running = false;
    stopAt = Date.now();
    lag.disable();
    for (const c of rooms) for (const ws of c.sockets.values()) ws.terminate();
    httpAgent.destroy();
    await sys.close();
  }
}
await launch();
