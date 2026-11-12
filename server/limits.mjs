import { createClient } from 'redis';
import { redisUrl, redisPrefix } from './config.mjs';
import { fingerprint, problem } from './core.mjs';
const options = {
  url: redisUrl,
  disableOfflineQueue: true,
  socket: {
    reconnectStrategy: (retries) => Math.min(2500, 100 + retries * 100),
    connectTimeout: 2500,
  },
};
export const cache = createClient(options),
  subscriber = cache.duplicate();
for (const c of [cache, subscriber]) c.on('error', () => {});
const script = `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; if n>tonumber(ARGV[2]) then return redis.call('PTTL',KEYS[1]) end; return 0`;
export async function limit(group, key, count, windowMs) {
  if (!cache.isReady) throw problem(503, 'The bench is reconnecting. Please try again soon.');
  let wait;
  try {
    wait = await cache.eval(script, {
      keys: [redisPrefix + 'limit:' + group + ':' + fingerprint(key).slice(0, 32)],
      arguments: [String(windowMs), String(count)],
    });
  } catch {
    throw problem(503, 'Please try again shortly.');
  }
  if (wait > 0)
    throw Object.assign(problem(429, 'Please give the bench a moment before trying again.'), {
      retryAfter: Math.max(1, Math.ceil(wait / 1000)),
    });
}
export const channel = redisPrefix + 'rooms';
export async function publish(code) {
  if (cache.isReady) await cache.publish(channel, code);
}
export async function liveLease(actor, tag, remove = false) {
  const key = redisPrefix + 'socket:' + actor;
  if (remove) {
    if (cache.isReady) await cache.zRem(key, tag);
    return;
  }
  if (!cache.isReady) throw problem(503, 'Room connection is restarting.');
  const result = await cache.eval(
    `redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',ARGV[1]); if not redis.call('ZSCORE',KEYS[1],ARGV[2]) and redis.call('ZCARD',KEYS[1])>=4 then return 0 end; redis.call('ZADD',KEYS[1],ARGV[3],ARGV[2]);redis.call('PEXPIRE',KEYS[1],30000);return 1`,
    { keys: [key], arguments: [String(Date.now()), tag, String(Date.now() + 25000)] },
  );
  if (!result) throw problem(429, 'This account has four open relay connections.');
}
