import { rarityFor } from '../../web/rarity.js';
import { randomUUID, createHmac } from 'node:crypto';
import { easternDate, resetAfter, validDate, problem, transaction } from './calendar.mjs';
import { match } from './match.mjs';
import * as boards from './standings.mjs';
export { migrateSolo, seed } from './seed.mjs';
export { easternDate } from './calendar.mjs';

const roundMs = 25_000;
const commandPattern = /^[A-Za-z0-9_-]{8,96}$/;
const idPattern = /^[a-zA-Z0-9_-]{8,96}$/;
const one = async (db, sql, args) => (await db.query(sql, args)).rows[0];
const requireThat = (condition, status, message) => {
  if (!condition) throw problem(status, message);
};
function fields(obj, allowed) {
  requireThat(
    obj &&
      Object.getPrototypeOf(obj) === Object.prototype &&
      Object.keys(obj).every((k) => allowed.includes(k)),
    400,
    'Unexpected or invalid request fields.',
  );
}
function issueOf(row) {
  return row
    ? {
        date: row.date,
        number: row.number,
        resetAt: Number(row.reset_at),
        graceUntil: Number(row.grace_until),
      }
    : null;
}
async function issue(db, date) {
  return one(db, 'SELECT * FROM solo_issue WHERE date=$1', [date]);
}
async function principal(db, actor) {
  const row = await one(db, 'SELECT claimed_by FROM principals WHERE id=$1 FOR UPDATE', [actor]);
  requireThat(row && !row.claimed_by, 401, 'Start a new session to play.');
}
async function assertArchiveAvailable(db, actor, date, now) {
  const held = await one(
    db,
    `SELECT 1 FROM solo_run WHERE actor_id=$1 AND date=$2
  AND ranked AND completed_at IS NULL AND expires_at>$3`,
    [actor, date, now],
  );
  requireThat(
    !held,
    403,
    'Your ranked run for this issue is still open. Finish it or wait for its overnight grace period to end.',
  );
}
async function ownRun(db, actor, id, now) {
  const row = await one(db, 'SELECT * FROM solo_run WHERE id=$1 AND actor_id=$2 FOR UPDATE', [
    id,
    actor,
  ]);
  requireThat(row, 404, 'Run not found.');
  if (row.mode === 'archive') await assertArchiveAvailable(db, actor, row.date, now);
  return row;
}
async function round(db, run) {
  return one(
    db,
    `SELECT r.*,p.prompt,p.scope,p.topic FROM solo_round r JOIN solo_prompt p
 ON p.release_id=r.release_id AND p.id=r.prompt_id WHERE r.run_id=$1 AND r.slot=$2`,
    [run.id, run.take],
  );
}
async function open(db, run, now) {
  const deadline = run.untimed
    ? null
    : Math.min(now + roundMs, run.expires_at ? Number(run.expires_at) : Infinity);
  const r = await one(
    db,
    'UPDATE solo_round SET opened_at=$3,deadline=$4 WHERE run_id=$1 AND slot=$2 AND opened_at IS NULL RETURNING prompt_id',
    [run.id, run.take, now, deadline],
  );
  if (!r) throw problem(409, 'This round has already opened.');
  await db.query(
    `INSERT INTO solo_seen VALUES($1,$2,$3) ON CONFLICT(actor_id,prompt_id)
 DO UPDATE SET last_seen=GREATEST(solo_seen.last_seen,EXCLUDED.last_seen)`,
    [run.actor_id, r.prompt_id, now],
  );
}
async function conclude(db, run, r, status, answer, now) {
  const points = answer?.points ?? 0;
  await db.query('INSERT INTO solo_outcome VALUES($1,$2,$3,$4,$5,$6,$7)', [
    r.id,
    status,
    answer?.id ?? null,
    r.release_id,
    r.prompt_id,
    points,
    now,
  ]);
  const last = r.slot === 7;
  const next = await one(
    db,
    `UPDATE solo_run SET phase='reveal',total=total+$2,completed_at=CASE WHEN $3 THEN $4::bigint ELSE NULL END
 WHERE id=$1 RETURNING *`,
    [run.id, points, last, now],
  );
  if (last && next.ranked) await boards.unlock(db, run.actor_id, now);
  return next;
}
async function settle(db, run, now) {
  if (
    run.completed_at == null &&
    run.expires_at != null &&
    now >= Number(run.expires_at) &&
    run.phase !== 'expired'
  ) {
    return one(db, "UPDATE solo_run SET phase='expired' WHERE id=$1 RETURNING *", [run.id]);
  }
  if (run.phase !== 'prompt') return run;
  const r = await round(db, run);
  if (r.deadline != null && now >= Number(r.deadline))
    return conclude(db, run, r, 'timeout', null, now);
  return run;
}
async function activeSpoilerGuard(db, actor, now, prompts, sameIssueDate = null) {
  if (!prompts.length) return new Set();
  // Redacting an unopened category in an unrelated archive would identify
  // part of the hidden daily. Past published mappings can be studied freely;
  // only categories this actor has opened in a live ranked issue are masked.
  // A colliding imported log belongs to the exact same known dated issue.
  const { rows } = await db.query(
    `SELECT DISTINCT s.prompt_id FROM solo_run r JOIN solo_round s ON s.run_id=r.id
  WHERE r.actor_id=$1 AND r.ranked AND r.completed_at IS NULL AND r.expires_at>$2
  AND (s.opened_at IS NOT NULL OR r.date=$4) AND s.prompt_id=ANY($3::text[])`,
    [actor, now, prompts, sameIssueDate],
  );
  return new Set(rows.map((r) => r.prompt_id));
}
// JSONB receipts from older versions retain their original results. Project only
// the public vocabulary when replaying them; never rewrite an award or receipt.
function displayRunTiers(view) {
  if (!Array.isArray(view.results)) return view;
  function rename(row) {
    if (row?.points > 0) row.tier = rarityFor(row.points).label;
  }
  for (const row of view.results) {
    rename(row);
    rename(row.alternative);
  }
  rename(view.bestFind);
  rename(view.bestFind?.alternative);
  return view;
}
async function snapshot(db, run, now, feedback = {}) {
  const today = easternDate(now);
  const issueRow = run.mode === 'practice' ? null : await issue(db, run.date);
  const r = await round(db, run);
  const ended = run.phase === 'recap';
  const { rows: history } = await db.query(
    `SELECT s.slot,s.prompt_id,p.prompt,p.scope,o.status,o.points,m.concept_id,m.term,m.tier,m.fact,
 m.reason,m.source_label,m.source_url FROM solo_round s JOIN solo_outcome o ON o.round_id=s.id
 JOIN solo_prompt p ON p.release_id=s.release_id AND p.id=s.prompt_id
 LEFT JOIN solo_mapping m ON m.release_id=o.release_id AND m.prompt_id=o.prompt_id AND m.concept_id=o.concept_id
 WHERE s.run_id=$1 ORDER BY s.slot`,
    [run.id],
  );
  let alternatives = new Map();
  if (ended) {
    const blocked = await activeSpoilerGuard(
      db,
      run.actor_id,
      now,
      history.map((h) => h.prompt_id),
      run.mode === 'practice' ? null : run.date,
    );
    const { rows } = await db.query(
      `SELECT DISTINCT ON(s.slot) s.slot,m.term,m.tier,m.points,m.fact,m.source_label,m.source_url
   FROM solo_round s JOIN solo_outcome o ON o.round_id=s.id JOIN solo_mapping m ON m.release_id=s.release_id AND m.prompt_id=s.prompt_id
   WHERE s.run_id=$1 AND m.concept_id IS DISTINCT FROM o.concept_id AND NOT(s.prompt_id=ANY($2::text[]))
   ORDER BY s.slot,m.points DESC,m.term`,
      [run.id, [...blocked]],
    );
    alternatives = new Map(
      rows.map((a) => [
        a.slot,
        {
          term: a.term,
          tier: a.tier,
          points: a.points,
          fact: a.fact,
          source: { label: a.source_label, url: a.source_url },
        },
      ]),
    );
  }
  const results = history.map((h) => ({
    slot: h.slot,
    status: h.status,
    term: h.term ?? (h.status === 'timeout' ? 'Time elapsed' : 'Skipped'),
    tier: h.tier,
    points: h.points,
    fact: h.fact ?? '',
    reason: h.reason ?? '',
    source: h.source_url ? { label: h.source_label, url: h.source_url } : null,
    prompt: h.prompt,
    ...(ended ? { alternative: alternatives.get(h.slot) ?? null } : {}),
  }));
  const scoreRelease = await one(db, 'SELECT scoring_release FROM solo_release WHERE id=$1', [
    run.release_id,
  ]);
  const view = {
    id: run.id,
    mode: run.mode,
    date: run.date,
    issue: issueOf(issueRow),
    ranked: run.ranked,
    untimed: run.untimed,
    contentRelease: run.release_id,
    scoringRelease: scoreRelease.scoring_release,
    phase: run.phase,
    take: run.take,
    takes: 7,
    roundId: ['prompt', 'reveal'].includes(run.phase) ? r.id : null,
    deadline: run.phase === 'prompt' && r.deadline != null ? Number(r.deadline) : null,
    serverNow: now,
    prompt: r.prompt,
    scope: r.scope,
    topic: r.topic,
    total: run.total,
    max: 700,
    results,
    nextResetAt: resetAfter(today),
    ...feedback,
  };
  if (ended) {
    view.stats = await boards.stats(db, run.actor_id, now);
    view.bestFind =
      results.filter((r) => r.status === 'accepted').sort((a, b) => b.points - a.points)[0] ?? null;
    view.distribution = run.ranked
      ? await boards.distribution(db, run.actor_id, run.date, now)
      : null;
  }
  return displayRunTiers(view);
}
async function latestRelease(db) {
  const release = await one(
    db,
    "SELECT id FROM solo_release WHERE status='published' ORDER BY published_at DESC,id DESC LIMIT 1",
  );
  requireThat(release, 503, 'The content release is not ready.');
  return release.id;
}
async function start(db, actor, body, now) {
  const mode = body.mode;
  requireThat(['daily', 'practice', 'archive'].includes(mode), 400, 'Choose a play mode.');
  requireThat(
    body.untimed === undefined || (mode === 'practice' && typeof body.untimed === 'boolean'),
    400,
    'The untimed option is available in practice.',
  );
  const today = easternDate(now);
  const date = mode === 'archive' ? body.date : today;
  requireThat(
    mode === 'archive' ? validDate(date) && date < today : body.date === undefined,
    400,
    'Choose a past issue from the archive.',
  );
  if (mode === 'archive') await assertArchiveAvailable(db, actor, date, now);
  if (mode === 'daily') {
    const existing = await one(
      db,
      'SELECT * FROM solo_run WHERE actor_id=$1 AND ranked AND date=$2 FOR UPDATE',
      [actor, date],
    );
    if (existing) return snapshot(db, await settle(db, existing, now), now);
  }
  const issueRow = mode === 'practice' ? null : await issue(db, date);
  requireThat(
    mode === 'practice' || issueRow,
    mode === 'archive' ? 404 : 503,
    'This issue is not on the published schedule.',
  );
  const release = issueRow?.release_id ?? (await latestRelease(db));
  const slots =
    mode === 'practice'
      ? await db.query(
          `SELECT p.id AS prompt_id FROM solo_prompt p
  LEFT JOIN solo_seen s ON s.actor_id=$1 AND s.prompt_id=p.id
  WHERE p.release_id=$2 AND p.pool='open' AND NOT EXISTS(SELECT 1 FROM solo_issue_slot i WHERE i.prompt_id=p.id AND i.date>=$3)
  ORDER BY s.last_seen ASC NULLS FIRST,md5(p.id || $1) LIMIT 7`,
          [actor, release, today],
        )
      : await db.query('SELECT prompt_id FROM solo_issue_slot WHERE date=$1 ORDER BY slot', [date]);
  requireThat(slots.rowCount === 7, 503, 'There are too few unreserved prompts to open this run.');
  const id = randomUUID();
  const run = await one(
    db,
    `INSERT INTO solo_run(id,actor_id,mode,date,release_id,ranked,untimed,phase,take,total,created_at,expires_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,'prompt',1,0,$8,$9) RETURNING *`,
    [
      id,
      actor,
      mode,
      date,
      release,
      mode === 'daily',
      body.untimed ?? false,
      now,
      mode === 'daily' ? issueRow.grace_until : null,
    ],
  );
  await db.query(
    `INSERT INTO solo_round(id,run_id,slot,release_id,prompt_id)
 SELECT u.id,$1,u.ord,$2,u.prompt FROM unnest($3::text[],$4::text[]) WITH ORDINALITY AS u(id,prompt,ord)`,
    [id, release, slots.rows.map(() => randomUUID()), slots.rows.map((r) => r.prompt_id)],
  );
  await open(db, run, now);
  return snapshot(db, run, now);
}

async function advance(db, actor, id, action, body, now) {
  let run = await settle(db, await ownRun(db, actor, id, now), now);
  if (run.phase === 'expired') return snapshot(db, run, now);
  const r = await round(db, run);
  requireThat(body.roundId === r.id, 409, 'This round has changed. Refresh the run.');
  if (action === 'next') {
    requireThat(run.phase === 'reveal', 409, 'This round is not waiting to advance.');
    const last = run.take === 7;
    run = await one(db, 'UPDATE solo_run SET phase=$2,take=$3 WHERE id=$1 RETURNING *', [
      id,
      last ? 'recap' : 'prompt',
      last ? 7 : run.take + 1,
    ]);
    if (!last) await open(db, run, now);
    return snapshot(db, run, now);
  }
  if (run.phase !== 'prompt') {
    const outcome = await one(db, 'SELECT status FROM solo_outcome WHERE round_id=$1', [r.id]);
    if (run.phase === 'reveal' && outcome?.status === 'timeout') return snapshot(db, run, now);
    throw problem(409, 'This round is already locked.');
  }
  if (action === 'skip') return snapshot(db, await conclude(db, run, r, 'skipped', null, now), now);
  const result = await match(db, r.release_id, r.prompt_id, body.answer, { suggest: true });
  if (!result.answer) return snapshot(db, run, now, result);
  return snapshot(db, await conclude(db, run, r, 'accepted', result.answer, now), now);
}

function signCommand(actor, path, body) {
  const fields = Object.keys(body)
    .sort()
    .map((k) => [k, body[k]]);
  return createHmac('sha256', process.env.SESSION_SECRET || 'penicillion-local-command-proof')
    .update(JSON.stringify([actor, path, fields]))
    .digest('hex');
}
async function idempotent(db, actor, path, body, now, command) {
  requireThat(
    typeof body.commandId === 'string' && commandPattern.test(body.commandId),
    400,
    'A valid command ID is required.',
  );
  const signature = signCommand(actor, path, body);
  const old = await one(db, 'SELECT signature,response FROM solo_cmd WHERE actor_id=$1 AND id=$2', [
    actor,
    body.commandId,
  ]);
  if (old) {
    requireThat(old.signature === signature, 409, 'A command ID was reused with different input.');
    const cached = old.response;
    if (cached.mode === 'archive') await assertArchiveAvailable(db, actor, cached.date, now);
    if (cached.phase === 'recap') {
      const { rows } = await db.query('SELECT slot,prompt_id FROM solo_round WHERE run_id=$1', [
        cached.id,
      ]);
      const blocked = await activeSpoilerGuard(
        db,
        actor,
        now,
        rows.map((r) => r.prompt_id),
        cached.mode === 'practice' ? null : cached.date,
      );
      for (const row of rows)
        if (blocked.has(row.prompt_id)) {
          const result = cached.results.find((r) => r.slot === row.slot);
          if (result) result.alternative = null;
          if (cached.bestFind?.slot === row.slot) cached.bestFind.alternative = null;
        }
    }
    return displayRunTiers(cached);
  }
  let response;
  try {
    response = await command();
  } catch (error) {
    // A stale command may already have materialized an expired round. Keep both
    // that decision and the original client error across an identical retry.
    if (![400, 403, 404, 409].includes(error.status)) throw error;
    response = { soloCommandFailure: { status: error.status, message: error.message } };
  }
  await db.query('INSERT INTO solo_cmd VALUES($1,$2,$3,$4::jsonb,$5)', [
    actor,
    body.commandId,
    signature,
    JSON.stringify(response),
    now,
  ]);
  return response;
}
async function applyCommand(pool, actor, path, body, now, fn) {
  const value = await transaction(pool, async (db) => {
    await principal(db, actor);
    return idempotent(db, actor, path, body, now, () => fn(db));
  });
  if (value.soloCommandFailure)
    throw problem(value.soloCommandFailure.status, value.soloCommandFailure.message);
  return value;
}
async function report(db, actor, id, body, now) {
  requireThat(
    Number.isInteger(body.slot) &&
      body.slot >= 1 &&
      body.slot <= 7 &&
      typeof body.text === 'string',
    400,
    'Select a round and enter the missing term.',
  );
  const note = body.text.normalize('NFC').trim();
  requireThat(
    note.length > 0 &&
      Array.from(note).length <= 280 &&
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(note),
    400,
    'Use 1–280 characters.',
  );
  const run = await ownRun(db, actor, id, now);
  requireThat(run.phase === 'recap', 403, 'Finish the run to report a missing term.');
  const { n, oldest } = await one(
    db,
    'SELECT count(*)::int AS n,min(created_at) AS oldest FROM solo_report WHERE actor_id=$1 AND created_at>$2',
    [actor, now - 86400000],
  );
  if (n >= 5)
    throw Object.assign(problem(429, 'Five reports are allowed in each 24-hour period.'), {
      retryAfter: Math.max(1, Math.ceil((Number(oldest) + 86400000 - now) / 1000)),
    });
  const round = await one(db, 'SELECT id FROM solo_round WHERE run_id=$1 AND slot=$2', [
    id,
    body.slot,
  ]);
  await db.query('INSERT INTO solo_report VALUES($1,$2,$3,$4,$5)', [
    randomUUID(),
    actor,
    round.id,
    note,
    now,
  ]);
  return { received: true };
}
async function explorer(db, actor, date, now) {
  const today = easternDate(now);
  requireThat(
    validDate(date) && date < today,
    403,
    'The annotated explorer opens after the issue resets.',
  );
  const day = await issue(db, date);
  requireThat(day, 404, 'Issue not found.');
  await assertArchiveAvailable(db, actor, date, now);
  const { rows: prompts } = await db.query(
    `SELECT s.slot,s.prompt_id,p.prompt,p.scope FROM solo_issue_slot s JOIN solo_prompt p
  ON p.release_id=s.release_id AND p.id=s.prompt_id WHERE s.date=$1 ORDER BY s.slot`,
    [date],
  );
  const blocked = await activeSpoilerGuard(
    db,
    actor,
    now,
    prompts.map((p) => p.prompt_id),
  );
  const { rows: answers } = await db.query(
    `SELECT s.slot,m.term,m.tier,m.points,m.fact,m.reason,m.source_label,m.source_url
  FROM solo_issue_slot s JOIN solo_mapping m USING(release_id,prompt_id) WHERE s.date=$1 AND NOT(s.prompt_id=ANY($2::text[]))
  ORDER BY s.slot,m.points DESC,m.term`,
    [date, [...blocked]],
  );
  return {
    issue: issueOf(day),
    prompts: prompts.map((p) => ({
      slot: p.slot,
      prompt: p.prompt,
      scope: p.scope,
      withheld: blocked.has(p.prompt_id),
      answers: answers
        .filter((a) => a.slot === p.slot)
        .map(({ term, points, fact, reason, source_label, source_url }) => ({
          term,
          tier: rarityFor(points).label,
          points,
          fact,
          reason,
          source: { label: source_label, url: source_url },
        })),
    })),
  };
}

export function makeSolo(pool) {
  async function handle({ method, path, actorId: actor, body, now = Date.now() }) {
    requireThat(typeof actor === 'string' && actor.length > 0, 401, 'A guest session is required.');
    const url = new URL(path, 'http://localhost'),
      p = url.pathname,
      today = easternDate(now);
    const allowedQuery =
      method === 'GET'
        ? { '/api/archive': 'before', '/api/history': 'before', '/api/distribution': 'date' }[p]
        : undefined;
    for (const key of url.searchParams.keys()) {
      requireThat(
        key === allowedQuery && url.searchParams.getAll(key).length === 1,
        400,
        'Unexpected or repeated query parameter.',
      );
    }
    if (method === 'GET') {
      if (p === '/api/daily') {
        const issueRow = await issue(pool, today);
        requireThat(issueRow, 503, 'The next issue is awaiting its schedule.');
        const existing = await one(
          pool,
          'SELECT id,phase FROM solo_run WHERE actor_id=$1 AND date=$2 AND ranked',
          [actor, today],
        );
        const carry = await one(
          pool,
          `SELECT id,date,expires_at FROM solo_run WHERE actor_id=$1 AND ranked AND completed_at IS NULL
     AND expires_at>$2 AND date<$3 ORDER BY date DESC LIMIT 1`,
          [actor, now, today],
        );
        return {
          issue: issueOf(issueRow),
          runId: existing?.id ?? null,
          phase: existing?.phase ?? 'landing',
          serverNow: now,
          carryOver: carry
            ? { id: carry.id, date: carry.date, graceUntil: Number(carry.expires_at) }
            : null,
        };
      }
      if (p === '/api/archive') {
        const before = url.searchParams.get('before') ?? today;
        requireThat(validDate(before), 400, 'Use a civil date.');
        const { rows } = await pool.query(
          'SELECT date,number FROM solo_issue WHERE date<$1 AND date<$2 ORDER BY date DESC LIMIT 36',
          [before, today],
        );
        return { issues: rows, nextBefore: rows.length === 36 ? rows.at(-1).date : null };
      }
      const exp = /^\/api\/archive\/(\d{4}-\d\d-\d\d)\/explorer$/.exec(p);
      if (exp) return explorer(pool, actor, exp[1], now);
      if (p === '/api/history') {
        const before = url.searchParams.get('before');
        requireThat(
          before === null || /^\d{1,16}:[A-Za-z0-9_-]{8,96}$/.test(before),
          400,
          'Invalid history cursor.',
        );
        const [stamp, id] = before ? before.split(':') : [Number.MAX_SAFE_INTEGER, '~'];
        const { rows } = await pool.query(
          `SELECT id,mode,date,ranked,total,completed_at,created_at,
     CASE WHEN completed_at IS NULL AND expires_at<=$4 THEN 'expired' ELSE phase END AS phase FROM solo_run
     WHERE actor_id=$1 AND (created_at,id)<($2::bigint,$3::text) ORDER BY created_at DESC,id DESC LIMIT 36`,
          [actor, stamp, id, now],
        );
        return {
          stats: await boards.stats(pool, actor, now),
          runs: rows.map((r) => ({
            id: r.id,
            mode: r.mode,
            date: r.date,
            ranked: r.ranked,
            phase: r.phase,
            total: r.total,
            createdAt: Number(r.created_at),
            completedAt: r.completed_at === null ? null : Number(r.completed_at),
          })),
          nextBefore: rows.length === 36 ? rows.at(-1).created_at + ':' + rows.at(-1).id : null,
        };
      }
      if (p === '/api/distribution') {
        const date = url.searchParams.get('date') ?? today;
        requireThat(validDate(date) && date <= today, 400, 'Invalid issue date.');
        return boards.distribution(pool, actor, date, now);
      }
      const run = /^\/api\/runs\/([a-zA-Z0-9_-]{8,96})$/.exec(p);
      if (run)
        return transaction(pool, async (db) => {
          await principal(db, actor);
          return snapshot(db, await settle(db, await ownRun(db, actor, run[1], now), now), now);
        });
    }
    if (method === 'POST') {
      if (p === '/api/runs') {
        fields(body, ['mode', 'date', 'untimed', 'commandId']);
        return applyCommand(pool, actor, p, body, now, (db) => start(db, actor, body, now));
      }
      const action = /^\/api\/runs\/([a-zA-Z0-9_-]{8,96})\/(answer|skip|next|report)$/.exec(p);
      if (action) {
        if (action[2] === 'report') {
          fields(body, ['slot', 'text', 'commandId']);
          if (body.commandId !== undefined)
            return applyCommand(pool, actor, p, body, now, (db) =>
              report(db, actor, action[1], body, now),
            );
          return transaction(pool, async (db) => {
            await principal(db, actor);
            return report(db, actor, action[1], body, now);
          });
        }
        fields(
          body,
          action[2] === 'answer' ? ['answer', 'roundId', 'commandId'] : ['roundId', 'commandId'],
        );
        requireThat(
          typeof body.roundId === 'string' && idPattern.test(body.roundId),
          400,
          'A round ID is required.',
        );
        if (action[2] === 'answer')
          requireThat(
            typeof body.answer === 'string' &&
              body.answer.length <= 96 &&
              !body.answer.includes('\0'),
            400,
            'Use a term of at most 96 characters.',
          );
        return applyCommand(pool, actor, p, body, now, (db) =>
          advance(db, actor, action[1], action[2], body, now),
        );
      }
    }
    throw problem(404, 'No such game route.');
  }
  async function relayPool(db = pool, now = Date.now()) {
    const release = await latestRelease(db);
    const { rows } = await db.query(
      `SELECT p.id,p.prompt,p.scope,count(m.concept_id)::int AS n FROM solo_prompt p JOIN solo_mapping m
   ON m.release_id=p.release_id AND m.prompt_id=p.id WHERE p.release_id=$1 AND p.pool='open'
   AND NOT EXISTS(SELECT 1 FROM solo_issue_slot i WHERE i.prompt_id=p.id AND i.date>=$2)
   GROUP BY p.id,p.prompt,p.scope HAVING count(m.concept_id)>=8 ORDER BY p.id`,
      [release, easternDate(now)],
    );
    return rows.map((r) => ({
      id: Buffer.from(JSON.stringify([release, r.id])).toString('base64url'),
      text: r.prompt,
      scope: r.scope,
      answerCount: r.n,
    }));
  }
  async function relayMatch(key, input, db = pool) {
    if (typeof key !== 'string' || key.length > 1024) return null;
    let parts;
    try {
      parts = JSON.parse(Buffer.from(key, 'base64url').toString());
    } catch {
      return null;
    }
    if (!Array.isArray(parts) || parts.length !== 2 || !parts.every((p) => typeof p === 'string'))
      return null;
    const { answer } = await match(db, parts[0], parts[1], input);
    return answer ? { ...answer, tier: rarityFor(answer.points).label } : null;
  }
  return {
    handle,
    relayPool,
    relayMatch,
    timeZoneDate: easternDate,
    claimPreview: (g, a, c = pool) => boards.claimPreview(c, g, a),
    claimGuest: (g, a, c) => boards.claimGuest(c, g, a),
    deleteActor: (a, c) => boards.deleteActor(c, a),
    completed: (a, d, c = pool) => boards.completed(c, a, d),
    stats: (a, n = Date.now(), c = pool) => boards.stats(c, a, n),
    distribution: (a, d, n = Date.now(), c = pool) => boards.distribution(c, a, d, n),
  };
}
