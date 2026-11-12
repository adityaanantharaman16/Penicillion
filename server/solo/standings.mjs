import { easternDate, problem, shiftDate } from './calendar.mjs';

const cosmetics = [
  { days: 3, name: 'Copper dish rim' },
  { days: 7, name: 'Sea-glass label' },
  { days: 14, name: 'Coral spore print' },
];
export async function completed(db, actor, date) {
  // Completion unlocks the comparison even for excluded test identities,
  // whose scores never enter the comparable population.
  return (
    (
      await db.query(
        'SELECT 1 FROM solo_run WHERE actor_id=$1 AND date=$2 AND ranked AND completed_at IS NOT NULL',
        [actor, date],
      )
    ).rowCount > 0
  );
}
export async function baseStats(db, actor, now) {
  const today = easternDate(now);
  const {
    rows: [row],
  } = await db.query(
    `WITH scores AS (
  SELECT date::date AS d,total FROM solo_ranked WHERE actor_id=$1 AND date<=$2
 ), sequenced AS (
  SELECT d,d-(row_number() OVER(ORDER BY d))::integer AS grp FROM scores
 ), streaks AS (SELECT max(d) AS ending,count(*)::int AS n FROM sequenced GROUP BY grp)
 SELECT COALESCE(max(n) FILTER(WHERE ending >= $3::date),0) AS current,
 COALESCE(max(n),0) AS best,(SELECT COALESCE(max(total),0) FROM scores) AS daily_best,
 (SELECT count(*)::int FROM scores) AS days FROM streaks`,
    [actor, today, shiftDate(today, -1)],
  );
  return {
    currentStreak: row.current,
    bestStreak: row.best,
    dailyBest: row.daily_best,
    completedDays: row.days,
  };
}
export async function unlock(db, actor, now) {
  const { bestStreak } = await baseStats(db, actor, now);
  const earned = cosmetics.filter((c) => c.days <= bestStreak).map((c) => c.days);
  if (earned.length)
    await db.query(
      `INSERT INTO solo_unlock(actor_id,milestone,earned_at)
 SELECT $1,d,$3 FROM unnest($2::int[]) d ON CONFLICT DO NOTHING`,
      [actor, earned, now],
    );
}
export async function stats(db, actor, now = Date.now()) {
  const base = await baseStats(db, actor, now);
  const { rows } = await db.query(
    'SELECT milestone,earned_at FROM solo_unlock WHERE actor_id=$1 ORDER BY milestone',
    [actor],
  );
  const unlocked = new Set(rows.map((r) => r.milestone));
  return {
    ...base,
    unlocks: cosmetics.filter((c) => unlocked.has(c.days)),
    nextCosmetic: cosmetics.find((c) => !unlocked.has(c.days)) ?? null,
  };
}
export async function distribution(db, actor, date, now = Date.now()) {
  const own = await db.query(
    `SELECT r.total,NOT p.excluded AS eligible FROM solo_run r JOIN principals p ON p.id=r.actor_id
 WHERE r.actor_id=$1 AND r.ranked AND r.date=$2 AND r.completed_at IS NOT NULL`,
    [actor, date],
  );
  if (!own.rowCount) throw problem(403, 'Finish this Daily Rounds issue to see its scores.');
  const { total: score, eligible } = own.rows[0];
  const lookup = 'SELECT epoch,cached_epoch,counts,updated_at FROM solo_leader_cache WHERE date=$1';
  let cache = (await db.query(lookup, [date])).rows[0];
  if (!cache) {
    // Losing a cache row is independent of losing an issued day or a score.
    // Writers use an upsert too, so a simultaneous completion cannot miss this
    // reconstruction's invalidation fence.
    await db.query('INSERT INTO solo_leader_cache(date) VALUES($1) ON CONFLICT DO NOTHING', [date]);
    cache = (await db.query(lookup, [date])).rows[0] ?? { epoch: -1, cached_epoch: -2 };
  }
  let counts = cache.counts;
  let updatedAt = Number(cache.updated_at);
  if (!counts || cache.epoch !== cache.cached_epoch) {
    const { rows } = await db.query(
      'SELECT total,count(*)::int AS n FROM solo_ranked WHERE date=$1 GROUP BY total ORDER BY total',
      [date],
    );
    counts = rows;
    updatedAt = now;
    // A concurrent change invalidates this aggregate. Only publish against the
    // epoch observed before the GROUP BY. The current read remains a real snapshot.
    await db.query(
      'UPDATE solo_leader_cache SET cached_epoch=epoch,counts=$2::jsonb,updated_at=$3 WHERE date=$1 AND epoch=$4',
      [date, JSON.stringify(counts), now, cache.epoch],
    );
  }
  const sampleSize = counts.reduce((n, r) => n + r.n, 0);
  if (sampleSize < 20)
    return {
      status: 'collecting',
      sampleSize,
      updatedAt,
      you: { total: score, rank: null, eligible },
      percentile: null,
      bins: [],
    };
  const lower = counts.reduce((n, r) => n + (r.total < score ? r.n : 0), 0);
  const greater = counts.reduce((n, r) => n + (r.total > score ? r.n : 0), 0);
  const bins = Array.from({ length: 7 }, (_, i) => ({
    min: i * 100,
    max: i === 6 ? 700 : (i + 1) * 100 - 1,
    count: 0,
  }));
  for (const r of counts) bins[Math.min(6, Math.floor(r.total / 100))].count += r.n;
  return {
    status: 'ready',
    sampleSize,
    updatedAt,
    you: { total: score, rank: eligible ? greater + 1 : null, eligible },
    percentile: eligible ? Math.floor((lower * 1000) / sampleSize) / 10 : null,
    bins,
  };
}
export async function claimPreview(db, guest, account) {
  const {
    rows: [r],
  } = await db.query(
    `SELECT count(*)::int AS runs,count(g.completed_at)::int AS completed,
 count(a.id)::int AS collisions,count(*) FILTER(WHERE g.ranked AND (source.excluded OR a.id IS NOT NULL))::int AS "unrankedImports"
 FROM solo_run g JOIN principals source ON source.id=g.actor_id LEFT JOIN solo_run a ON g.ranked AND a.ranked
 AND a.actor_id=$2 AND a.date=g.date WHERE g.actor_id=$1`,
    [guest, account],
  );
  return r;
}
export async function claimGuest(db, guest, account, now = Date.now()) {
  // The identity layer owns the enclosing transaction and locks both principals.
  await db.query(
    `UPDATE solo_run g SET ranked=false WHERE g.actor_id=$1 AND g.ranked AND
 (EXISTS(SELECT 1 FROM principals source WHERE source.id=$1 AND source.excluded) OR EXISTS
 (SELECT 1 FROM solo_run a WHERE a.actor_id=$2 AND a.date=g.date AND a.ranked))`,
    [guest, account],
  );
  await db.query('UPDATE solo_run SET actor_id=$2 WHERE actor_id=$1', [guest, account]);
  await db.query(
    `INSERT INTO solo_seen(actor_id,prompt_id,last_seen) SELECT $2,prompt_id,last_seen FROM solo_seen WHERE actor_id=$1
 ON CONFLICT(actor_id,prompt_id) DO UPDATE SET last_seen=GREATEST(EXCLUDED.last_seen,solo_seen.last_seen)`,
    [guest, account],
  );
  await db.query('DELETE FROM solo_seen WHERE actor_id=$1', [guest]);
  // Cosmetic gifts never affect ranked totals. Keep a legitimately earned
  // guest keepsake even when the account already owns a colliding daily.
  await db.query(
    `INSERT INTO solo_unlock(actor_id,milestone,earned_at) SELECT $2,milestone,earned_at FROM solo_unlock WHERE actor_id=$1
 ON CONFLICT(actor_id,milestone) DO UPDATE SET earned_at=LEAST(solo_unlock.earned_at,EXCLUDED.earned_at)`,
    [guest, account],
  );
  await db.query('DELETE FROM solo_unlock WHERE actor_id=$1', [guest]);
  await db.query('DELETE FROM solo_cmd WHERE actor_id=$1', [guest]);
  await db.query('UPDATE solo_report SET actor_id=$2 WHERE actor_id=$1', [guest, account]);
  await unlock(db, account, now);
}
export async function deleteActor(db, actor) {
  // Safe to call before an account deletion or on its own. Outcome deletion is
  // cascaded from the run. Dirty-board triggers invalidate every affected issue.
  await db.query('DELETE FROM solo_run WHERE actor_id=$1', [actor]);
  await db.query('DELETE FROM solo_seen WHERE actor_id=$1', [actor]);
  await db.query('DELETE FROM solo_cmd WHERE actor_id=$1', [actor]);
  await db.query('DELETE FROM solo_unlock WHERE actor_id=$1', [actor]);
}
