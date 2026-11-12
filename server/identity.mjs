import * as oidc from 'openid-client';
import {
  cookieName,
  origin,
  issuer,
  oidcClientId,
  oidcSecret,
  nonce,
  production,
} from './config.mjs';
import { pool, transaction, one, need, problem, fields, hash, id, equal } from './core.mjs';

const expiresAfter = 30 * 86400_000;
export function readCookie(headers) {
  const raw = headers.cookie
    ?.split(/;\s*/)
    .find((s) => s.startsWith(cookieName + '='))
    ?.slice(cookieName.length + 1);
  return raw && /^[\w-]{32}$/.test(raw) ? hash(raw) : null;
}
async function issueSession(client, actor, pending, res) {
  const raw = nonce(),
    csrf = nonce();
  const digest = hash(raw);
  await client.query(
    'INSERT INTO sessions(digest,actor,csrf,expires,pending_guest) VALUES($1,$2,$3,$4,$5)',
    [digest, actor, csrf, Date.now() + expiresAfter, pending],
  );
  const cookie =
    cookieName +
    '=' +
    raw +
    '; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000' +
    (production ? '; Secure' : '');
  res.setHeader('Set-Cookie', cookie);
  return digest;
}
export async function getSession(headers, client = pool) {
  const digest = readCookie(headers);
  if (!digest) return null;
  return one(
    client,
    `SELECT s.digest,s.csrf,s.pending_guest,p.id,p.kind,p.handle,p.listed,p.share_answers,p.excluded FROM sessions s JOIN principals p ON p.id=s.actor WHERE s.digest=$1 AND s.expires>$2 AND p.claimed_by IS NULL`,
    [digest, Date.now()],
  );
}
export async function guest(res) {
  return transaction(async (client) => {
    const actor = id();
    await client.query("INSERT INTO principals(id,kind,created_at) VALUES($1,'guest',$2)", [
      actor,
      Date.now(),
    ]);
    const digest = await issueSession(client, actor, null, res);
    const s = await one(client, 'SELECT csrf FROM sessions WHERE digest=$1', [digest]);
    return {
      id: actor,
      kind: 'guest',
      handle: null,
      listed: false,
      share_answers: false,
      csrf: s.csrf,
      digest,
      pending_guest: null,
    };
  });
}
export async function sessionView(s, solo) {
  const preview = s.pending_guest ? await solo.claimPreview(s.pending_guest, s.id) : null;
  return {
    actor: {
      id: s.id,
      kind: s.kind,
      handle: s.handle,
      listed: s.listed,
      shareAnswers: s.share_answers,
    },
    csrfToken: s.csrf,
    claim: preview,
    localLogin: !production,
  };
}
let discovery;
async function configuration() {
  if (!discovery)
    discovery = oidc
      .discovery(
        new URL(issuer),
        oidcClientId,
        oidcSecret,
        undefined,
        production ? {} : { execute: [oidc.allowInsecureRequests] },
      )
      .catch((e) => {
        discovery = null;
        throw e;
      });
  return discovery;
}
export async function login(s, body) {
  fields(body, []);
  const config = await configuration();
  const state = oidc.randomState(),
    challengeNonce = oidc.randomNonce(),
    verifier = oidc.randomPKCECodeVerifier();
  await pool.query('INSERT INTO login_attempts VALUES($1,$2,$3,$4,$5)', [
    hash(state),
    s.digest,
    verifier,
    challengeNonce,
    Date.now() + 300_000,
  ]);
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: origin + '/auth/callback',
    scope: 'openid',
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
    state,
    nonce: challengeNonce,
    prompt: production ? 'select_account' : 'login',
  });
  return { url: url.href };
}
export async function callback(requestUrl, s, res) {
  const url = new URL(requestUrl, origin),
    state = url.searchParams.get('state') || '';
  const row = await one(
    pool,
    'DELETE FROM login_attempts WHERE state=$1 AND session_digest=$2 AND expires>$3 RETURNING *',
    [hash(state), s.digest, Date.now()],
  );
  need(row, 400, 'This sign-in has expired. Please start again.');
  let claims;
  try {
    const config = await configuration();
    const token = await oidc.authorizationCodeGrant(config, url, {
      pkceCodeVerifier: row.verifier,
      expectedState: state,
      expectedNonce: row.nonce,
      idTokenExpected: true,
    });
    claims = token.claims();
  } catch {
    throw problem(400, 'The identity provider could not verify this sign-in.');
  }
  need(
    claims?.iss === issuer && typeof claims.sub === 'string',
    403,
    'Unrecognized identity provider.',
  );
  await transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      issuer + '|' + claims.sub,
    ]);
    let account = (
      await one(client, 'SELECT actor FROM identities WHERE issuer=$1 AND subject=$2', [
        issuer,
        claims.sub,
      ])
    )?.actor;
    if (!account) {
      account = id();
      await client.query("INSERT INTO principals(id,kind,created_at) VALUES($1,'account',$2)", [
        account,
        Date.now(),
      ]);
      await client.query('INSERT INTO identities VALUES($1,$2,$3)', [issuer, claims.sub, account]);
    }
    const unused = await one(client, 'DELETE FROM sessions WHERE digest=$1 RETURNING actor', [
      s.digest,
    ]);
    need(unused, 401, 'Start sign-in again.');
    await issueSession(client, account, s.kind === 'guest' ? s.id : null, res);
  });
}
const protectedWords = new Set(
  'admin administrator staff moderator penicillion support root guest doctor system official everyone null undefined'.split(
    ' ',
  ),
);
const prohibited = /fuck|shit|cunt|nigg|fagg|nazi|hitler|rape|kike/i;
export function validHandle(value) {
  return (
    typeof value === 'string' &&
    /^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(value) &&
    !protectedWords.has(value.toLowerCase()) &&
    !prohibited.test(value)
  );
}
export function validateCsrf(s, value) {
  need(equal(s.csrf, value), 403, 'Refresh the page to renew your form.');
}
export async function accountAction(path, s, body, res, solo, exitRooms) {
  if (path === '/api/login') return login(s, body);
  need(s.kind === 'account', 403, 'Sign in to use your account.');
  if (path === '/api/logout' || path === '/api/account/delete') {
    if (path.endsWith('delete')) {
      fields(body, ['confirm']);
      need(body.confirm === 'DELETE', 400, 'Confirm account deletion.');
    } else fields(body, []);
    await exitRooms(s.id);
    await transaction(async (c) => {
      await c.query('SELECT id FROM principals WHERE id=$1 FOR UPDATE', [s.id]);
      if (path.endsWith('delete')) {
        await solo.deleteActor(s.id, c);
        const owned = await c.query(
          "SELECT g.id FROM friend_groups g JOIN memberships m ON m.gid=g.id WHERE m.actor=$1 AND m.role='owner' ORDER BY g.id FOR UPDATE OF g",
          [s.id],
        );
        for (const { id: gid } of owned.rows) {
          const next = await one(
            c,
            'SELECT actor FROM memberships WHERE gid=$1 AND actor<>$2 ORDER BY joined,actor LIMIT 1',
            [gid, s.id],
          );
          if (next)
            await c.query("UPDATE memberships SET role='owner' WHERE gid=$1 AND actor=$2", [
              gid,
              next.actor,
            ]);
          else await c.query('DELETE FROM friend_groups WHERE id=$1', [gid]);
        }
        await c.query('DELETE FROM principals WHERE id=$1', [s.id]);
      } else await c.query('DELETE FROM sessions WHERE digest=$1', [s.digest]);
    });
    return sessionView(await guest(res), solo);
  }
  if (path === '/api/profile') {
    fields(body, ['handle', 'listed', 'shareAnswers']);
    need(
      validHandle(body.handle) &&
        typeof body.listed === 'boolean' &&
        typeof body.shareAnswers === 'boolean',
      400,
      'Use a handle of 3–20 letters, numbers or underscores, starting with a letter. Choose both privacy settings.',
    );
    try {
      await pool.query('UPDATE principals SET handle=$2,listed=$3,share_answers=$4 WHERE id=$1', [
        s.id,
        body.handle,
        body.listed,
        body.shareAnswers,
      ]);
    } catch (e) {
      if (e.code === '23505') throw problem(409, 'That handle is already taken.');
      throw e;
    }
    return sessionView(
      { ...s, handle: body.handle, listed: body.listed, share_answers: body.shareAnswers },
      solo,
    );
  }
  need(path === '/api/claim', 404, 'Unknown account action.');
  fields(body, ['import']);
  need(typeof body.import === 'boolean', 400, 'Choose whether to import your guest history.');
  await transaction(async (c) => {
    const fresh = await one(c, 'SELECT pending_guest FROM sessions WHERE digest=$1 FOR UPDATE', [
      s.digest,
    ]);
    need(fresh?.pending_guest, 409, 'This guest choice is already complete.');
    const guestId = fresh.pending_guest;
    await c.query('SELECT id FROM principals WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE', [
      [guestId, s.id],
    ]);
    if (body.import) {
      const source = await one(
        c,
        "UPDATE principals SET claimed_by=$2 WHERE id=$1 AND kind='guest' AND claimed_by IS NULL RETURNING id",
        [guestId, s.id],
      );
      need(source, 409, 'This guest has already been imported.');
      await solo.claimGuest(guestId, s.id, c);
      await c.query('DELETE FROM sessions WHERE actor=$1', [guestId]);
    }
    await c.query('UPDATE sessions SET pending_guest=NULL WHERE digest=$1', [s.digest]);
  });
  return sessionView({ ...s, pending_guest: null }, solo);
}
