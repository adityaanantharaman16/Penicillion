import { currentSession } from './api.js';
import { el, p, field } from './ui.js';
const earnedByActor = new Map();
const key = () => currentSession()?.actor?.id || '';
const valid = new Set([3, 7, 14]);
export function rememberUnlocks(unlocks) {
  const earned = unlocks.map((item) => Number(item.days)).filter((value) => valid.has(value));
  earnedByActor.set(key(), earned);
  try {
    localStorage.setItem('culture-unlocks:' + key(), JSON.stringify(earned));
  } catch {}
}
export function cosmetic() {
  const actor = key();
  if (!actor) return 0;
  let earned = earnedByActor.get(actor),
    selected;
  try {
    earned ??= JSON.parse(localStorage.getItem('culture-unlocks:' + actor) || '[]');
    selected = localStorage.getItem('culture-worn:' + actor);
  } catch {}
  if (!Array.isArray(earned)) return 0;
  if (selected === '0') return 0;
  const choice =
    selected === null || selected === undefined ? Math.max(0, ...earned) : Number(selected);
  return valid.has(choice) && earned.includes(choice) ? choice : 0;
}
export function collection(unlocks) {
  if (!unlocks.length)
    return p('Finish 3, 7 and 14 consecutive dailies to collect permanent bench cosmetics.');
  const select = el(
    'select',
    {},
    el('option', { value: 0 }, 'Original dish'),
    unlocks.map((c) => el('option', { value: c.days }, c.name)),
  );
  select.value = String(cosmetic());
  select.addEventListener('change', () => {
    try {
      localStorage.setItem('culture-worn:' + key(), select.value);
    } catch {}
  });
  return field('Display on your bench', select);
}
