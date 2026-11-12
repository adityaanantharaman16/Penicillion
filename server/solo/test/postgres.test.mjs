import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrateSolo, seed, makeSolo } from '../index.mjs';
import { easternDate, resetAfter, shiftDate, transaction } from '../calendar.mjs';
import { match, oneEdit } from '../match.mjs';

// Synthetic fixtures live in a different PostgreSQL schema and never enter the
// launch catalog, public traffic, metrics, or named player boards.
function fixture() {
  const source = {
    id: 'fixture',
    label: 'Synthetic test record',
    url: 'https://example.invalid/fixture',
    license: 'test',
    version: '1',
  };
  const pairs = [
    ['Scalpel', 10, ['scalpels']],
    ['Rongeur', 85, ['bone nibbler']],
    ['Microtome', 30, []],
    ['Brachiator', 100, []],
    ['Retractor', 10, []],
    ['Forceps', 10, []],
    ['Needle holder', 30, []],
    ['Frobnicator', 100, []],
  ];
  const tiers = [
    { name: 'Common', points: 10 },
    { name: 'Middle', points: 30 },
    { name: 'Rare', points: 85 },
    { name: 'Top', points: 100 },
  ];
  const answers = pairs.map(([term, points, aliases]) => ({
    id: 'fixture-' + term.toLowerCase(),
    term,
    aliases,
    tier: tiers.find((t) => t.points === points).name,
    points,
    reason: 'Test rationale.',
    fact: 'Test fact.',
    source,
    evidence: 'Test relationship.',
  }));
  return {
    id: 'test.1',
    scoringRelease: 'test.tiers.1',
    sources: [source],
    tiers,
    prompts: Array.from({ length: 79 }, (_, i) => ({
      id: 'q' + String(i).padStart(2, '0'),
      topic: 'family' + (i % 8),
      text: 'Synthetic prompt ' + i,
      scope: 'Synthetic scope.',
      pool: i < 64 ? 'daily' : 'open',
      answers,
      ambiguous: ['arm'],
      exclusions: ['implant', 'ileum'],
    })),
  };
}
const secret = 'postgresql://penicillion:local-game@127.0.0.1:55442/penicillion';
const d0 = Date.parse('2026-10-31T16:00:00Z');

test('Eastern calendar handles short and long days', () => {
  assert.equal(easternDate(Date.parse('2026-11-01T03:59:59Z')), '2026-10-31');
  assert.equal(resetAfter('2026-10-31'), Date.parse('2026-11-01T04:00:00Z'));
  assert.equal(resetAfter('2026-11-01') - resetAfter('2026-10-31'), 25 * 3600000);
  assert.equal(resetAfter('2026-03-08') - resetAfter('2026-03-07'), 23 * 3600000);
  assert.equal(shiftDate('2028-03-01', -1), '2028-02-29');
  assert.ok(oneEdit('rongeuers', 'rongeuerss'));
});

test('PostgreSQL game, two independent connection pools, synthetic clock', async (t) => {
  const connectionString = process.env.DATABASE_URL || secret;
  const admin = new pg.Pool({ connectionString, max: 1 });
  const schema = 'solo_test_' + randomUUID().replaceAll('-', '');
  const options = { connectionString, options: '-c search_path=' + schema, max: 4 };
  const first = new pg.Pool(options),
    second = new pg.Pool(options);
  let created = false;
  t.after(async () => {
    await Promise.all([first.end(), second.end()]);
    if (created) await admin.query('DROP SCHEMA "' + schema + '" CASCADE');
    await admin.end();
  });
  await admin.query('CREATE SCHEMA "' + schema + '"');
  created = true;
  await first.query(await readFile(new URL('../../001-core.sql', import.meta.url), 'utf8'));
  await migrateSolo(first);
  const release = fixture();
  await seed(first, release, d0, { past: 10, future: 30 });
  const a = makeSolo(first),
    b = makeSolo(second);
  const actor = async (id) => {
    await first.query("INSERT INTO principals(id,kind,created_at) VALUES($1,'guest',0)", [id]);
    return id;
  };
  const call = (api, id, path, body, now = d0) =>
    api.handle({ actorId: id, method: body ? 'POST' : 'GET', path, body, now });
  const cmd = (data = {}) => ({ ...data, commandId: randomUUID() });
  const post = (id, path, data, now = d0) => call(a, id, path, cmd(data), now);
  const take = (id, r, act, answer, now = d0) =>
    post(
      id,
      '/api/runs/' + r.id + '/' + act,
      { roundId: r.roundId, ...(answer ? { answer } : {}) },
      now,
    );
  const finish = async (id, r, now = d0, answer = 'rongeur') => {
    for (let i = r.take; i <= 7; i++) {
      if (r.phase === 'prompt') r = await take(id, r, 'answer', answer, now + i * 100);
      r = await take(id, r, 'next', null, now + i * 100 + 1);
    }
    return r;
  };
  await t.test('immutable content, schedule is idempotent and spaced', async () => {
    assert.equal((await seed(first, release, d0, { past: 10, future: 30 })).added, 0);
    await assert.rejects(
      () => seed(first, { ...release, scoringRelease: 'repriced' }, d0),
      /different contents/,
    );
    await assert.rejects(
      () =>
        seed(
          first,
          {
            ...release,
            id: 'unplayable',
            prompts: release.prompts.filter((p) => p.pool === 'daily'),
          },
          d0,
        ),
      /open prompts/,
    );
    const duplicate = structuredClone(release);
    duplicate.id = 'duplicate';
    duplicate.prompts[0].answers[0].aliases.push('SCALPEL');
    await assert.rejects(() => seed(first, duplicate, d0), /Alias conflict/);
    const reclassified = structuredClone(release);
    reclassified.id = 'former-daily-ids-only';
    reclassified.prompts.forEach((p, i) => {
      p.pool = i < 10 ? 'open' : 'daily';
    });
    await assert.rejects(
      () => seed(first, reclassified, d0, { past: 10, future: 30 }),
      /unreserved open/,
    );
    await assert.rejects(
      () => first.query("UPDATE solo_mapping SET points=100 WHERE concept_id='fixture-scalpel'"),
      /immutable/,
    );
    assert.equal(
      Number(
        (
          await first.query(`SELECT count(*) FROM solo_issue_slot a JOIN solo_issue_slot b ON a.prompt_id=b.prompt_id AND
    b.date>a.date AND b.date::date-a.date::date<=7`)
        ).rows[0].count,
      ),
      0,
    );
  });
  await t.test(
    'two-tab starts, retry, typo confirmation, reveal hold and canonical scoring',
    async () => {
      const id = await actor('player1');
      await assert.rejects(() => call(a, id, '/api/runs?points=700', cmd({ mode: 'daily' })), {
        status: 400,
      });
      const [r, s] = await Promise.all([
        call(a, id, '/api/runs', cmd({ mode: 'daily' })),
        call(b, id, '/api/runs', cmd({ mode: 'daily' })),
      ]);
      assert.equal(r.id, s.id);
      assert.equal(r.deadline, d0 + 25000);
      assert.equal(r.results.length, 0);
      await assert.rejects(() => call(a, id, '/api/distribution'), { status: 403 });
      const typo = await take(id, r, 'answer', 'microtoem', d0 + 100);
      assert.equal(typo.suggestion, 'Microtome');
      assert.equal(typo.phase, 'prompt');
      assert.equal(typo.deadline, r.deadline);
      assert.match((await take(id, r, 'answer', 'arm')).feedback, /more than one/);
      assert.match((await take(id, r, 'answer', 'ileum')).feedback, /outside/);
      const path = '/api/runs/' + r.id + '/answer',
        submit = cmd({ roundId: r.roundId, answer: 'scalpels' });
      const [one, two] = await Promise.all([
        call(a, id, path, submit, d0 + 1000),
        call(b, id, path, submit, d0 + 1000),
      ]);
      assert.deepEqual(one, two);
      assert.equal(one.total, 10);
      assert.equal(one.results[0].term, 'Scalpel');
      assert.equal(one.results[0].tier, 'Classic');
      // Simulate a JSONB receipt written before the public vocabulary changed.
      await first.query(
        "UPDATE solo_cmd SET response=jsonb_set(response,'{results,0,tier}',to_jsonb('Common'::text)) WHERE actor_id=$1 AND id=$2",
        [id, submit.commandId],
      );
      assert.deepEqual(await call(b, id, path, submit, d0 + 1200), one);
      const oldReceipt = await first.query('SELECT response FROM solo_cmd WHERE actor_id=$1 AND id=$2', [id, submit.commandId]);
      assert.equal(oldReceipt.rows[0].response.results[0].tier, 'Common');
      assert.equal(one.results[0].alternative, undefined);
      await assert.rejects(() => call(b, id, path, { ...submit, answer: 'rongeur' }), {
        status: 409,
      });
      assert.equal((await call(b, id, '/api/runs/' + r.id, null, d0 + 60000)).phase, 'reveal');
      const next = await take(id, one, 'next', null, d0 + 61000);
      assert.equal(next.deadline, d0 + 86000);
      await assert.rejects(() => take(id, one, 'next', null, d0 + 62000), { status: 409 });
      const late = await take(id, next, 'answer', 'rongeur', next.deadline);
      assert.equal(late.phase, 'reveal');
      assert.equal(late.results[1].status, 'timeout');
      assert.equal(late.total, 10);
      const next3 = await take(id, late, 'next', null, next.deadline + 1);
      const skip = await take(id, next3, 'skip', null, next.deadline + 2);
      assert.equal(skip.results[2].points, 0);
      assert.equal(skip.results[2].status, 'skipped');
      const recap = await finish(id, skip, next.deadline + 3);
      assert.equal(recap.total, 350);
      assert.equal(recap.results.length, 7);
      assert.equal(recap.phase, 'recap');
      assert.ok(recap.results.every((r) => r.alternative?.term));
      assert.equal(recap.stats.currentStreak, 1);
      assert.equal(recap.distribution.sampleSize, 1);
      assert.equal(recap.distribution.status, 'collecting');
      assert.equal((await post(id, '/api/runs', { mode: 'daily' })).id, r.id);
      for (let i = 0; i < 5; i++)
        assert.equal(
          (
            await post(id, '/api/runs/' + r.id + '/report', {
              slot: 2,
              text: '<img src=x onerror=x>',
            })
          ).received,
          true,
        );
      await assert.rejects(
        () => post(id, '/api/runs/' + r.id + '/report', { slot: 2, text: 'x' }),
        { status: 429 },
      );
    },
  );
  await t.test(
    'private runs, unranked archive and practice, unseen preference and pinned relay matches',
    async () => {
      const id = await actor('player2');
      assert.equal((await call(a, id, '/api/history')).runs.length, 0);
      const practice = await post(id, '/api/runs', { mode: 'practice', untimed: true });
      assert.equal(practice.deadline, null);
      const seen = await finish(id, practice);
      assert.equal(seen.stats.completedDays, 0);
      assert.equal(seen.distribution, null);
      const next = await post(id, '/api/runs', { mode: 'practice' });
      assert.ok(!seen.results.some((r) => r.prompt === next.prompt));
      const archive = await post(id, '/api/runs', { mode: 'archive', date: '2026-10-30' });
      assert.equal(archive.ranked, false);
      assert.ok(archive.deadline);
      const explorer = await call(a, id, '/api/archive/2026-10-30/explorer');
      assert.equal(explorer.prompts.length, 7);
      await assert.rejects(() => call(a, id, '/api/archive/2026-10-31/explorer'), { status: 403 });
      const other = (await call(a, 'player1', '/api/history')).runs[0].id;
      await assert.rejects(() => call(a, id, '/api/runs/' + other), { status: 404 });
      const relay = await a.relayPool(first, d0);
      assert.equal(relay.length, 15);
      assert.deepEqual(
        await a.relayMatch(relay[0].id, 'SCALPELS'),
        await a.relayMatch(relay[0].id, 'scalpel'),
      );
      assert.equal(await a.relayMatch(relay[0].id, 'implant'), null);
    },
  );
  await t.test(
    'midnight overlap, grace hard boundary, distinct-date streak and unlock',
    async () => {
      const id = await actor('player3'),
        midnight = resetAfter('2026-10-31');
      const old = await post(id, '/api/runs', { mode: 'daily' }, midnight - 1000);
      const newer = await post(id, '/api/runs', { mode: 'daily' }, midnight + 1);
      assert.notEqual(old.id, newer.id);
      assert.equal((await call(a, id, '/api/daily', null, midnight + 2)).carryOver.id, old.id);
      await assert.rejects(
        () => call(a, id, '/api/archive/2026-10-31/explorer', null, midnight + 2),
        { status: 403 },
      );
      await assert.rejects(
        () => post(id, '/api/runs', { mode: 'archive', date: '2026-10-31' }, midnight + 2),
        { status: 403 },
      );
      const done = await finish(id, old, midnight + 100);
      assert.equal(done.date, '2026-10-31');
      assert.equal(
        (await call(a, id, '/api/archive/2026-10-31/explorer', null, midnight + 1000)).prompts
          .length,
        7,
      );
      const two = await finish(id, newer, midnight + 100);
      assert.equal(two.stats.currentStreak, 2);
      const day3 = resetAfter('2026-11-01') + 1000;
      const three = await finish(id, await post(id, '/api/runs', { mode: 'daily' }, day3), day3);
      assert.equal(three.stats.currentStreak, 3);
      assert.equal(three.stats.unlocks[0].days, 3);
      const afterMiss = await a.stats(id, day3 + 2 * 86400000);
      assert.equal(afterMiss.currentStreak, 0);
      assert.equal(afterMiss.unlocks.length, 1);
      const late = await actor('late');
      const pending = await post(late, '/api/runs', { mode: 'daily' }, midnight - 3);
      assert.equal(
        (await take(late, pending, 'answer', 'rongeur', midnight + 600000)).phase,
        'expired',
      );
      assert.equal((await a.stats(late, midnight + 600000)).completedDays, 0);
      assert.equal(
        (await call(a, late, '/api/archive/2026-10-31/explorer', null, midnight + 600000)).prompts
          .length,
        7,
      );
    },
  );
  await t.test(
    'archives never identify unopened daily slots, including through a cached recap retry',
    async () => {
      const id = await actor('archive-reader');
      const {
        rows: [past],
      } =
        await first.query(`SELECT other.date FROM solo_issue_slot today JOIN solo_issue_slot other USING(prompt_id)
   WHERE today.date='2026-10-31' AND today.slot=1 AND other.date<today.date ORDER BY other.date DESC LIMIT 1`);
      assert.ok(past);
      const explore = '/api/archive/' + past.date + '/explorer';
      assert.ok((await call(a, id, explore)).prompts.every((p) => p.answers.length && !p.withheld));
      let archive = await post(id, '/api/runs', { mode: 'archive', date: past.date });
      for (let i = 1; i <= 7; i++) {
        archive = await take(id, archive, 'answer', 'rongeur');
        if (i < 7) archive = await take(id, archive, 'next');
      }
      const nextPath = '/api/runs/' + archive.id + '/next',
        nextCommand = cmd({ roundId: archive.roundId });
      const firstLog = await call(a, id, nextPath, nextCommand);
      assert.ok(firstLog.results.every((r) => r.alternative));
      const daily = await post(id, '/api/runs', { mode: 'daily' });
      const published = await call(a, id, explore);
      for (const p of published.prompts) {
        assert.equal(p.withheld, p.prompt === daily.prompt);
        assert.equal(p.answers.length === 0, p.prompt === daily.prompt);
      }
      const retried = await call(b, id, nextPath, nextCommand);
      assert.equal(retried.total, firstLog.total);
      assert.equal(retried.results.find((r) => r.prompt === daily.prompt).alternative, null);
      assert.ok(
        retried.results.filter((r) => r.prompt !== daily.prompt).every((r) => r.alternative),
      );
    },
  );
  await t.test(
    'claim collision keeps existing incomplete account run, deletion invalidates counts',
    async () => {
      const account = await actor('account'),
        guest = await actor('guest');
      const preferred = await post(account, '/api/runs', { mode: 'daily' });
      for (const day of [d0 - 2 * 86400000, d0 - 86400000]) {
        await finish(guest, await post(guest, '/api/runs', { mode: 'daily' }, day), day);
      }
      const original = await finish(guest, await post(guest, '/api/runs', { mode: 'daily' }));
      assert.equal(original.stats.unlocks.length, 1);
      assert.equal((await a.claimPreview(guest, account)).collisions, 1);
      await transaction(first, (c) => a.claimGuest(guest, account, c));
      assert.equal((await post(account, '/api/runs', { mode: 'daily' })).id, preferred.id);
      assert.equal((await call(a, account, '/api/runs/' + original.id)).ranked, false);
      const merged = await a.stats(account, d0);
      assert.equal(merged.completedDays, 2);
      assert.equal(merged.bestStreak, 2);
      assert.equal(merged.unlocks[0].days, 3);
      assert.equal((await call(a, guest, '/api/history')).runs.length, 0);
      const before = await a.distribution('player1', '2026-10-31', d0);
      await transaction(first, (c) => a.deleteActor('player3', c));
      assert.equal(
        (await a.distribution('player1', '2026-10-31', d0 + 10)).sampleSize,
        before.sampleSize - 1,
      );
    },
  );
  await t.test('real aggregate bins with ties, exclusions and immutable old release', async () => {
    // Insert a known, isolated tally via the same start/run model; only this schema has synthetic totals.
    const date = '2026-10-28',
      now = Date.parse(date + 'T17:00:00Z'),
      owners = [];
    for (let i = 0; i < 20; i++) {
      const id = await actor('bin' + i);
      owners.push(id);
      const run = await post(id, '/api/runs', { mode: 'daily' }, now);
      const total = [100, 200, 200, 300][i % 4];
      await first.query("UPDATE solo_run SET total=$2,phase='recap',completed_at=$3 WHERE id=$1", [
        run.id,
        total,
        now,
      ]);
    }
    const dist = await a.distribution(owners[1], date, now);
    assert.equal(dist.percentile, 25);
    assert.equal(dist.you.rank, 6);
    assert.deepEqual(
      dist.bins.map((b) => b.count),
      [0, 5, 10, 5, 0, 0, 0],
    );
    await first.query('DELETE FROM solo_leader_cache WHERE date=$1', [date]);
    const rebuilt = await a.distribution(owners[1], date, now + 1);
    assert.equal(rebuilt.sampleSize, 20);
    assert.deepEqual(rebuilt.bins, dist.bins);
    await first.query('UPDATE principals SET excluded=true WHERE id=$1', [owners[0]]);
    assert.equal((await a.distribution(owners[1], date, now + 1)).status, 'collecting');
    const extra = await actor('extra-bin'),
      last = await post(extra, '/api/runs', { mode: 'daily' }, now);
    await first.query("UPDATE solo_run SET total=200,phase='recap',completed_at=$2 WHERE id=$1", [
      last.id,
      now,
    ]);
    const excluded = await a.distribution(owners[0], date, now + 2);
    assert.equal(excluded.status, 'ready');
    assert.equal(excluded.percentile, null);
    assert.equal(excluded.you.rank, null);
    const old = await call(a, 'player1', '/api/history');
    const runId = old.runs[0].id;
    const {
      rows: [firstSlot],
    } = await first.query('SELECT prompt_id FROM solo_round WHERE run_id=$1 AND slot=1', [runId]);
    const changed = structuredClone(release);
    changed.id = 'test.2';
    const edited = changed.prompts
      .find((p) => p.id === firstSlot.prompt_id)
      .answers.find((a) => a.term === 'Scalpel');
    edited.points = 100;
    edited.tier = 'Top';
    await seed(first, changed, d0 + 1000, { past: 10, future: 31 });
    assert.equal(
      (await match(first, release.id, firstSlot.prompt_id, 'scalpels')).answer.points,
      10,
    );
    assert.equal(
      (await match(first, changed.id, firstSlot.prompt_id, 'scalpels')).answer.points,
      100,
    );
    const frozen = await call(a, 'player1', '/api/runs/' + old.runs[0].id);
    assert.equal(frozen.total, 350);
    assert.equal(frozen.results[0].points, 10);
    assert.equal(frozen.results[0].tier, 'Classic');
  });
  await t.test(
    'claiming an excluded source keeps its scores out of eligible standings',
    async () => {
      const guest = await actor('excluded-source'),
        account = await actor('eligible-recipient');
      await first.query('UPDATE principals SET excluded=true WHERE id=$1', [guest]);
      const run = await finish(guest, await post(guest, '/api/runs', { mode: 'daily' }));
      const before = await a.distribution('player1', '2026-10-31', d0);
      const preview = await a.claimPreview(guest, account);
      assert.equal(preview.collisions, 0);
      assert.equal(preview.unrankedImports, 1);
      await transaction(first, (c) => a.claimGuest(guest, account, c));
      assert.equal((await call(a, account, '/api/runs/' + run.id)).ranked, false);
      assert.equal(
        (await a.distribution('player1', '2026-10-31', d0)).sampleSize,
        before.sampleSize,
      );
      assert.equal((await a.stats(account, d0)).completedDays, 0);
      assert.notEqual((await post(account, '/api/runs', { mode: 'daily' })).id, run.id);
    },
  );
});
