import { rarityFor } from './rarity.js';
import { div, el, tierMark } from './ui.js';
import { paintNight } from './art/night.js';
import { prefs } from './preferences.js';
import { cosmetic } from './collection.js';

let active = null,
  raf = 0;
export function stopScene() {
  cancelAnimationFrame(raf);
  active = null;
}
function frame(t) {
  if (!active) return;
  const { canvas, state, began } = active;
  if (canvas.isConnected && canvas.clientHeight > 0 && canvas.clientWidth > 0 && !document.hidden) {
    paintNight(canvas, {
      ...state,
      time: t,
      elapsed: prefs.reduced ? Infinity : t - began,
      reduced: prefs.reduced,
    });
  }
  raf = requestAnimationFrame(frame);
}
export function scene(state = {}, center = null) {
  stopScene();
  const marks = state.marks || [],
    phase = state.phase || 'landing',
    total = state.total || 0;
  const canvas = el('canvas', { role: 'img', 'aria-label': worldText(total, marks) });
  const progress = div('hud-progress', 'Run total ', el('span', {}, String(total)));
  const hud = div(
    'hud',
    el('span', { class: 'room-label' }, el('i'), state.place || 'Night Culture'),
    phase === 'landing' ? el('span', { class: 'room-label' }, 'Culture room') : progress,
  );
  const holder = div('stage', canvas, hud, center);
  holder.dataset.phase = phase;
  active = {
    canvas,
    state: { phase, total, slowGrowth: state.slowGrowth, points: state.points || 0, marks, cosmetic: cosmetic() },
    began: performance.now(),
  };
  if (state.settled) active.began = -Infinity;
  raf = requestAnimationFrame(frame);
  return holder;
}
export function pips(marks, current = 0) {
  const points = marks.map((p) => (typeof p === 'number' ? p : p.points));
  return el(
    'div',
    { class: 'pips', role: 'img', 'aria-label': points.length + ' of seven entries locked' },
    Array.from({ length: 7 }, (_, i) =>
      el(
        'span',
        {
          'data-rarity': i < points.length ? rarityFor(points[i]).id : undefined,
          class:
            'pip' +
            (i < points.length ? ' set' : '') +
            (i === current && i >= points.length ? ' open' : ''),
        },
        i < points.length ? tierMark(points[i]) : '',
      ),
    ),
  );
}
export function worldText(total, marks = []) {
  if (!total) return 'A small spore keeper watches the quiet dish under the bench lamp.';
  if (marks.includes(100)) return 'A coral-tipped crown rises from the dish. Run total ' + total + '.';
  if (marks.includes(85))
    return 'A golden canopy of branched spore stems rises over the dish. Run total ' + total + '.';
  if (marks.includes(60))
    return 'A lilac fan of branching filaments spreads across the agar. Run total ' + total + '.';
  return 'Small islands of new growth dot the glass dish. Run total ' + total + '.';
}
