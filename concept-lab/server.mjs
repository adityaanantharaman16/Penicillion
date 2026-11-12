import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHash, createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  matchInstrument, instrumentPrompt, instrumentScope, demoContentRelease
} from './private/content.mjs';

const lab = dirname(fileURLToPath(import.meta.url));
const lifetimeMs = 24 * 60 * 60 * 1000;
const takeMs = 25_000;
const takes = 2;
const cookieName = 'penicillion_concept_guest';
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'], ['.webp', 'image/webp'],
  ['.ttf', 'font/ttf'], ['.woff2', 'font/woff2'], ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'], ['.wav', 'audio/wav']
]);

class HttpError extends Error {
  constructor(status, message, state) {
    super(message);
    this.status = status;
    this.state = state;
  }
}

function privateGuestKey(token) {
  return createHash('sha256').update(token).digest('hex');
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function initial(concept) {
  return { concept, phase: 'landing', take: 1, roundId: null, deadline: null, results: [] };
}

function snapshot(state, serverNow, feedback) {
  return {
    ...state, prompt: instrumentPrompt, scope: instrumentScope, takes, serverNow,
    total: state.results.reduce((sum, result) => sum + result.points, 0),
    ...(feedback ? { feedback } : {})
  };
}

function openTake(state, now) {
  state.phase = 'prompt';
  state.take = state.results.length + 1;
  state.roundId = randomUUID();
  state.deadline = now + takeMs;
}

function conclude(state, status, result = {}) {
  const term = status === 'timeout' ? 'Time elapsed' : 'Skipped';
  state.results.push({
    status, term, tier: null, points: 0, fact: '', source: null, reason: '',
    ...result
  });
  state.phase = 'reveal';
  state.deadline = null;
}

function validateCommand(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'A command object is required.');
  }
  const { action, commandId } = body;
  if (!['start', 'answer', 'skip', 'next', 'replay'].includes(action)) {
    throw new HttpError(400, 'Unknown action.');
  }
  if (typeof commandId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(commandId)) {
    throw new HttpError(400, 'A command ID is required.');
  }
  const keys = ['action', 'commandId'];
  if (['answer', 'skip', 'next'].includes(action)) {
    keys.push('roundId');
    if (typeof body.roundId !== 'string' || !/^[a-zA-Z0-9-]{36}$/.test(body.roundId)) {
      throw new HttpError(400, 'A round ID is required.');
    }
  }
  if (action === 'answer') {
    keys.push('answer');
    if (typeof body.answer !== 'string' || body.answer.length > 96) {
      throw new HttpError(400, 'Use at most 96 characters.');
    }
  }
  if (Object.keys(body).some(key => !keys.includes(key))) {
    throw new HttpError(400, 'Unexpected command field.');
  }
}

function apply(state, command, now) {
  const stale = () => { throw new HttpError(409, 'The session has changed.', snapshot(state, now)); };
  if (command.roundId !== undefined && state.roundId !== command.roundId) stale();
  switch (command.action) {
    case 'start':
      if (state.phase !== 'landing') stale();
      openTake(state, now);
      break;
    case 'replay':
      if (state.phase !== 'recap') stale();
      Object.assign(state, initial(state.concept));
      openTake(state, now);
      break;
    case 'answer':
    case 'skip':
      if (state.phase !== 'prompt') {
        // An on-time UI tick and a late HTTP command can observe the same timeout.
        if (state.phase === 'reveal' && state.results.at(-1)?.status === 'timeout') break;
        stale();
      }
      if (command.action === 'skip') {
        conclude(state, 'skipped');
        break;
      }
      const result = matchInstrument(command.answer);
      if (!result) return "This demo index doesn’t recognize that answer. Try another instrument.";
      conclude(state, 'accepted', result);
      break;
    case 'next':
      if (state.phase !== 'reveal') stale();
      if (state.results.length < takes) openTake(state, now);
      else {
        state.phase = 'recap';
        state.roundId = null;
      }
      break;
  }
}

export function makeDemoService({ database = resolve(lab, '.local/demo.sqlite'), clock = Date.now } = {}) {
  if (database !== ':memory:') mkdirSync(dirname(database), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(database);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS demo_guest (
      key_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS demo_expiry ON demo_guest(expires);
    CREATE TABLE IF NOT EXISTS demo_play (
      guest TEXT NOT NULL REFERENCES demo_guest(key_hash) ON DELETE CASCADE,
      concept TEXT NOT NULL, release TEXT NOT NULL, state TEXT NOT NULL,
      PRIMARY KEY (guest, concept, release)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS demo_command (
      guest TEXT NOT NULL REFERENCES demo_guest(key_hash) ON DELETE CASCADE,
      concept TEXT NOT NULL, release TEXT NOT NULL, id TEXT NOT NULL,
      signature TEXT NOT NULL, status INTEGER NOT NULL, response TEXT NOT NULL,
      PRIMARY KEY (guest, concept, release, id)
    ) STRICT;
  `);
  const guestLookup = db.prepare('SELECT expires FROM demo_guest WHERE key_hash = ? AND expires > ?');
  const addGuest = db.prepare('INSERT INTO demo_guest VALUES (?, ?)');
  const expireGuests = db.prepare('DELETE FROM demo_guest WHERE expires <= ?');
  const playLookup = db.prepare('SELECT state FROM demo_play WHERE guest=? AND concept=? AND release=?');
  const savePlay = db.prepare(`INSERT INTO demo_play VALUES (?, ?, ?, ?)
    ON CONFLICT(guest, concept, release) DO UPDATE SET state=excluded.state`);
  const commandLookup = db.prepare(`SELECT signature, status, response FROM demo_command
    WHERE guest=? AND concept=? AND release=? AND id=?`);
  const saveCommand = db.prepare('INSERT INTO demo_command VALUES (?, ?, ?, ?, ?, ?, ?)');
  let nextCleanup = 0;

  function session(existingToken, now) {
    if (now >= nextCleanup) {
      expireGuests.run(now);
      nextCleanup = now + 3_600_000;
    }
    if (existingToken && guestLookup.get(privateGuestKey(existingToken), now)) return existingToken;
    const token = randomBytes(32).toString('base64url');
    addGuest.run(privateGuestKey(token), now + lifetimeMs);
    return token;
  }

  // All checks and writes are synchronous inside a single transaction. The
  // stored response and the resulting score survive the same commit.
  function dispatch(token, concept, command, receipt = clock()) {
    const key = [privateGuestKey(token), concept, demoContentRelease];
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!guestLookup.get(key[0], receipt)) throw new HttpError(401, 'Open the concept again to start a guest session.');
      if (command) validateCommand(command);
      const signature = command && createHmac('sha256', token).update(JSON.stringify(
        [concept, command.action, command.roundId ?? null, command.answer ?? null]
      )).digest('hex');
      const duplicate = command && commandLookup.get(...key, command.commandId);
      if (duplicate) {
        if (duplicate.signature !== signature) throw new HttpError(409, 'Use a new command ID for a different request.');
        db.exec('COMMIT');
        return { status: duplicate.status, body: JSON.parse(duplicate.response) };
      }
      const row = playLookup.get(...key);
      const state = row ? JSON.parse(row.state) : initial(concept);
      if (state.phase === 'prompt' && receipt >= state.deadline) conclude(state, 'timeout');
      let status = 200;
      let body;
      try {
        const feedback = command && apply(state, command, receipt);
        body = snapshot(state, receipt, feedback);
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        status = error.status;
        body = { error: error.message, state: error.state };
      }
      savePlay.run(...key, JSON.stringify(state));
      if (command) saveCommand.run(...key, command.commandId, signature, status, JSON.stringify(body));
      db.exec('COMMIT');
      return { status, body };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return { session, dispatch, close: () => db.close() };
}

async function readCommand(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'Send application/json.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2048) throw new HttpError(413, 'Request too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Invalid JSON.'); }
}

async function serveAsset(pathname, req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Use GET.');
  const isArt = pathname.startsWith('/art/');
  const root = resolve(lab, isArt ? 'art' : 'public');
  const relative = pathname === '/' ? 'index.html' : pathname.slice(isArt ? 5 : 1);
  if (!relative || !relative.split('/').every(part => /^[\w-][\w.-]*$/.test(part) && part !== '..')) {
    throw new HttpError(404, 'Page not found.');
  }
  const type = mimeTypes.get(extname(relative));
  if (!type) throw new HttpError(404, 'Page not found.');
  const file = await realpath(resolve(root, relative)).catch(() => null);
  if (!file || !file.startsWith(root + sep)) throw new HttpError(404, 'Page not found.');
  const data = await readFile(file);
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length });
  res.end(req.method === 'HEAD' ? undefined : data);
}

export function demoServer(options) {
  const service = makeDemoService(options);
  const clock = options?.clock ?? Date.now;
  const server = createServer({ requestTimeout: 10_000, headersTimeout: 8_000 }, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const host = req.headers.host;
      if (!/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(host ?? '')) throw new HttpError(403, 'Use the localhost URL.');
      const pathname = new URL(req.url, 'http://' + host).pathname;
      const api = /^\/api\/demo\/([AB])$/.exec(pathname);
      if (!api) return await serveAsset(pathname, req, res);
      if (!['GET', 'POST'].includes(req.method)) throw new HttpError(405, 'Use GET or POST.');
      if (req.headers['sec-fetch-site'] === 'cross-site' ||
          (req.headers.origin !== undefined && req.headers.origin !== 'http://' + host)) {
        throw new HttpError(403, 'Open the concept on localhost.');
      }
      const command = req.method === 'POST' ? await readCommand(req) : null;
      if (req.method === 'POST' && !command) throw new HttpError(400, 'A command object is required.');
      const receipt = clock();
      const cookie = new RegExp('(?:^|;\\s*)' + cookieName + '=([a-zA-Z0-9_-]{43})(?:;|$)').exec(req.headers.cookie ?? '')?.[1];
      const token = service.session(cookie, receipt);
      if (token !== cookie) res.setHeader('Set-Cookie',
        cookieName + '=' + token + '; HttpOnly; SameSite=Strict; Path=/api/demo; Max-Age=86400');
      const { status, body } = service.dispatch(token, api[1], command, receipt);
      json(res, status, body);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      json(res, status, { error: status === 500 ? 'The local demo could not complete this request.' : error.message });
    }
  });
  server.once('close', service.close);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? 4317);
  const server = demoServer();
  server.listen(port, '127.0.0.1', () => console.log('Penicillion concept chooser: http://127.0.0.1:' + server.address().port + '/'));
  process.on('SIGTERM', () => server.close());
  process.on('SIGINT', () => server.close());
}
