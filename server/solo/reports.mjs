// Private operator CLI. Report text is untrusted data; it is never interpreted.
import { pool as db } from '../database.mjs';
const [action = 'list', reportId, disposition, release] = process.argv.slice(2);
try {
  if (action === 'list' && reportId === undefined) {
    const { rows } =
      await db.query(`SELECT r.id,r.created_at,p.prompt,p.scope,r.note AS untrusted_player_text FROM solo_report r
  JOIN solo_round s ON s.id=r.round_id JOIN solo_prompt p ON p.release_id=s.release_id AND p.id=s.prompt_id
  LEFT JOIN solo_report_review v ON v.report_id=r.id WHERE v.report_id IS NULL ORDER BY r.created_at,r.id LIMIT 50`);
    for (const row of rows)
      console.log(JSON.stringify(row).replace(/[\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, ' '));
    if (!rows.length) console.log('No reports await review.');
  } else if (
    action === 'resolve' &&
    /^[a-f0-9-]{36}$/i.test(reportId ?? '') &&
    ((disposition === 'no-change' && release === undefined) ||
      (disposition === 'added' && typeof release === 'string' && release.length <= 160))
  ) {
    const { rowCount } = await db.query(
      `INSERT INTO solo_report_review(report_id,disposition,release_id,reviewed_at)
   SELECT r.id,$2,$3,$4 FROM solo_report r WHERE r.id=$1 AND
   ($2='no-change' OR EXISTS (SELECT 1 FROM solo_release WHERE id=$3 AND status='published'))
   ON CONFLICT DO NOTHING`,
      [reportId, disposition, release ?? null, Date.now()],
    );
    if (!rowCount) throw Error('No pending report or published target release matched.');
    console.log('Report review recorded.');
  } else
    throw Error(
      'Use list, resolve REPORT_ID no-change, or resolve REPORT_ID added PUBLISHED_RELEASE_ID.',
    );
} finally {
  await db.end();
}
