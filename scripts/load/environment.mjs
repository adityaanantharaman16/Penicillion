import pg from 'pg';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { normalizeAnswer } from '../../content/match.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const stamp = process.argv[2],
  dbName = process.argv[3];
if (
  !/^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z$/.test(stamp ?? '') ||
  !/^penicillion_load_\d{13}$/.test(dbName ?? '')
)
  throw Error('Supply this load run’s timestamp and isolated database name.');
const admin = new URL(
  process.env.LOAD_ADMIN_URL || 'postgresql://penicillion:local-game@127.0.0.1:55442/penicillion',
);
if (!['127.0.0.1', 'localhost'].includes(admin.hostname))
  throw Error('Local benchmark database required.');
admin.pathname = '/' + dbName;
const pool = new pg.Pool({ connectionString: admin.href, max: 1 }),
  run = promisify(execFile);
try {
  const json = JSON.parse(
    await readFile(new URL('../../content/release.json', import.meta.url), 'utf8'),
  );
  const {
    rows: [measured],
  } = await pool.query(
    'SELECT id,scoring_release FROM solo_release ORDER BY published_at DESC LIMIT 1',
  );
  const { rows } = await pool.query(
    'SELECT prompt_id,concept_id,term,points,fact,reason,source_url FROM solo_mapping WHERE release_id=$1',
    [measured.id],
  );
  const measuredRows = new Map(rows.map((a) => [a.prompt_id + '|' + a.concept_id, a]));
  const finalRows = new Map(
    json.prompts.flatMap((p) => p.answers.map((a) => [p.id + '|' + a.id, a])),
  );
  const changes = {
    newMappings: 0,
    removedMappings: 0,
    differentPoints: 0,
    differentDisplayNames: 0,
    differentFacts: 0,
    differentRationale: 0,
    differentSourceLink: 0,
  };
  for (const [key, f] of finalRows) {
    const m = measuredRows.get(key);
    if (!m) {
      changes.newMappings++;
      continue;
    }
    if (f.points !== m.points) changes.differentPoints++;
    if (f.term !== m.term) changes.differentDisplayNames++;
    if (f.fact !== m.fact) changes.differentFacts++;
    if (f.reason !== m.reason) changes.differentRationale++;
    if (f.source.url !== m.source_url) changes.differentSourceLink++;
  }
  for (const key of measuredRows.keys()) if (!finalRows.has(key)) changes.removedMappings++;
  const { rows: storedAliases } = await pool.query(
    'SELECT prompt_id,norm,concept_id,disposition FROM solo_alias WHERE release_id=$1',
    [measured.id],
  );
  const measuredAliases = new Set(
    storedAliases.map((a) => JSON.stringify([a.prompt_id, a.norm, a.concept_id, a.disposition])),
  );
  const finalAliases = new Set();
  for (const prompt of json.prompts) {
    const ambiguous = new Set((prompt.ambiguous ?? []).map(normalizeAnswer));
    for (const n of ambiguous) finalAliases.add(JSON.stringify([prompt.id, n, null, 'ambiguous']));
    for (const n of (prompt.exclusions ?? []).map(normalizeAnswer))
      finalAliases.add(JSON.stringify([prompt.id, n, null, 'excluded']));
    for (const a of prompt.answers)
      for (const n of [a.term, ...a.aliases].map(normalizeAnswer)) {
        if (!ambiguous.has(n)) finalAliases.add(JSON.stringify([prompt.id, n, a.id, 'hit']));
      }
  }
  changes.addedAliasRows = [...finalAliases].filter((k) => !measuredAliases.has(k)).length;
  changes.removedAliasRows = [...measuredAliases].filter((k) => !finalAliases.has(k)).length;
  const { rows: storedPrompts } = await pool.query(
    'SELECT id,prompt,scope,pool FROM solo_prompt WHERE release_id=$1',
    [measured.id],
  );
  changes.modifiedPrompts = storedPrompts.filter((p) => {
    const f = json.prompts.find((s) => s.id === p.id);
    return !f || f.text !== p.prompt || f.scope !== p.scope || f.pool !== p.pool;
  }).length;
  let assetFiles = 0,
    assetBytes = 0,
    largestAsset = { name: '', bytes: 0 };
  async function inspectFiles(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const path = dir + '/' + item.name;
      if (item.isDirectory()) await inspectFiles(path);
      else if (item.isFile()) {
        const size = (await stat(path)).size;
        assetFiles++;
        assetBytes += size;
        if (size > largestAsset.bytes) largestAsset = { name: path, bytes: size };
      }
    }
  }
  await inspectFiles('web');
  const container = async (service) => {
    const { stdout } = await run('docker', ['compose', 'ps', '-q', service]);
    const { stdout: image } = await run('docker', [
      'inspect',
      '--format',
      '{{.Config.Image}}',
      stdout.trim(),
    ]);
    return image.trim();
  };
  const report = {
    recordedAt: new Date().toISOString(),
    db: dbName,
    measuredRelease: measured.id,
    finalSourceRelease: json.id,
    measuredMappings: measuredRows.size,
    finalMappings: finalRows.size,
    changes,
    assetFiles,
    assetBytes,
    largestAsset,
    workerRoles: (
      await pool.query(
        "SELECT DISTINCT usename FROM pg_stat_activity WHERE datname=current_database() AND application_name LIKE 'night-4%-%' ORDER BY usename",
      )
    ).rows.map((row) => row.usename),
    postgresVersion: (await pool.query('SHOW server_version')).rows[0].server_version,
    postgresImage: await container('db'),
    redisImage: await container('cache'),
  };
  await writeFile('evidence/load/environment-' + stamp + '.json', JSON.stringify(report, null, 2));
  console.log(report);
} finally {
  await pool.end();
}
