import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const file = process.argv[2];
if (!file) throw Error('Pass the exact path to a measured load JSON file.');
const folder = dirname(file),
  stem = basename(file).slice('measured-'.length, -'.json'.length);
const x = JSON.parse(await readFile(file, 'utf8')),
  s = x.steady,
  rows = x.samples;
const full = x.soloCount === 1500 && x.relaySeats === 500 && x.durationSeconds >= 1800;
const port = Object.keys(s.replicas)[0]?.split('-')[1] ?? '4350';
async function optional(name) {
  try {
    return JSON.parse(await readFile(join(folder, name), 'utf8'));
  } catch {
    return null;
  }
}
const envFile = 'environment-' + stem + '.json';
const env = await optional(envFile);
const negFile = port === '4350' ? 'negative-probes.json' : 'negative-probes-' + port + '.json';
const burstFile = 'deadline-burst-' + port + '.json';
const burst = await optional(burstFile);
const interrupted = await optional('interrupted-attempt.json');
const comparison = await optional('reconnect-measurement.json');
const liveWindow = await readFile(join('.local', 'load', stem, 'progress.json'), 'utf8').then(
  JSON.parse,
  () => null,
);
const started = x.steadyStartedAt
    ? Date.parse(x.steadyStartedAt)
    : (liveWindow?.began ?? Date.parse(rows[0].time) - rows[0].elapsed * 1000),
  ends = started + x.durationSeconds * 1000;
const workerFile = 'workers-' + stem + '.json';
const logs = await readFile(join('.local', 'load', stem, 'workers.log'), 'utf8').catch(() => null);
if (logs) {
  const workers = {};
  const minuteWindows = [];
  for (const line of logs.split('\n')) {
    if (!line.startsWith('{')) continue;
    try {
      const row = JSON.parse(line);
      if (row.service === 'night-culture' && typeof row.replica === 'string') {
        workers[row.replica] = row;
        minuteWindows.push(row);
      }
    } catch {}
  }
  if (Object.keys(workers).length)
    await writeFile(
      join(folder, workerFile),
      JSON.stringify(
        {
          steadyStarted: new Date(started).toISOString(),
          steadyScheduledEnd: new Date(ends).toISOString(),
          latestMinuteCounters: workers,
          minuteWindows,
          windowNote:
            'Worker logs begin at process start, include ramp, and stop at the last complete worker minute. Submit buckets reset each minute. The generator report uses exact steady-window timings.',
        },
        null,
        2,
      ),
    );
}
const workerEvidence = await optional(workerFile);
const resets = x.failures.filter(
  (f) => f.stage === 'steady' && /ECONNRESET|socket hang up/.test(f.message),
);
const resetCount = resets.length;
const inRun = (b) => b && Date.parse(b.time) >= started - 2000 && Date.parse(b.time) <= ends + 2000;
const min = (fn) => Math.min(...rows.map(fn)),
  max = (fn) => Math.max(...rows.map(fn));
const fmt = (n) => Number(n).toLocaleString('en-US'),
  mib = (n) => (n / 2 ** 20).toFixed(1);
const wsMin = min((p) => p.openSockets),
  soloMin = min((p) => p.activeSolo);
const failures = s.http + s.wsCommands ? (100 * s.unexpected) / (s.http + s.wsCommands) : NaN;
const clean =
  !x.audit.runs.score_mismatches &&
  !x.audit.runs.finish_mismatches &&
  !x.audit.room.duplicate_pops &&
  !x.audit.missingAcknowledgedOutcomes &&
  !x.audit.duplicateRankedAllocations &&
  x.claimCollisionPreserved;
const pass =
  soloMin >= x.soloCount &&
  wsMin >= x.relaySeats &&
  s.submit.p95 < 300 &&
  s.peer.p95 < 500 &&
  failures < 1 &&
  clean &&
  x.reconnect?.opened === x.relaySeats &&
  (!s.dialToFirstSnapshot || s.dialToFirstSnapshot.n >= x.relaySeats);
const headline = full
  ? pass && x.peakSuccessfulWritesPerSecond >= 100
    ? 'The run met all local capacity targets.'
    : 'At least one local target was unmet.'
  : pass
    ? 'The final-build smoke reached its requested concurrency and passed the integrity audit.'
    : 'The short run did not meet every smoke criterion.';
const workers = rows.map((row) =>
  (row.processCPUandRssKiB ?? '')
    .trim()
    .split('\n')
    .slice(-2)
    .map((s) => s.trim().split(/\s+/).map(Number)),
);
const workerCPU = Math.max(...workers.map((w) => w.reduce((sum, p) => sum + p[1], 0)));
const workerRSS = Math.max(...workers.map((w) => w.reduce((sum, p) => sum + p[2] * 1024, 0)));
const container = rows.flatMap((r) => r.containerStats || []);
function docker(kind) {
  const data = container
    .filter((line) => line.includes('-' + kind + '-'))
    .map((line) => {
      const m = line.match(/ (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)([KMG]iB)/);
      return m
        ? { cpu: Number(m[1]), ram: Number(m[2]) * { KiB: 1 / 1024, MiB: 1, GiB: 1024 }[m[3]] }
        : null;
    })
    .filter(Boolean);
  return data.length
    ? Math.max(...data.map((d) => d.cpu)).toFixed(1) +
        '% CPU and ' +
        Math.max(...data.map((d) => d.ram)).toFixed(1) +
        ' MiB'
    : 'unavailable';
}
const lines = [
  '# ' + (full ? 'Night Culture local capacity test' : 'Night Culture final-build smoke'),
  '',
  headline +
    ' ' +
    fmt(x.soloCount) +
    ' paced solo players and ' +
    fmt(x.relaySeats) +
    ' connected relay seats across ' +
    x.roomCount +
    ' rooms ran for ' +
    (x.durationSeconds / 60).toFixed(1) +
    ' minutes after ramp. The window began at ' +
    new Date(started).toISOString() +
    '. [Raw measurements](' +
    basename(file) +
    ')' +
    (env ? ' · [Environment and release comparison](' + envFile + ')' : '') +
    '.',
  '',
  '| Measurement | Observed | Full-run target |',
  '|---|---|---|',
  '| Concurrent participation | ' +
    fmt(soloMin) +
    '–' +
    fmt(max((p) => p.activeSolo)) +
    ' solo, ' +
    wsMin +
    '–' +
    max((p) => p.openSockets) +
    ' sockets | 1,500 solo + 500 sockets |',
  '| Sustained window | ' + (x.durationSeconds / 60).toFixed(1) + ' min | 30 min |',
  '| Successful gameplay writes | ' +
    fmt(s.successfulWrites) +
    ' total, ' +
    x.peakSuccessfulWritesPerSecond +
    ' peak/s, ' +
    fmt(x.secondsAbove100Writes) +
    ' seconds at ≥100/s | ≥100/s in a burst |',
  '| Solo submit, server p95 | ' +
    s.submit.p95 +
    ' ms, ' +
    fmt(s.submit.n) +
    ' timings | <300 ms |',
  '| Relay event stamp to peer receipt, p95 | ' +
    s.peer.p95 +
    ' ms, ' +
    fmt(s.peer.n) +
    ' peer observations | <500 ms |',
  '| Unexpected HTTP/WS failures | ' +
    s.unexpected +
    ' / ' +
    fmt(s.http + s.wsCommands) +
    ' HTTP responses and socket commands (' +
    failures.toFixed(4) +
    '%) | <1% |',
  '| Integrity | ' +
    x.audit.runs.score_mismatches +
    ' score-sum mismatches, ' +
    x.audit.missingAcknowledgedOutcomes +
    ' missing acknowledged outcomes, ' +
    x.audit.room.duplicate_pops +
    ' duplicate pops | Zero each |',
  '',
];
if (s.dialToFirstSnapshot && comparison?.repeatDatabase === x.db) {
  lines.push(
    '**Reconnect measurements.** The [first frozen-build smoke](' +
      comparison.firstSmoke +
      ') reported **' +
      fmt(comparison.firstMixedPeerP95) +
      ' ms** p95 across ' +
      fmt(comparison.firstMixedPeerSamples) +
      ' measurements. The original collector combined delivery of a new pass to an existing connection with the age of the most recent pass returned when a player reconnected. In that run all ' +
      comparison.firstReconnect.opened +
      ' WebSocket open handshakes completed in ' +
      comparison.firstReconnect.milliseconds +
      ' ms.',
    '',
    'The repeat used the same game, content and service versions and kept those distributions separately. Ongoing connections received new passes in **' +
      s.peer.p95 +
      ' ms p95** (' +
      fmt(s.peer.n) +
      ' other-seat deliveries). Counting first-snapshot event ages together with those deliveries gave ' +
      fmt(s.mixedPeerAndFirstSnapshotAges.p95) +
      ' ms p95. For the ' +
      s.firstSnapshotAges.n +
      ' first snapshots carrying a tracked pass to another seat, its age was ' +
      fmt(s.firstSnapshotAges.p95) +
      ' ms p95. All ' +
      s.dialToFirstSnapshot.n +
      ' reconnected seats received their first personalized room snapshot, measured individually from dial, in ' +
      s.dialToFirstSnapshot.p95 +
      ' ms p95 and ' +
      s.dialToFirstSnapshot.max +
      ' ms maximum. [First-run probes and measurement change](reconnect-measurement.json).',
    '',
  );
}
if (inRun(burst))
  lines.push(
    'In a separate deadline burst during the plateau, ' +
      burst.earlyAccepted +
      ' of ' +
      burst.scheduledBefore +
      ' near-deadline submissions scored. Their server receipt times ranged from ' +
      burst.earlyReceiptOffsetMs.join(' to ') +
      ' ms relative to expiry. All ' +
      burst.lateTimeout +
      ' late submissions timed out. A one-second window contained ' +
      burst.maxEarlyAcceptedIn1000ms +
      ' accepted burst writes in addition to the background traffic. [Deadline burst](' +
      burstFile +
      ').',
    '',
  );
lines.push(
  '**Traffic and accuracy.** Two workers behind the local proxy each used a 16-connection PostgreSQL pool. The normal guest helper pre-issued the cohort in a new benchmark database, with its own Redis namespace. ' +
    Math.min(125, Math.round(x.soloCount / 8)) +
    ' players opened the published daily together at the start of ramp. Gameplay used HTTP or WebSocket. Players spent about 12–21 seconds thinking, with a subset submitting 450–1,600 ms before expiry, then read reveals for 4.3–9.6 seconds. After one ranked daily, each player continued in practice. Relay holders attempted an unused canonical term every 5.2–11 seconds. Eliminated seats remained connected until rematch.',
  '',
  'Server-Timing measures solo request handling through commit, before delivery to the generator. Relay timing begins at the durable event stamp immediately before commit and ends at a different seat’s receipt. This is a conservative upper bound on commit-to-peer latency. ' +
    (s.dialToFirstSnapshot
      ? 'The live relay sample excludes each connection’s first snapshot. '
      : 'The full run also counted fresh reconnect snapshots, which can carry an older event. ') +
    'Solo server p99 was ' +
    s.submit.p99 +
    ' ms, relay upper-bound p99 was ' +
    s.peer.p99 +
    ' ms, and local HTTP end-to-end p95 was ' +
    s.httpMs.p95 +
    ' ms.',
  '',
  '**Persistence and reconnect.** ' +
    fmt(s.scoreChecks) +
    ' successful solo responses matched the pinned editorial data. ' +
    fmt(s.duplicateChecks) +
    ' pairs of exact retries produced the same score and outcome count. The SQL audit covered ' +
    fmt(x.audit.runs.persisted_outcomes) +
    ' outcomes across ' +
    fmt(x.audit.runs.runs) +
    ' runs and found ' +
    x.audit.duplicateRankedAllocations +
    ' duplicate ranked allocations and ' +
    x.audit.runs.finish_mismatches +
    ' finish-count mismatches. The room ledger contained ' +
    fmt(x.audit.room.pops) +
    ' timeout events. Its room/epoch constraint and audit detected ' +
    x.audit.room.duplicate_pops +
    ' double pops. The guest collision ' +
    (x.claimCollisionPreserved ? 'preserved' : 'failed to preserve') +
    ' the unfinished account allocation. Mid-run, ' +
    x.reconnect?.opened +
    ' of ' +
    x.reconnect?.attempted +
    ' WebSocket open handshakes completed in ' +
    x.reconnect?.milliseconds +
    ' ms. Ordinary traffic returned ' +
    s.limited +
    ' rate limits. ' +
    (inRun(await optional(negFile))
      ? 'The [adversarial probe](' +
        negFile +
        ') separately counted the expected 429 and permission denials.'
      : ''),
  '',
  ...(resetCount
    ? [
        'The generator counted ' +
          resetCount +
          ' unexpected client transport ' +
          (resetCount === 1 ? 'reset' : 'resets') +
          ' (' +
          [...new Set(resets.map((f) => f.message))].join(', ') +
          '). The client resumes the authoritative run after a failed request. The capture does not distinguish a peer-closed idle HTTP connection from other transport causes.' +
          (workerEvidence
            ? ' The latest [worker counters](' +
              workerFile +
              ') reported ' +
              Object.values(workerEvidence.latestMinuteCounters).reduce((n, r) => n + r.errors, 0) +
              ' server errors and ' +
              Object.values(workerEvidence.latestMinuteCounters).reduce(
                (n, r) => n + r.socketErrors,
                0,
              ) +
              ' socket-handler errors.'
            : ''),
        '',
      ]
    : []),
  '**Resources.** ' +
    x.resources.hardware.model +
    ', ' +
    x.resources.hardware.logicalCPUs +
    ' logical CPUs, ' +
    (x.resources.hardware.ram / 2 ** 30).toFixed(0) +
    ' GiB RAM, ' +
    x.resources.hardware.platform +
    ', Node ' +
    x.resources.hardware.node +
    '. Docker exposed ' +
    x.resources.docker +
    '.' +
    (env
      ? ' Services used ' +
        env.postgresImage.split('@')[0] +
        ' and ' +
        env.redisImage.split('@')[0] +
        '.'
      : '') +
    ' The sampled peaks for both workers combined were ' +
    workerCPU.toFixed(1) +
    '% CPU and ' +
    mib(workerRSS) +
    ' MiB RSS. The generator reached ' +
    mib(max((p) => p.generatorRSS)) +
    ' MiB RSS and event-loop p99 peaked at ' +
    max((p) => p.eventLoopP99ms) +
    ' ms. Database connections peaked at ' +
    max((p) => p.pg.connections) +
    ' including the sampler. The isolated database reached ' +
    mib(max((p) => p.pg.bytes)) +
    ' MiB. Sampled container peaks were ' +
    docker('db') +
    ' for PostgreSQL and ' +
    docker('cache') +
    ' for Redis. Container figures include concurrent local QA in other databases and key namespaces.',
  '',
  'The transfer counter measured ' +
    mib(x.trafficBytes) +
    ' MiB of response bodies and socket frames during ramp and steady traffic, excluding headers. ' +
    (env
      ? 'The published web directory contained ' +
        env.assetFiles +
        ' files totaling ' +
        fmt(env.assetBytes) +
        ' bytes. Its largest asset was ' +
        env.largestAsset.name +
        ' (' +
        fmt(env.largestAsset.bytes) +
        ' bytes).'
      : ''),
  '',
  '**Release.** ' +
    x.release +
    ' contained ' +
    x.audit.density.prompts +
    ' prompts and ' +
    fmt(x.audit.density.mappings) +
    ' prompt–canonical mappings.' +
    (env && env.measuredRelease !== env.finalSourceRelease
      ? ' Compared with ' +
        env.finalSourceRelease +
        ', the final source added ' +
        env.changes.newMappings +
        ' mappings, removed ' +
        env.changes.removedMappings +
        ', changed ' +
        env.changes.differentPoints +
        ' scores and ' +
        env.changes.modifiedPrompts +
        ' prompts, and added ' +
        env.changes.addedAliasRows +
        ' / removed ' +
        env.changes.removedAliasRows +
        ' normalized alias rows.'
      : '') +
    (env?.workerRoles?.length
      ? ' The workers connected to the isolated database using ' + env.workerRoles.join(', ') + '.'
      : '') +
    (env && env.measuredRelease !== env.finalSourceRelease
      ? ' The [final-build smoke](smoke-summary.md) covers the frozen release, restricted runtime role and subsequent archive-privacy and histogram-recovery fixes.'
      : ''),
  '',
);
if (full && interrupted?.supersededBy === x.db)
  lines.push(
    'An [earlier attempt](interrupted-attempt.json) stopped after 219 seconds when its tool session closed. It produced no final audit. These 30-minute results come entirely from the uninterrupted rerun.',
    '',
  );
lines.push(
  '**Reproduce.** Bootstrap the local game, then run `npm run load`. The benchmark creates a fresh `penicillion_load_<timestamp>` database with a separate Redis namespace, listens on loopback port 4350, and writes its raw report under `evidence/load/`. During the plateau, `node scripts/load/burst.mjs` repeats the deadline wave and `node scripts/load/negative.mjs` repeats permission and shared-limit probes. Record exact images and compare release metadata with `node scripts/load/environment.mjs TIMESTAMP DATABASE_NAME`. Summarize with `node scripts/load/summarize.mjs EXACT_RESULT_FILE`. The shorter final-build check uses `LOAD_SOLO=1500 LOAD_ROOMS=100 LOAD_SECONDS=90 LOAD_PORT=4360 npm run load`.',
  '',
  'The generator shares the application host and caps concurrent HTTP connections at 256. Its solo active count uses successful requests in the previous 60 seconds. It simulates gameplay without rendering browser pages. Before deployment, repeat the 30-minute scenario using a separate generator host against production-shaped TLS and WebSocket ingress, database pooling and CPU limits. Verify the same latency, throughput, failure and integrity thresholds.',
  '',
);
const dest = join(folder, full ? 'CAPACITY.md' : 'smoke-summary.md');
await writeFile(dest, lines.join('\n'));
console.log(dest);
