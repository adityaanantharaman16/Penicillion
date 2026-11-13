import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { origin, production, nonce } from './config.mjs';
import { replicaId } from './database.mjs';
import { pool, need, problem } from './core.mjs';
import {
  getSession,
  guest,
  sessionView,
  accountAction,
  validateCsrf,
  callback,
} from './identity.mjs';
import { makeSolo } from './solo/index.mjs';
import { social } from './social.mjs';
import { makeRooms } from './rooms.mjs';
import { cache, subscriber, limit, publish } from './limits.mjs';
import { attachRelay } from './realtime.mjs';

const root = fileURLToPath(new URL('../web/', import.meta.url)),
  port = Number(process.env.PORT || 4321);
const fixedHost = new URL(origin).host;
const solo = makeSolo(pool),
  rooms = makeRooms(solo, publish);
const metrics = { requests: 0, writes: 0, errors: 0, limited: 0, socketErrors: 0, sockets: 0 };
const latencyBounds = [25, 50, 100, 200, 300, 500, 1000, 3000, 10000];
const submitLatency = Array(latencyBounds.length + 1).fill(0);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};
const assetCache = new Map();
function output(res, status, obj) {
  res
    .writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    .end(JSON.stringify(obj));
}
function safeJSON(key, value) {
  if (['constructor', '__proto__', 'prototype'].includes(key))
    throw problem(400, 'Invalid request key.');
  return value;
}
async function readBody(req) {
  need(
    req.headers['content-type']?.split(';')[0] === 'application/json',
    415,
    'Send a JSON object.',
  );
  need(!req.headers['content-encoding'], 415, 'Uncompressed requests only.');
  let size = 0;
  const data = [];
  for await (const b of req) {
    size += b.length;
    need(size <= 3072, 413, 'Request too large.');
    data.push(b);
  }
  try {
    const value = JSON.parse(Buffer.concat(data).toString(), safeJSON);
    need(value && !Array.isArray(value) && typeof value === 'object', 400, 'Send a JSON object.');
    return value;
  } catch (e) {
    throw e.status ? e : problem(400, 'Invalid JSON.');
  }
}
async function asset(req, res, path) {
  need(['HEAD', 'GET'].includes(req.method), 405, 'Use GET.');
  const name = path === '/' ? 'index.html' : path.slice(1);
  need(
    name.length < 180 && name.split('/').every((s) => /^[a-zA-Z0-9][\w.-]*$/.test(s)),
    404,
    'Page unavailable.',
  );
  const type = types[extname(name)];
  need(type, 404, 'Page unavailable.');
  let item = production && assetCache.get(name);
  if (!item) {
    const file = await realpath(resolve(root, name)).catch(() => null);
    need(
      file && file.startsWith(resolve(root) + sep) && (await stat(file)).isFile(),
      404,
      'Page unavailable.',
    );
    item = await readFile(file);
    if (production) assetCache.set(name, item);
  }
  if (name === 'index.html') {
    const token = nonce();
    res.setHeader(
      'Content-Security-Policy',
      res
        .getHeader('Content-Security-Policy')
        .replace("script-src 'self'", "script-src 'nonce-" + token + "' 'strict-dynamic'"),
    );
    item = Buffer.from(item.toString().replace('__REQUEST_NONCE__', token));
  }
  res
    .writeHead(200, {
      'Content-Type': type,
      'Content-Length': item.length,
      'Cache-Control':
        production && /\.(woff2|ttf)$/.test(name) ? 'public,max-age=86400' : 'no-cache',
    })
    .end(req.method === 'HEAD' ? undefined : item);
}
function edgeIp(req) {
  // Only the trusted local gateway sets this header. Production private ingress overwrites it.
  const proxy = production ? process.env.TRUST_PROXY_ADDRESS : '127.0.0.1';
  return req.socket.remoteAddress === proxy && typeof req.headers['x-real-ip'] === 'string'
    ? req.headers['x-real-ip'].slice(0, 80)
    : req.socket.remoteAddress || 'local';
}
let draining = false;
const app = createServer(
  { requestTimeout: 10000, headersTimeout: 8000, maxHeaderSize: 8192 },
  async (req, res) => {
    const begin = performance.now();
    metrics.requests++;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'",
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      const u = new URL(req.url, origin),
        path = u.pathname,
        method = req.method;
      if (path === '/health/live') return output(res, 200, { alive: true });
      if (path === '/health/ready') {
        let ready = !draining && cache.isReady;
        if (ready) {
          try {
            await pool.query('SELECT 1');
          } catch {
            ready = false;
          }
        }
        return output(res, ready ? 200 : 503, { ready, revision: process.env.RELEASE_REVISION || undefined });
      }
      need(req.headers.host === fixedHost, 403, 'Use the game address.');
      need(req.url.length < 1024, 414, 'Address too long.');
      if (!path.startsWith('/api/') && path !== '/auth/callback')
        return await asset(req, res, path);
      need(method === 'GET' || method === 'POST', 405, 'Unsupported method.');
      const originHeader = req.headers.origin;
      if (path !== '/auth/callback')
        need(
          req.headers['sec-fetch-site'] !== 'cross-site' &&
            (!originHeader || originHeader === origin),
          403,
          'Open the game to continue.',
        );
      if (method === 'POST') need(originHeader === origin, 403, 'Same-origin request required.');
      const body = method === 'POST' ? await readBody(req) : null;
      const now = Date.now();
      let s = await getSession(req.headers);
      if (!s && path === '/api/session' && method === 'GET') {
        await limit('new-network', edgeIp(req), 400, 60000);
        s = await guest(res);
      }
      need(s, 401, 'Open the game to start a guest session.');
      if (path === '/auth/callback') {
        need(method === 'GET', 405, 'Use GET.');
        await callback(req.url, s, res);
        res.writeHead(303, { Location: '/#account' }).end();
        return;
      }
      if (method === 'POST') {
        validateCsrf(s, req.headers['x-csrf-token']);
        await limit('writes', s.id, 90, 60000);
        metrics.writes++;
      }
      let value;
      if (
        method === 'GET' &&
        /^\/api\/(?:archive|boards|groups|distribution|history|runs|rooms)(?:\/|$)/.test(path)
      )
        await limit('private-reads', s.id, 180, 60000);
      if (path === '/api/session' && method === 'GET') value = await sessionView(s, solo);
      else if (
        /^\/api\/(login|logout|claim|profile|account\/delete)$/.test(path) &&
        method === 'POST'
      ) {
        if (path === '/api/login') {
          await limit('signin', s.id, 5, 60000);
          await limit('signin-network', edgeIp(req), 90, 60000);
        }
        value = await accountAction(path, s, body, res, solo, rooms.exit);
      } else if (path === '/api/boards' || path.startsWith('/api/groups')) {
        if (method === 'POST') await limit('social', s.id, 30, 60000);
        value = await social(path, method, u, body, s, solo);
      } else if (path.startsWith('/api/rooms')) {
        if (path === '/api/rooms/current' && method === 'GET') value = await rooms.current(s.id);
        else if (
          ['/api/rooms', '/api/rooms/join', '/api/rooms/match'].includes(path) &&
          method === 'POST'
        ) {
          const mode = path === '/api/rooms' ? 'create' : path.split('/').at(-1);
          if (mode === 'join') {
            await limit('joins', s.id, 10, 60000);
            await limit('joins-network', edgeIp(req), 300, 60000);
          } else await limit('room-creates', s.id, 5, 600000);
          value = await rooms.createOrJoin(s.id, mode, body);
        } else {
          const m = /^\/api\/rooms\/([A-HJ-NP-Z2-9]{7})(\/command)?$/.exec(path);
          need(m, 404, 'Unknown room.');
          if (m[2]) {
            need(method === 'POST', 405, 'Use POST.');
            await limit('ws-msg', s.id, 10, 1000);
            await limit('room-all', m[1], 80, 1000);
            if (body.action === 'answer') await limit('relay-answer', s.id, 12, 25000);
            value = await rooms.command(m[1], s.id, body, now);
          } else {
            need(method === 'GET', 405, 'Use GET.');
            try {
              value = await rooms.snapshot(m[1], s.id);
            } catch (e) {
              if (e.status === 403 || e.status === 404) {
                await limit('bad-room-reads', s.id, 10, 60000);
                await limit('bad-room-network', edgeIp(req), 300, 60000);
              }
              throw e;
            }
            await rooms.heartbeat(m[1], s.id);
          }
        }
      } else {
        if (path.endsWith('/answer')) await limit('solo-answer', s.id, 12, 25000);
        value = await solo.handle({ method, path: path + u.search, actorId: s.id, body, now });
      }
      const duration = performance.now() - begin;
      if (
        method === 'POST' &&
        (path.endsWith('/answer') || (path.endsWith('/command') && body.action === 'answer'))
      ) {
        const bucket = latencyBounds.findIndex((x) => duration <= x);
        submitLatency[bucket < 0 ? latencyBounds.length : bucket]++;
      }
      res.setHeader('Server-Timing', 'app;dur=' + Math.round(duration * 10) / 10);
      res.setHeader('X-Game-Replica', replicaId);
      output(res, 200, value);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) {
        metrics.errors++;
        console.error('Request failed', e.code || e.name || 'Error');
      }
      if (status === 429) metrics.limited++;
      if (e.retryAfter) res.setHeader('Retry-After', String(e.retryAfter));
      if (status === 503) res.setHeader('Retry-After', '3');
      if (req.url.startsWith('/auth/callback') && req.headers.accept?.includes('text/html')) {
        res
          .writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
          .end(
            '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><title>Sign-in interrupted</title><main><section class="paper"><h1>Sign-in interrupted</h1><p>Return to your bench and start a fresh sign-in.</p><a class="btn" href="/#account">Open Account</a></section></main></html>',
          );
        return;
      }
      output(res, status, {
        error: status === 500 ? 'The bench could not complete the request.' : e.message,
        ...(e.state ? { state: e.state } : {}),
      });
    }
  },
);
await Promise.all([cache.connect(), subscriber.connect()]);
const stopSockets = await attachRelay(app, rooms, metrics);
const tick = setInterval(() => rooms.sweep().catch(() => metrics.errors++), 500);
tick.unref();
const clean = setInterval(async () => {
  try {
    await pool.query('DELETE FROM sessions WHERE expires<$1', [Date.now()]);
    await pool.query('DELETE FROM login_attempts WHERE expires<$1', [Date.now()]);
    await pool.query('DELETE FROM invitations WHERE expires<$1', [Date.now()]);
  } catch {
    metrics.errors++;
  }
}, 300000);
clean.unref();
const logs = setInterval(
  () =>
    console.log(
      JSON.stringify({
        service: 'night-culture',
        replica: replicaId,
        rss: process.memoryUsage().rss,
        pool: pool.totalCount,
        waiting: pool.waitingCount,
        submitLatencyBoundsMs: latencyBounds,
        submitLatency: submitLatency.splice(
          0,
          submitLatency.length,
          ...Array(latencyBounds.length + 1).fill(0),
        ),
        ...metrics,
      }),
    ),
  60000,
);
logs.unref();
app.listen(port, process.env.BIND_ADDRESS || '127.0.0.1', () =>
  console.log('Night Culture worker listening on ' + port),
);
async function stop() {
  if (draining) return;
  draining = true;
  clearInterval(tick);
  clearInterval(clean);
  clearInterval(logs);
  stopSockets();
  app.close(async () => {
    await Promise.allSettled([pool.end(), cache.close(), subscriber.close()]);
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
