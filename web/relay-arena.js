import { el } from './ui.js';
import { prefs } from './preferences.js';
import { arenaBackdrop, arenaLayout } from './art/relay-room.js';
import { paintRelay } from './art/relay-keepers.js';

const demo = {
  status: 'preview',
  version: 0,
  winnerId: null,
  urgency: 'steady',
  seats: [
    { id: 'illustration-left', slot: 0, lives: 3 },
    { id: 'illustration-right', slot: 1, lives: 3 },
  ],
};

function plate(seat, room) {
  const self = room.selfId === seat.id,
    active = room.status === 'playing' && room.activeId === seat.id;
  const winner = room.winnerId === seat.id,
    out = seat.lives === 0;
  const tag = winner
    ? 'Winner'
    : out
      ? 'Out'
      : !seat.connected
        ? 'Reconnecting'
        : room.status === 'lobby'
          ? seat.ready
            ? 'Ready'
            : 'Waiting'
          : '';
  const max = room.chargeTarget || 100,
    charge = Number(seat.charge) || 0;
  const hearts = el(
    'span',
    { class: 'ra-hearts', 'aria-hidden': 'true' },
    [0, 1, 2].map((i) => el('i', { class: i < seat.lives ? 'full' : '' })),
  );
  const fill = el('i');
  fill.style.width = Math.min(100, (charge / max) * 100) + '%';
  const gauge = el('span', { class: 'ra-gauge', 'aria-hidden': 'true' }, fill);
  const sr = el(
    'span',
    { class: 'sr' },
    (active ? 'Holding the slide. ' : '') +
      seat.lives +
      ' of 3 lives. Charge ' +
      charge +
      ' of ' +
      max +
      '.',
  );
  return el(
    'li',
    {
      class: 'ra-seat',
      'data-slot': String(seat.slot ?? ''),
      'data-you': self ? 'yes' : null,
      'data-active': active ? 'yes' : null,
      'data-out': out ? 'yes' : null,
      'data-winner': winner ? 'yes' : null,
    },
    el('span', { class: 'ra-name', title: seat.name }, seat.name),
    el(
      'span',
      { class: 'ra-stats', title: seat.lives + ' lives · ' + charge + '/' + max + ' charge' },
      hearts,
      self && el('span', { class: 'ra-self' }, 'you'),
      el('span', { class: 'ra-charge', 'aria-hidden': 'true' }, String(charge)),
    ),
    gauge,
    tag && el('span', { class: 'ra-state' }, tag),
    sr,
  );
}

function motionFrom(before, after, arrivedAt, animate) {
  // Only the next directly observed committed action can move or pop a slide.
  // A resumed tab, stale receipt or gap in the event stream simply paints the resulting board.
  if (
    !animate ||
    !before ||
    document.hidden ||
    after.code !== before.code ||
    after.version !== before.version + 1 ||
    after.epoch !== before.epoch + 1
  )
    return null;
  const event = after.events?.at(-1);
  if (!event || event.seq !== after.version || !['pass', 'pop'].includes(event.kind)) return null;
  const slots = new Set(after.seats.map((s) => s.slot).filter(Number.isInteger));
  if (!slots.has(event.fromSlot) || (event.toSlot !== null && !slots.has(event.toSlot))) return null;
  return { ...event, started: arrivedAt };
}

// This envelope describes the living drawing, independently of the room's hidden clock.
const cultureBands = {
  steady: { settled: 0.22, ceiling: 0.68, drift: 5800 },
  warming: { settled: 0.57, ceiling: 0.88, drift: 4200 },
  urgent: { settled: 0.84, ceiling: 1, drift: 2700 },
};
function cultureAt(culture, now) {
  const elapsed = Math.max(0, now - culture.start);
  return culture.from + (culture.to - culture.from) * (1 - Math.exp(-elapsed / culture.drift));
}
function resetCulture(cue, now, fresh) {
  const band = cultureBands[cue] || cultureBands.steady;
  return { from: fresh ? 0.025 : band.settled, to: band.ceiling, start: now, drift: band.drift };
}
function growCulture(culture, cue, now) {
  const band = cultureBands[cue] || cultureBands.steady;
  if (band.ceiling <= culture.to) return culture;
  return { from: cultureAt(culture, now), to: band.ceiling, start: now, drift: band.drift };
}
function animateCharge(node, previousSeat, nextSeat, limit, bonus) {
  const fill = node?.querySelector('.ra-gauge i');
  if (!fill || !previousSeat || !nextSeat) return;
  const at = (value) => ({ width: Math.min(100, (value / limit) * 100) + '%' });
  const frames = bonus
    ? [
        at(previousSeat.charge),
        { ...at(limit), offset: 0.48 },
        { ...at(limit), offset: 0.73 },
        at(nextSeat.charge),
      ]
    : [at(previousSeat.charge), at(nextSeat.charge)];
  fill.animate(frames, { duration: bonus ? 880 : 420, easing: 'ease-out' });
}

export function createRelayArena({ preview = false } = {}) {
  const canvas = el('canvas', { 'aria-hidden': 'true' }),
    plates = el('ol', { class: 'ra-labels', 'aria-label': 'Relay seats in turn order' });
  const element = el(
    'div',
    { class: 'relay-arena', 'data-preview': preview ? 'yes' : null },
    canvas,
    preview
      ? el('span', { class: 'sr' }, 'Two spore keepers demonstrate a slide crossing the relay bench.')
      : plates,
  );
  let room = preview ? demo : null,
    layout = null,
    background = null,
    dirty = true,
    effect = null,
    raf = 0,
    lastFrame = -Infinity;
  let culture = resetCulture('steady', performance.now(), true);
  let lastPose = '',
    labelKey = '',
    formation = '',
    nodes = [],
    width = 0,
    height = 0,
    hidden = document.hidden,
    destroyed = false;
  function locate() {
    if (!room || !width || !height) return;
    const next = arenaLayout(width, height, room.seats, preview);
    element.toggleAttribute('data-dense', next.dense);
    if (
      !background ||
      layout?.w !== next.w ||
      layout?.h !== next.h ||
      layout.compact !== next.compact
    )
      background = arenaBackdrop(next);
    layout = next;
    for (let i = 0; i < nodes.length; i++) {
      const a = layout.slots[i],
        node = nodes[i];
      if (!a) continue;
      node.style.left = (a.x / layout.w) * 100 + '%';
      const belowKeeper = ((a.y + Math.max(3, a.scale * 7) + 1) / layout.h) * height;
      node.style.top = Math.min(belowKeeper, height - node.offsetHeight - 3) + 'px';
    }
    dirty = true;
  }
  function size() {
    const w = element.clientWidth,
      h = element.clientHeight;
    if (w && h && (w !== width || h !== height)) {
      width = w;
      height = h;
      locate();
    }
  }
  const observer = new ResizeObserver(size);
  observer.observe(element);
  function update(next, { animate = true } = {}) {
    if (
      destroyed ||
      preview ||
      !next ||
      (room && next.code === room.code && next.version < room.version)
    )
      return;
    const before = room,
      now = performance.now();
    let liveEvent = null;
    if (
      !before ||
      before.code !== next.code ||
      before.epoch !== next.epoch ||
      before.version !== next.version
    ) {
      effect = motionFrom(before, next, now, animate);
      liveEvent = effect;
    }
    if (!animate) effect = null;
    const sameRoom = before?.code === next.code;
    const changedCategory = sameRoom && next.prompt?.text !== before.prompt?.text;
    const missedAction = sameRoom && next.epoch !== before.epoch && !liveEvent;
    if (
      !sameRoom ||
      before?.status !== next.status ||
      changedCategory ||
      liveEvent?.kind === 'pop' ||
      missedAction ||
      (!animate && sameRoom && before.version !== next.version)
    ) {
      culture = resetCulture(
        next.urgency,
        now,
        !!liveEvent || (animate && sameRoom && before?.status === 'lobby'),
      );
    } else {
      culture = growCulture(culture, next.urgency, now);
    }
    room = next;
    const count = next.seats.length;
    element.dataset.count = count;
    element.dataset.status = next.status;
    element.dataset.level = next.urgency || 'steady';
    const key = JSON.stringify([
      next.activeId,
      next.winnerId,
      next.selfId,
      next.status,
      next.chargeTarget,
      next.seats.map((s) => [s.id, s.slot, s.name, s.lives, s.charge, s.ready, s.connected]),
    ]);
    if (key !== labelKey) {
      labelKey = key;
      nodes = next.seats.map((s) => plate(s, next));
      plates.replaceChildren(...nodes);
      if (liveEvent?.kind === 'pass' && !prefs.reduced) {
        const seatIndex = next.seats.findIndex((s) => s.slot === liveEvent.fromSlot);
        const previousSeat = before.seats.find((s) => s.slot === liveEvent.fromSlot);
        animateCharge(
          nodes[seatIndex],
          previousSeat,
          next.seats[seatIndex],
          next.chargeTarget || 100,
          liveEvent.bonusLife,
        );
      }
      formation = '';
      dirty = true;
    }
    const ids = next.seats.map((s) => s.id + ':' + s.slot).join('|');
    size();
    if (formation !== ids) {
      formation = ids;
      locate();
    }
    dirty = true;
  }

  function draw(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(draw);
    if (document.hidden || !element.isConnected || !room) return;
    size();
    if (!layout || !background) return;
    const reduced = prefs.reduced;
    if (reduced) effect = null;
    const age = effect ? now - effect.started : Infinity;
    if (effect && age > 980) {
      effect = null;
      dirty = true;
    }
    const pose = reduced
      ? 'static'
      : effect || preview || room.status === 'playing'
        ? Math.floor(now / 55)
        : Math.floor(now / 150);
    if ((!dirty && pose === lastPose) || (now - lastFrame < 28 && !dirty)) return;
    if (!room.seats.length) {
      canvas.width = layout.w;
      canvas.height = layout.h;
      canvas.getContext('2d').drawImage(background, 0, 0);
    } else
      paintRelay(
        canvas,
        room,
        layout,
        background,
        now,
        effect ? { ...effect, age } : null,
        reduced,
        preview,
        reduced
          ? cultureBands[room.urgency]?.settled || 0.3
          : preview
            ? 0.03 + (0.93 * ((now - culture.start) % 13000)) / 13000
            : cultureAt(culture, now),
      );
    if (element.dataset.motion !== (effect?.kind || '')) element.dataset.motion = effect?.kind || '';
    lastPose = pose;
    lastFrame = now;
    dirty = false;
  }
  function visible() {
    if (document.hidden || hidden) {
      effect = null;
      dirty = true;
    }
    hidden = document.hidden;
  }
  document.addEventListener('visibilitychange', visible);
  if (preview) {
    element.dataset.count = '2';
    element.dataset.status = 'preview';
  }
  raf = requestAnimationFrame(draw);
  function destroy() {
    destroyed = true;
    cancelAnimationFrame(raf);
    observer.disconnect();
    document.removeEventListener('visibilitychange', visible);
    effect = null;
    background = null;
    layout = null;
  }
  return { element, update, destroy };
}
