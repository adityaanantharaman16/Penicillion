import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { keyMaterial } from './config.mjs';
export { pool, transaction } from './database.mjs';
export const id = () => randomUUID();
export const hash = (s) => createHash('sha256').update(s).digest('hex');
export const fingerprint = (s) => createHmac('sha256', keyMaterial).update(s).digest('base64url');
export function equal(a, b) {
  return (
    typeof a === 'string' &&
    typeof b === 'string' &&
    timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)))
  );
}
export function problem(status, message) {
  return Object.assign(new Error(message), { status });
}
export function need(condition, status, message) {
  if (!condition) throw problem(status, message);
}
export function fields(data, keys) {
  need(
    data &&
      typeof data === 'object' &&
      !Array.isArray(data) &&
      Object.getPrototypeOf(data) === Object.prototype,
    400,
    'Send a JSON object.',
  );
  need(
    Object.keys(data).every((k) => keys.includes(k)),
    400,
    'Unexpected field.',
  );
}
export const keyOK = (s) => typeof s === 'string' && /^[\w-]{8,80}$/.test(s);
export const idOK = (s) =>
  typeof s === 'string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(s);
export async function one(query, sql, args = []) {
  return (await query.query(sql, args)).rows[0];
}
export async function rows(query, sql, args = []) {
  return (await query.query(sql, args)).rows;
}
export function localDate(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
