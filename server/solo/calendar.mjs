const isoDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export function easternDate(ms = Date.now()) {
  return isoDate.format(new Date(ms));
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}
export function shiftDate(date, days) {
  return new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
}
export function resetAfter(date) {
  const tomorrow = shiftDate(date, 1),
    utc = Date.parse(tomorrow + 'T00:00:00Z');
  // New York midnight lands at UTC 04:00 or 05:00, including the transition Sundays.
  const early = utc + 4 * 3600000;
  return easternDate(early) === tomorrow ? early : early + 3600000;
}
export function problem(status, message) {
  return Object.assign(new Error(message), { status });
}
export async function transaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
