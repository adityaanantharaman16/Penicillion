import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildSchedule } from '../../content/schedule.mjs';
import { normalizeAnswer } from '../../content/match.mjs';
import { easternDate, resetAfter, shiftDate, transaction } from './calendar.mjs';
import { typoKeys } from './match.mjs';

export async function migrateSolo(pool) {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  return transaction(pool, async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('penicillion-solo-migrations'))");
    await db.query(sql);
  });
}

// Tables and column lists are private constants at the call sites below.
async function bulk(db, table, cols, rows, conflict = '') {
  const width = cols.length;
  const chunkSize = Math.floor(12000 / width);
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const placeholders = chunk.map(
      (_, j) => '(' + cols.map((_, k) => '$' + (j * width + k + 1)).join(',') + ')',
    );
    await db.query(
      'INSERT INTO ' +
        table +
        ' (' +
        cols.join(',') +
        ') VALUES ' +
        placeholders.join(',') +
        conflict,
      chunk.flat(),
    );
  }
}
const digestOf = (obj) => createHash('sha256').update(JSON.stringify(obj)).digest('hex');
async function importRelease(db, release, now) {
  const rid = release.id,
    digest = digestOf(release);
  const old = await db.query('SELECT digest FROM solo_release WHERE id=$1', [rid]);
  if (old.rowCount) {
    if (old.rows[0].digest !== digest)
      throw new Error('Release ID already published with different contents: ' + rid);
    return;
  }
  const releaseTiers = Array.isArray(release.tiers) ? release.tiers : [];
  const sourceIds = new Set(release.sources.map((s) => s.id));
  const concepts = new Set(),
    prompts = [],
    mappings = [],
    aliases = [];
  const tiers = new Map(releaseTiers.map((t) => [t.name, t.points]));
  for (const p of release.prompts) {
    if (!p.text || !p.scope || !p.answers.length || !['daily', 'open'].includes(p.pool))
      throw new Error('Incomplete prompt ' + p.id);
    prompts.push([rid, p.id, p.topic, p.text, p.scope, p.pool]);
    const amb = new Set((p.ambiguous ?? []).map(normalizeAnswer)),
      exc = new Set((p.exclusions ?? []).map(normalizeAnswer));
    const index = new Map();
    for (const a of p.answers) {
      if (
        !a.reason ||
        !a.fact ||
        !a.evidence ||
        !sourceIds.has(a.source?.id) ||
        !a.source.url.startsWith('https://') ||
        tiers.get(a.tier) !== a.points
      )
        throw new Error('Incomplete source or score for ' + p.id + '/' + a.id);
      concepts.add(a.id);
      mappings.push([
        rid,
        p.id,
        a.id,
        a.term,
        a.tier,
        a.points,
        a.reason,
        a.fact,
        a.source.id,
        a.source.label,
        a.source.url,
        a.evidence,
      ]);
      for (const raw of [a.term, ...(a.aliases ?? [])]) {
        const norm = normalizeAnswer(raw);
        if (!norm) throw new Error('Empty or oversized alias in ' + p.id);
        if (amb.has(norm)) continue;
        if (exc.has(norm) || index.has(norm))
          throw new Error('Alias conflict: ' + p.id + ' / ' + norm);
        index.set(norm, a.id);
      }
    }
    for (const [norm, id] of index) aliases.push([rid, p.id, norm, id, 'hit', typoKeys(norm)]);
    for (const norm of amb) aliases.push([rid, p.id, norm, null, 'ambiguous', []]);
    for (const norm of exc) aliases.push([rid, p.id, norm, null, 'excluded', []]);
  }
  await db.query("INSERT INTO solo_release VALUES($1,$2,$3,'draft',$4)", [
    rid,
    release.scoringRelease,
    digest,
    now,
  ]);
  await bulk(
    db,
    'solo_source',
    ['release_id', 'id', 'label', 'url', 'license', 'version'],
    release.sources.map((s) => [rid, s.id, s.label, s.url, s.license, s.version]),
  );
  await bulk(
    db,
    'solo_topic',
    ['release_id', 'name'],
    [...new Set(release.prompts.map((p) => p.topic))].map((t) => [rid, t]),
  );
  await bulk(
    db,
    'solo_tier',
    ['release_id', 'name', 'points'],
    releaseTiers.map((t) => [rid, t.name, t.points]),
  );
  await bulk(
    db,
    'solo_concept',
    ['id'],
    [...concepts].map((id) => [id]),
    ' ON CONFLICT DO NOTHING',
  );
  await bulk(db, 'solo_prompt', ['release_id', 'id', 'topic', 'prompt', 'scope', 'pool'], prompts);
  await bulk(
    db,
    'solo_mapping',
    [
      'release_id',
      'prompt_id',
      'concept_id',
      'term',
      'tier',
      'points',
      'reason',
      'fact',
      'source_id',
      'source_label',
      'source_url',
      'evidence',
    ],
    mappings,
  );
  await bulk(
    db,
    'solo_alias',
    ['release_id', 'prompt_id', 'norm', 'concept_id', 'disposition', 'typo_keys'],
    aliases,
  );
  await db.query("UPDATE solo_release SET status='published' WHERE id=$1", [rid]);
}

export async function seed(pool, release, now = Date.now(), { past = 7, future = 35 } = {}) {
  const today = easternDate(now),
    start = shiftDate(today, -past);
  // Fail before the transaction when the new wheel cannot support safe spacing.
  const planned = buildSchedule(start, past + 1 + future, release);
  return transaction(pool, async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('penicillion-content-publish'))");
    await importRelease(db, release, now);
    let added = 0;
    for (const issue of planned) {
      if ((await db.query('SELECT 1 FROM solo_issue WHERE date=$1', [issue.date])).rowCount)
        continue;
      const adjacent = await db.query(
        'SELECT DISTINCT prompt_id FROM solo_issue_slot WHERE date BETWEEN $1 AND $2',
        [shiftDate(issue.date, -7), shiftDate(issue.date, 7)],
      );
      const reserved = new Set(adjacent.rows.map((row) => row.prompt_id));
      const next = [...issue.prompts.filter((id) => !reserved.has(id))];
      if (next.length < 7) {
        // Releases may add/reorder prompts. Preserve old issued sets even across a change.
        for (const p of release.prompts
          .filter((p) => p.pool === 'daily')
          .sort((a, b) => a.id.localeCompare(b.id))) {
          if (!reserved.has(p.id) && !next.includes(p.id)) next.push(p.id);
          if (next.length === 7) break;
        }
      }
      if (next.length !== 7)
        throw new Error(
          'Insufficient eligible prompts: restore the last valid large release. Previously issued sets remain intact.',
        );
      const reset = resetAfter(issue.date);
      await db.query('INSERT INTO solo_issue VALUES($1,$2,$3,$4,$5)', [
        issue.date,
        issue.number,
        release.id,
        reset,
        reset + 600000,
      ]);
      await bulk(
        db,
        'solo_issue_slot',
        ['date', 'slot', 'release_id', 'prompt_id'],
        next.map((id, i) => [issue.date, i + 1, release.id, id]),
      );
      await db.query('INSERT INTO solo_leader_cache(date) VALUES($1)', [issue.date]);
      added++;
    }
    // Earlier immutable issues can still reserve IDs that a new content
    // revision has reclassified as open. Check the playable inventory using
    // the same reservation rule as the actual practice and relay draws.
    const {
      rows: [inventory],
    } = await db.query(
      `
      WITH available AS (
        SELECT p.id,count(m.concept_id) AS n FROM solo_prompt p
        JOIN solo_mapping m ON m.release_id=p.release_id AND m.prompt_id=p.id
        WHERE p.release_id=$1 AND p.pool='open' AND NOT EXISTS
          (SELECT 1 FROM solo_issue_slot s WHERE s.prompt_id=p.id AND s.date >= $2)
        GROUP BY p.id
      ) SELECT count(*)::int AS practice,count(*) FILTER(WHERE n>=8)::int AS relay FROM available
    `,
      [release.id, today],
    );
    if (inventory.practice < 7 || inventory.relay < 2) {
      throw new Error(
        'Release needs seven unreserved open prompts for practice and two relay categories with at least eight concepts each. Keep the last valid release.',
      );
    }
    return { release: release.id, added, from: start, through: planned.at(-1).date };
  });
}
