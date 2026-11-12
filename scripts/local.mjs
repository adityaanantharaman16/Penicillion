import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { origin, production } from '../server/config.mjs';

if (production) throw Error('Use the production worker entry point.');
const publicUrl = new URL(origin);
const base = Number(publicUrl.port);
const gatewayOnly = process.argv.includes('--gateway-only');
if (!Number.isInteger(base) || base < 1 || base > (gatewayOnly ? 65535 : 65531))
  throw Error('Use a local PUBLIC_ORIGIN with an explicit port.');
const ports = gatewayOnly
  ? [Number(process.env.WORKER_ONE_PORT), Number(process.env.WORKER_TWO_PORT)]
  : [base + 1, base + 2];
const port = gatewayOnly ? Number(process.env.GATEWAY_PORT || base) : base;
if (
  ![port, ...ports].every((p) => Number.isInteger(p) && p > 0 && p <= 65535) ||
  new Set([port, ...ports]).size !== 3
)
  throw Error('Use three distinct gateway and worker ports.');
const children = [];
let next = 0,
  stopping = false;
const selectPort = () => ports[next++ % ports.length];
function launch(file, env) {
  const child = spawn(process.execPath, [file], {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(file + ' stopped (' + (signal || code) + ').');
      stop(1);
    }
  });
}
function headersFor(req) {
  const headers = { ...req.headers };
  delete headers.forwarded;
  delete headers['x-forwarded-for'];
  delete headers['x-forwarded-host'];
  delete headers['x-forwarded-proto'];
  headers['x-real-ip'] = req.socket.remoteAddress;
  return headers;
}
const proxy = http.createServer(
  { requestTimeout: 12000, headersTimeout: 9000, maxHeaderSize: 8192 },
  (req, res) => {
    const upstream = http.request(
      {
        hostname: '127.0.0.1',
        port: selectPort(),
        path: req.url,
        method: req.method,
        headers: headersFor(req),
      },
      (reply) => {
        res.writeHead(reply.statusCode, reply.headers);
        reply.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(503, { 'Retry-After': '1' });
      res.end();
    });
    req.on('aborted', () => upstream.destroy());
    req.pipe(upstream);
  },
);
proxy.on('upgrade', (req, client, head) => {
  const target = net.connect(selectPort(), '127.0.0.1');
  target.on('error', () => client.destroy());
  client.on('error', () => target.destroy());
  client.on('close', () => target.destroy());
  target.on('close', () => client.destroy());
  target.on('connect', () => {
    const headers = headersFor(req);
    const lines = Object.entries(headers).map(([k, v]) => k + ': ' + v);
    target.write([req.method + ' ' + req.url + ' HTTP/1.1', ...lines, '', ''].join('\r\n'));
    if (head.length) target.write(head);
    client.pipe(target).pipe(client);
  });
});
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  proxy.close();
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 9000).unref();
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
proxy.on('error', (e) => {
  console.error('Local gateway could not start:', e.code);
  stop(1);
});
function listen() {
  const bindAddress = gatewayOnly ? '0.0.0.0' : '127.0.0.1';
  proxy.listen(port, bindAddress, () => console.log('Play Night Culture at ' + origin + '/'));
}
if (gatewayOnly) {
  // Compose starts the two workers and the IdP after this network namespace exists.
  listen();
} else {
  const localIssuer = process.env.LOCAL_OIDC_ORIGIN || 'http://127.0.0.1:' + (base + 3);
  if (process.env.EXTERNAL_LOCAL_IDP !== '1')
    launch('local-idp/server.mjs', { LOCAL_OIDC_ORIGIN: localIssuer });
  for (const [i, workerPort] of ports.entries())
    launch('server/app.mjs', {
      PORT: String(workerPort),
      REPLICA_ID: 'night-' + base + '-' + (i + 1),
      LOCAL_OIDC_ORIGIN: localIssuer,
      DATABASE_URL:
        process.env.DATABASE_URL ||
        'postgresql://night_play:local-play-only@127.0.0.1:55442/penicillion',
    });
  for (let attempt = 0; attempt < 100 && !stopping; attempt++) {
    const checks = await Promise.all(
      ports.map((p) =>
        fetch('http://127.0.0.1:' + p + '/health/ready').then(
          (r) => r.ok,
          () => false,
        ),
      ),
    );
    if (checks.every(Boolean)) {
      listen();
      break;
    }
    await sleep(200);
    if (attempt === 99) {
      console.error('The two game workers did not become ready.');
      stop(1);
    }
  }
}
