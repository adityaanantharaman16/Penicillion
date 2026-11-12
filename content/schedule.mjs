import { readFileSync } from 'node:fs';

const dayLength = 86_400_000;
const epoch = Date.UTC(2026, 0, 1);
const releasePath = new URL('./release.json', import.meta.url);

// A weighted round-robin spreads differently sized families throughout the issue
// stream. Each prompt appears exactly once per full traversal of the dated wheel.
function makeWheel(prompts) {
  const groups = new Map();
  for (const prompt of prompts.filter(prompt => prompt.pool === 'daily')) {
    if (!groups.has(prompt.topic)) groups.set(prompt.topic, []);
    groups.get(prompt.topic).push(prompt.id);
  }
  const marks = [];
  let family = 0;
  for (const ids of groups.values()) {
    ids.sort();
    const offset = (family++ + 0.5) / groups.size;
    ids.forEach((id, i) => marks.push({ id, mark: (i + offset) / ids.length }));
  }
  return marks.sort((a,b) => a.mark - b.mark || (a.id < b.id ? -1 : 1)).map(item => item.id);
}

export function buildSchedule(startDate, days = 28, release = JSON.parse(readFileSync(releasePath, 'utf8'))) {
  if (!/^\d{4}-\d\d-\d\d$/.test(startDate) || !Number.isInteger(days) || days < 1 || days > 3660)
    throw new Error('Use a civil date YYYY-MM-DD and a positive horizon of up to ten years.');
  const start = Date.parse(startDate + 'T00:00:00Z');
  if (!Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== startDate)
    throw new Error('Invalid start date');
  const stage = release.prompts.filter(prompt => prompt.pool === 'daily');
  const openers = makeWheel(stage.filter(prompt => prompt.opener));
  const lane = makeWheel(stage.filter(prompt => !prompt.opener));
  // Test fixtures may omit the opener field. Published releases always set it.
  const mixed = stage.some(prompt => Object.hasOwn(prompt, 'opener'));
  if (mixed ? openers.length < 8 || lane.length < 48 : lane.length < 56)
    throw new Error('Inventory below the repeat-spacing threshold. Keep the published set and extend from the last valid release.');
  const take = (wheel, index) => wheel[((index % wheel.length) + wheel.length) % wheel.length];
  return Array.from({ length: days }, (_, i) => {
    const ms = start + i * dayLength;
    const index = Math.round((ms - epoch) / dayLength);
    const count = mixed ? 6 : 7;
    const prompts = Array.from({ length: count }, (_, j) => take(lane, index * count + j));
    if (mixed) prompts.unshift(take(openers, index));
    return { date: new Date(ms).toISOString().slice(0,10), number: index + 1, prompts };
  });
}
