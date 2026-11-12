import { WebSocketServer, WebSocket } from 'ws';
import { origin } from './config.mjs';
import { getSession } from './identity.mjs';
import { pool, rows, id, need, fields } from './core.mjs';
import { subscriber, channel, limit, liveLease } from './limits.mjs';

export async function attachRelay(http, rooms, metrics) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
  const watchers = new Map();
  function send(ws, obj) {
    if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 65536) ws.send(JSON.stringify(obj));
    else if (ws.bufferedAmount >= 65536) ws.close(1013, 'Reconnect for a fresh snapshot.');
  }
  async function refresh(ws) {
    if (ws.loading) {
      ws.again = true;
      return;
    }
    ws.loading = true;
    try {
      do {
        ws.again = false;
        const s = await getSession(ws.headers);
        if (!s || s.id !== ws.actor) {
          ws.close(1008, 'Session changed.');
          break;
        }
        const v = await rooms.snapshot(ws.code, ws.actor);
        const signature = JSON.stringify([
          v.room.version,
          v.room.urgency,
          v.room.seats.map((x) => x.connected),
        ]);
        if (signature !== ws.sent) {
          send(ws, v);
          ws.sent = signature;
        }
      } while (ws.again && ws.readyState === WebSocket.OPEN);
    } catch {
      ws.close(1008, 'Room is unavailable.');
    } finally {
      ws.loading = false;
    }
  }
  await subscriber.subscribe(channel, (code) => {
    for (const ws of watchers.get(code) || []) refresh(ws);
  });
  http.on('upgrade', async (req, socket, head) => {
    let lease;
    try {
      need(
        req.headers.origin === origin && req.headers.host === new URL(origin).host,
        403,
        'Origin denied.',
      );
      const code = /^\/api\/rooms\/([A-HJ-NP-Z2-9]{7})\/live$/.exec(req.url)?.[1];
      need(code, 404, 'Unknown socket.');
      const s = await getSession(req.headers);
      need(s, 401, 'Open the game first.');
      await limit('ws-handshake', s.id, 30, 60000);
      await rooms.snapshot(code, s.id);
      const tag = id();
      await liveLease(s.id, tag);
      lease = [s.id, tag];
      wss.handleUpgrade(req, socket, head, (ws) => {
        metrics.sockets++;
        ws.actor = s.id;
        ws.code = code;
        ws.tag = tag;
        ws.headers = { cookie: req.headers.cookie };
        ws.alive = true;
        ws.queue = 0;
        if (!watchers.has(code)) watchers.set(code, new Set());
        watchers.get(code).add(ws);
        ws.on('error', () => {});
        ws.on('pong', () => (ws.alive = true));
        ws.on('message', async (data, binary) => {
          const received = Date.now();
          ws.queue++;
          try {
            need(!binary && ws.queue <= 5, 400, 'Use one text command at a time.');
            await limit('ws-msg', s.id, 10, 1000);
            const active = await getSession(ws.headers);
            need(active?.id === s.id, 401, 'Session ended.');
            const cmd = JSON.parse(data.toString());
            fields(
              cmd,
              cmd.action === 'answer'
                ? ['action', 'answer', 'commandId', 'epoch']
                : ['action', 'commandId', 'epoch'],
            );
            if (cmd.action === 'answer') await limit('relay-answer', s.id, 12, 25000);
            await limit('room-all', code, 80, 1000);
            send(ws, await rooms.command(code, s.id, cmd, received));
          } catch (e) {
            send(ws, {
              error: e.status ? e.message : 'Invalid socket command.',
              retryAfter: e.retryAfter || undefined,
            });
            if (e.status === 401 || e instanceof SyntaxError)
              ws.close(1008, 'Invalid session or message.');
          } finally {
            ws.queue--;
          }
        });
        ws.on('close', () => {
          metrics.sockets--;
          const set = watchers.get(code);
          set?.delete(ws);
          if (!set?.size) watchers.delete(code);
          liveLease(s.id, tag, true).catch(() => {});
        });
        refresh(ws);
      });
    } catch (error) {
      if (lease) liveLease(...lease, true).catch(() => {});
      socket.end('HTTP/1.1 ' + (error.status || 503) + ' Rejected\r\nConnection: close\r\n\r\n');
    }
  });
  // Pub/sub only wakes readers. Periodic version checks recover dropped notifications.
  let checking = false,
    tick = 0;
  const timer = setInterval(async () => {
    if (checking || !watchers.size) return;
    checking = true;
    tick++;
    try {
      const now = Date.now(),
        codes = [...watchers.keys()],
        active = [...wss.clients].filter((s) => s.readyState === WebSocket.OPEN);
      if (tick % 4 === 1) {
        // Per-connection validation also runs during refresh and before every command.
        await Promise.all(
          active.map(async (w) => {
            const fresh = await getSession(w.headers);
            if (!fresh || fresh.id !== w.actor) {
              w.close(1008, 'Session ended.');
              return;
            }
            w.digest = fresh.digest;
            if (!w.alive) {
              w.terminate();
              return;
            }
            w.alive = false;
            w.ping();
            await liveLease(w.actor, w.tag);
            await rooms.heartbeat(w.code, w.actor);
          }),
        );
      }
      const state = await rows(
        pool,
        'SELECT code,version,fuse,status FROM rooms WHERE code=ANY($1::text[])',
        [codes],
      );
      for (const r of state) {
        const urgency =
          r.status !== 'playing' || r.fuse - now > 12000
            ? 'steady'
            : r.fuse - now > 5000
              ? 'warming'
              : 'urgent';
        for (const w of watchers.get(r.code) || [])
          if (w.lastState !== r.version + urgency || tick % 6 === 0) {
            w.lastState = r.version + urgency;
            refresh(w);
          }
      }
    } catch {
      metrics.socketErrors++;
    } finally {
      checking = false;
    }
  }, 2000);
  timer.unref();
  return () => {
    clearInterval(timer);
    for (const ws of wss.clients) ws.close(1012, 'Reconnecting to another bench.');
    wss.close();
  };
}
