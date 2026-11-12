import {
  pool,
  one,
  rows,
  transaction,
  need,
  fields,
  id,
  idOK,
  hash,
  localDate,
  problem,
} from './core.mjs';
import { nonce, origin } from './config.mjs';
const groupName = (v) =>
  typeof v === 'string' &&
  /^[\p{L}\p{N}][\p{L}\p{N} ’'-]{1,38}$/u.test(v) &&
  !/fuck|shit|cunt|nigg|fagg|nazi/i.test(v);
const normalizedDate = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
async function membership(c, gid, actor) {
  const m = await one(c, 'SELECT role,joined FROM memberships WHERE gid=$1 AND actor=$2', [
    gid,
    actor,
  ]);
  need(m, 403, 'This group is private.');
  return m;
}
async function visibleMembers(c, gid, actor) {
  return rows(
    c,
    `SELECT p.id,p.handle,m.role,m.joined FROM memberships m JOIN principals p ON m.actor=p.id WHERE m.gid=$1 AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.actor=$2 AND b.target=p.id) OR (b.target=$2 AND b.actor=p.id)) ORDER BY m.joined,p.id LIMIT 100`,
    [gid, actor],
  );
}
export async function social(path, method, url, body, s, solo) {
  if (path === '/api/boards') {
    need(method === 'GET', 405, 'Use GET.');
    const date = url.searchParams.get('date') || localDate();
    need(normalizedDate(date) && date <= localDate(), 400, 'Choose a published game date.');
    need(await solo.completed(s.id, date), 403, 'Finish this daily to see the board.');
    const page = Number(url.searchParams.get('page') || 0);
    need(Number.isInteger(page) && page >= 0 && page < 1000, 400, 'Invalid page.');
    const list = await rows(
      pool,
      `SELECT handle,total,rank FROM (SELECT p.handle,r.total,rank() OVER (ORDER BY r.total DESC) AS rank FROM solo_ranked r JOIN principals p ON p.id=r.actor_id WHERE r.date=$1 AND p.listed AND p.handle IS NOT NULL AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.actor=$2 AND b.target=p.id) OR (b.target=$2 AND b.actor=p.id))) x ORDER BY rank,handle LIMIT 50 OFFSET $3`,
      [date, s.id, page * 50],
    );
    return { rows: list, date, updatedAt: Date.now() };
  }
  need(s.kind === 'account' && s.handle, 403, 'Sign in and choose a handle to use Friends.');
  if (path === '/api/groups' && method === 'GET')
    return {
      groups: await rows(
        pool,
        'SELECT g.id,g.name,m.role FROM memberships m JOIN friend_groups g ON g.id=m.gid WHERE m.actor=$1 ORDER BY g.name LIMIT 50',
        [s.id],
      ),
    };
  if (path === '/api/groups' && method === 'POST') {
    fields(body, ['name']);
    need(groupName(body.name), 400, 'Use a group name of 2–39 letters, numbers or spaces.');
    return transaction(async (c) => {
      await c.query('SELECT id FROM principals WHERE id=$1 FOR UPDATE', [s.id]);
      const { n } = await one(c, 'SELECT count(*) n FROM memberships WHERE actor=$1', [s.id]);
      need(n < 30, 409, 'Your group list is full.');
      const gid = id(),
        now = Date.now();
      await c.query('INSERT INTO friend_groups VALUES($1,$2,$3)', [gid, body.name, now]);
      await c.query("INSERT INTO memberships VALUES($1,$2,'owner',$3)", [gid, s.id, now]);
      return { id: gid };
    });
  }
  if (path === '/api/groups/join' && method === 'POST') {
    fields(body, ['token']);
    need(
      typeof body.token === 'string' && body.token.length === 32,
      400,
      'Enter a valid invitation.',
    );
    return transaction(async (c) => {
      await c.query('SELECT id FROM principals WHERE id=$1 FOR UPDATE', [s.id]);
      const memberships = await one(c, 'SELECT count(*) n FROM memberships WHERE actor=$1', [s.id]);
      need(memberships.n < 30, 409, 'Your group list is full.');
      const g = await one(
        c,
        `SELECT g.id FROM invitations i JOIN friend_groups g ON g.id=i.gid WHERE i.digest=$1 AND i.expires>$2 FOR UPDATE OF g,i`,
        [hash(body.token), Date.now()],
      );
      need(g, 404, 'Invitation expired or revoked.');
      const denied = await one(
        c,
        `SELECT 1 FROM group_bans WHERE gid=$1 AND actor=$2 UNION ALL SELECT 1 FROM memberships m JOIN blocks b ON b.actor=m.actor AND b.target=$2 OR b.target=m.actor AND b.actor=$2 WHERE m.gid=$1 LIMIT 1`,
        [g.id, s.id],
      );
      need(!denied, 403, 'This invitation is unavailable.');
      const size = await one(c, 'SELECT count(*) n FROM memberships WHERE gid=$1', [g.id]);
      need(size.n < 100, 409, 'Group is full.');
      await c.query("INSERT INTO memberships VALUES($1,$2,'member',$3) ON CONFLICT DO NOTHING", [
        g.id,
        s.id,
        Date.now(),
      ]);
      return { id: g.id };
    });
  }
  const match = /^\/api\/groups\/([\w-]+)(?:\/(invite|revoke|leave|remove|block|answers))?$/.exec(
    path,
  );
  need(match && idOK(match[1]), 404, 'Unknown group.');
  const [, gid, action] = match;
  if (method === 'GET') {
    const m = await membership(pool, gid, s.id),
      date = localDate(),
      unlocked = Boolean(await solo.completed(s.id, date)),
      members = await visibleMembers(pool, gid, s.id);
    if (action === 'answers') {
      const target = url.searchParams.get('member');
      need(unlocked && members.some((p) => p.id === target), 403, 'Answers are private.');
      const permission = await one(
        pool,
        `SELECT r.run_id FROM solo_ranked r JOIN principals p ON p.id=r.actor_id JOIN memberships m ON m.actor=p.id AND m.gid=$3 WHERE p.id=$1 AND p.share_answers AND r.date=$2 AND r.completed_at>=greatest(m.joined,$4::bigint)`,
        [target, date, gid, m.joined],
      );
      need(permission, 403, 'Answers are private.');
      const result = await solo.handle({
        method: 'GET',
        path: '/api/runs/' + permission.run_id,
        actorId: target,
        now: Date.now(),
      });
      return { rows: result.results.map(({ term, tier, points }) => ({ term, tier, points })) };
    }
    need(!action, 405, 'Use POST.');
    const group = await one(pool, 'SELECT name FROM friend_groups WHERE id=$1', [gid]);
    const base = {
      id: gid,
      ...group,
      role: m.role,
      members: members.map(({ id, handle, role }) => ({ id, handle, role })),
      locked: !unlocked,
      date,
      updatedAt: Date.now(),
      daily: [],
      weekly: [],
    };
    if (!unlocked) return base;
    const ids = members.map((p) => p.id);
    base.daily = await rows(
      pool,
      `SELECT p.id,p.handle,r.total,RANK() OVER(ORDER BY r.total DESC) rank,p.share_answers AS "canSeeAnswers" FROM memberships m JOIN principals p ON p.id=m.actor JOIN solo_ranked r ON r.actor_id=m.actor AND r.date=$2 WHERE m.gid=$1 AND m.actor=ANY($3::text[]) AND r.completed_at>=greatest(m.joined,$4::bigint) ORDER BY rank,p.handle`,
      [gid, date, ids, m.joined],
    );
    base.weekly = await rows(
      pool,
      `SELECT id,handle,total,rank() OVER(ORDER BY total DESC) rank FROM (SELECT p.id,p.handle,COALESCE(sum(r.total),0)::int total FROM memberships m JOIN principals p ON p.id=m.actor LEFT JOIN solo_ranked r ON r.actor_id=m.actor AND r.date BETWEEN to_char(date_trunc('week',$2::text::date::timestamp),'YYYY-MM-DD') AND $2 AND r.completed_at>=greatest(m.joined,$4::bigint) WHERE m.gid=$1 AND m.actor=ANY($3::text[]) GROUP BY p.id,p.handle) a ORDER BY rank,handle`,
      [gid, date, ids, m.joined],
    );
    return base;
  }
  need(method === 'POST', 405, 'Use POST.');
  return transaction(async (c) => {
    await c.query('SELECT id FROM friend_groups WHERE id=$1 FOR UPDATE', [gid]);
    const m = await membership(c, gid, s.id);
    if (action === 'remove' || action === 'block') {
      fields(body, ['id']);
      need(idOK(body.id) && body.id !== s.id, 400, 'Choose another member.');
      await membership(c, gid, body.id);
      if (action === 'block')
        await c.query('INSERT INTO blocks VALUES($1,$2) ON CONFLICT DO NOTHING', [s.id, body.id]);
      if (m.role === 'owner') {
        await c.query('DELETE FROM memberships WHERE gid=$1 AND actor=$2', [gid, body.id]);
        await c.query('INSERT INTO group_bans VALUES($1,$2) ON CONFLICT DO NOTHING', [
          gid,
          body.id,
        ]);
      } else {
        need(action === 'block', 403, 'Only the owner can remove members.');
        await c.query('DELETE FROM memberships WHERE gid=$1 AND actor=$2', [gid, s.id]);
      }
      return { ok: true };
    }
    fields(body, []);
    if (action === 'leave') {
      await c.query('DELETE FROM memberships WHERE gid=$1 AND actor=$2', [gid, s.id]);
      if (m.role === 'owner') {
        const next = await one(
          c,
          'SELECT actor FROM memberships WHERE gid=$1 ORDER BY joined,actor LIMIT 1',
          [gid],
        );
        if (next)
          await c.query("UPDATE memberships SET role='owner' WHERE gid=$1 AND actor=$2", [
            gid,
            next.actor,
          ]);
        else await c.query('DELETE FROM friend_groups WHERE id=$1', [gid]);
      }
      return { ok: true };
    }
    need(m.role === 'owner', 403, 'Only the owner can manage invitations.');
    need(action === 'invite' || action === 'revoke', 404, 'Unknown group action.');
    await c.query('DELETE FROM invitations WHERE gid=$1', [gid]);
    if (action === 'revoke') return { ok: true };
    const token = nonce();
    await c.query('INSERT INTO invitations VALUES($1,$2,$3)', [
      hash(token),
      gid,
      Date.now() + 7 * 86400_000,
    ]);
    return { token, url: origin + '/#invite/' + token };
  });
}
