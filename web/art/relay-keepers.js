import { Pixels, clamp } from './pixels.js';
import { keeper } from './culture.js';
import { tierColor } from './growth.js';

const scarves = [
  ['#ee957d', '#d87970'],
  ['#88bfcc', '#648eab'],
  ['#c6a6de', '#9277ae'],
  ['#ebc77f', '#ac885d'],
  ['#a2c986', '#719769'],
  ['#e1a6b9', '#ad758d'],
  ['#94aad8', '#697a9e'],
  ['#d7c4a5', '#9c8d7e'],
];
const sprites = new Map();
function sprite(slot, frame, gesture) {
  const key = [slot, frame, gesture].join('/');
  if (sprites.has(key)) return sprites.get(key);
  const c = document.createElement('canvas');
  c.width = 68;
  c.height = 64;
  const ctx = c.getContext('2d'),
    p = new Pixels(ctx);
  keeper(p, 35, 59, frame, gesture);
  const cloth = scarves[slot % 8] || scarves[0];
  // Only the scarf changes per seat. All faces and the silhouette remain the Penicillion keeper.
  const bob = frame === 1 || frame === 2 ? -1 : 0;
  p.local(35, 59 + bob, () => {
    p.polygon([-9, -24, 7, -24, 7, -21, 3, -20, -2, -21, -7, -19], cloth[0]);
    p.polygon([6, -21, 12, -21, 15, -18, 19, -18, 16, -15, 11, -16, 7, -19], cloth[1]);
  });
  sprites.set(key, c);
  return c;
}

function pad(p, anchor, active, out, winner) {
  const { x, y, scale } = anchor,
    r = Math.max(8, Math.round(scale * 20)),
    ry = Math.max(3, Math.round(r * 0.36));
  p.oval(x + 2, y + 5, r + 2, ry, '#263b40');
  p.oval(x, y + 3, r, ry, '#20333a');
  p.rect(x - r, y, r * 2, 3, '#3e5355');
  p.oval(x, y + 1, r, ry, '#506668');
  const edge = winner ? '#e6bb78' : active ? '#afd9ac' : '#89978a';
  p.oval(x, y - 1, r, ry, edge);
  p.oval(x, y - 2, r - 2, Math.max(2, ry - 1), out ? '#384447' : active ? '#527669' : '#485e5e');
  p.ring(x, y, r - 1, ry - 1, active ? '#88c0a3' : '#6c8279', 0.2, 1.1);
  p.rect(x - 2, y + ry + 1, 5, 1, out ? '#66716c' : edge);
}
function laurel(p, x, y, s, t) {
  for (const sign of [-1, 1]) {
    p.path(
      [
        x + sign * 8 * s,
        y + 2 * s,
        x + sign * 17 * s,
        y - 2 * s,
        x + sign * 22 * s,
        y - 10 * s,
        x + sign * 23 * s,
        y - 20 * s,
      ],
      '#cca96f',
    );
    for (let l = 0; l < 4; l++) {
      const xx = x + sign * (15 + l * 2.5) * s,
        yy = y - l * 4 * s;
      p.polygon([xx, yy, xx + sign * 6 * s, yy - 4 * s, xx + sign * 2 * s, yy - 5 * s], '#e5c688');
    }
  }
  for (let k = 0; k < 4; k++) {
    const xx = x + (k - 1.5) * 9 * s,
      yy = y - ((Math.floor(t / 240 + k) % 4) + 58) * s;
    p.rect(xx, yy, 2, 1, '#ead8a5');
  }
}
function placeKeeper(p, seat, anchor, room, t, staticView, impact) {
  const out = seat.lives === 0,
    active = room.status === 'playing' && room.activeId === seat.id,
    winner = room.winnerId === seat.id;
  const slot = seat.slot ?? anchor.slot,
    frame = out ? 3 : staticView ? 0 : Math.floor(t / (active ? 320 : 530) + slot) % 4;
  const impactAge = impact?.fromSlot === slot ? impact.age : Infinity;
  const sway =
    impact?.kind === 'pop' && impactAge < 550 && !staticView
      ? Math.round(Math.sin(impactAge / 39) * (1 - impactAge / 550) * 3)
      : 0;
  pad(p, anchor, active, out, winner);
  const { x, y, scale, facing } = anchor,
    ctx = p.c;
  ctx.save();
  ctx.translate(Math.round(x + sway), Math.round(y + 1));
  ctx.scale(facing > 0 ? -1 : 1, 1);
  if (out) ctx.globalAlpha = 0.48;
  const size = out ? scale * 0.84 : scale;
  const holdUp = winner || active || (impact?.kind === 'pass' && impactAge < 300);
  const img = sprite(slot, frame, holdUp);
  ctx.drawImage(
    img,
    Math.round(-35 * size),
    Math.round(-59 * size),
    Math.round(68 * size),
    Math.round(64 * size),
  );
  ctx.restore();
  if (winner) laurel(p, x, y, scale, t);
  if (impact?.bonusLife && impact.fromSlot === slot && impact.age < 950) {
    const rise = staticView ? 0 : impact.age / 100;
    p.rect(x + 13 * scale, y - 33 * scale - rise, 6, 2, '#a8e3bc');
    p.rect(x + 15 * scale, y - 35 * scale - rise, 2, 6, '#a8e3bc');
  }
}
function spark(p, x, y, r, color) {
  p.line(x - r, y, x + r, y, color);
  p.line(x, y - r, x, y + r, color);
}
// Each runner and its side twigs are traced a fraction of a pixel-length at a time.
const branches = [
  [
    [0, 0],
    [3, -2],
    [7, -2],
    [10, -5],
    [16, -7],
    [20, -11],
  ],
  [
    [0, 0],
    [-3, -1],
    [-7, -5],
    [-10, -5],
    [-13, -8],
    [-16, -9],
  ],
  [
    [0, 0],
    [3, 0],
    [7, 3],
    [10, 2],
    [14, 5],
    [18, 4],
  ],
  [
    [0, 0],
    [-4, 1],
    [-7, 4],
    [-10, 3],
    [-13, 5],
    [-17, 7],
  ],
  [
    [0, 0],
    [0, -3],
    [2, -6],
    [1, -9],
    [4, -13],
    [4, -16],
  ],
  [
    [0, 0],
    [0, 2],
    [-3, 4],
    [-3, 7],
    [-6, 9],
    [-8, 12],
  ],
];
function drawCulture(p, growth, tint, buds) {
  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i];
    const delay = [0, 0.04, 0.12, 0.15, 0.2, 0.25][i];
    const progress = clamp((growth - delay) / (1 - delay)) * (branch.length - 1);
    for (let j = 1; j < branch.length && j - 1 < progress; j++) {
      const [x, y] = branch[j - 1],
        [u, v] = branch[j];
      const t = clamp(progress - j + 1);
      const tipX = x + (u - x) * t,
        tipY = y + (v - y) * t;
      p.line(x, y, tipX, tipY, tint);
      if (j > 1) {
        const sign = (i + j) % 2 ? -1 : 1;
        const sprout = clamp((progress - j + 0.67) * 1.8);
        const tx = x + (v - y) * sign * sprout,
          ty = y - (u - x) * sign * sprout;
        p.line(x, y, tx, ty, tint);
        if (sprout > 0.82) p.rect(tx, ty, 1, 1, buds);
      }
      if (t < 1 || j === branch.length - 1) p.rect(tipX, tipY, 1, 1, buds);
    }
  }
}
let slideSurface;
function glassSlide(dest, x, y, stage, time, growth, flash = 0, color = null, scale = 1) {
  const level = { steady: 0, warming: 1, urgent: 2 }[stage] ?? 0;
  const sx = Math.round(x),
    sy = Math.round(y),
    tint = color || (level === 2 ? '#e6a089' : level === 1 ? '#e1c184' : '#a1d7bc');
  if (!slideSurface) {
    slideSurface = document.createElement('canvas');
    slideSurface.width = 56;
    slideSurface.height = 54;
  }
  const ctx = slideSurface.getContext('2d');
  ctx.clearRect(0, 0, 56, 54);
  const p = new Pixels(ctx);
  ctx.save();
  ctx.translate(28, 27);
  // A tipped, transparent specimen carrier with a frosted writing strip and a live preparation.
  p.polygon([-22, -1, 14, -12, 24, -4, 24, 1, -12, 13, -23, 6], '#1a3039');
  p.polygon([-22, -1, 14, -12, 24, -4, -12, 8, -22, 4], '#c4e2cb');
  p.polygon([-20, 0, 14, -10, 21, -4, -12, 6], '#588b87');
  p.polygon([-18, 0, -12, -2, -5, 3, -12, 5], '#c5c8a6');
  p.path([-11, 8, 23, -4, 23, -1, -12, 11, -21, 5], '#7eb5a3');
  p.path([-22, -1, 14, -12, 24, -4], '#dfebcd');
  p.line(-15, 0, -12, -1, '#78938a');
  p.line(-13, 2, -10, 1, '#78938a');
  p.oval(3, -2, 8, 4, '#2d6664');
  p.ring(3, -2, 8, 4, '#a1c9ae');
  p.local(3, -3, () => drawCulture(p, growth, tint, level === 2 ? '#ffe4ab' : '#e3edb8'));
  p.oval(3, -3, 1 + Math.round(growth * 1.5), 1, '#b8a878');
  p.rect(2, -4, 2, 1, '#eee5b1');
  if (level > 0 && Math.floor(time / 230) % 2 === 0) spark(p, 13, -9, level, tint);
  if (flash > 0) spark(p, -15, 1, Math.max(1, Math.round(flash * 4)), tint);
  ctx.restore();
  dest.c.drawImage(
    slideSurface,
    Math.round(sx - 28 * scale),
    Math.round(sy - 27 * scale),
    Math.round(56 * scale),
    Math.round(54 * scale),
  );
}
function shattered(p, x, y, age, size) {
  const t = clamp(age / 650),
    rngPoints = 13;
  for (let i = 0; i < rngPoints; i++) {
    const a = i * 2.399,
      dx = Math.cos(a) * (8 + (i % 4) * 4) * t * size,
      dy = Math.sin(a) * (12 + (i % 3) * 3) * t * size - 9 * Math.sin(t * Math.PI) * size + 7 * t * t;
    const xx = x + dx,
      yy = y + dy,
      r = Math.max(1, (1 - t) * (i % 2 ? 3 : 2) * size);
    p.polygon([xx - r, yy, xx + 1, yy - r, xx + r, yy + 1], i % 3 ? '#ecd2a1' : '#98c9b4');
  }
  if (t < 0.64) p.ring(x, y, Math.max(1, t * 21 * size), Math.max(1, t * 11 * size), '#d89a80');
}
function arc(a, b, t, lift) {
  const s = t * t * (3 - 2 * t);
  return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s - Math.sin(t * Math.PI) * lift };
}
function holder(anchor) {
  return { x: anchor.holdX, y: anchor.holdY };
}

export function paintRelay(
  canvas,
  room,
  layout,
  background,
  now,
  event,
  staticView,
  preview,
  growth,
) {
  if (canvas.width !== layout.w) canvas.width = layout.w;
  if (canvas.height !== layout.h) canvas.height = layout.h;
  const context = canvas.getContext('2d', { alpha: false });
  context.imageSmoothingEnabled = false;
  context.drawImage(background, 0, 0);
  const p = new Pixels(context),
    time = staticView ? 0 : now;
  const byId = new Map(layout.slots.map((a) => [a.id, a])),
    bySlot = new Map(layout.slots.map((a) => [a.slot, a]));
  const sorted = room.seats.slice().sort((a, b) => byId.get(a.id).y - byId.get(b.id).y);
  for (const seat of sorted) placeKeeper(p, seat, byId.get(seat.id), room, time, staticView, event);
  const center = layout.center;
  const zoom = Math.min(1.13, Math.max(0.67, layout.slots[0].scale * 0.92));
  const level = room.urgency || 'steady',
    scale = zoom * (0.9 + growth * 0.58);
  const bob = staticView ? 0 : Math.sin(time / (level === 'urgent' ? 165 : 370)) * 1.5;
  let here = room.activeId && byId.get(room.activeId) ? holder(byId.get(room.activeId)) : center,
    show = room.status === 'playing',
    flash = 0,
    tint = null;
  if (preview) {
    const t = staticView ? 0.48 : (1 - Math.cos(time / 1900)) * 0.5;
    here = arc(holder(layout.slots[0]), holder(layout.slots[1]), t, 8);
    show = true;
  } else if (room.status === 'lobby') {
    here = { x: center.x, y: center.y - 3 };
    show = true;
  }
  if (event && !staticView) {
    const from = bySlot.get(event.fromSlot),
      to = bySlot.get(event.toSlot),
      age = event.age;
    if (event.kind === 'pass' && from && to && age < 560) {
      const t = clamp(age / 560),
        lift = Math.min(16, layout.h * 0.07),
        a = holder(from),
        b = holder(to);
      here = arc(a, b, t, lift);
      flash = 1 - t;
      tint = tierColor(event.points);
      show = true;
      for (let i = 1; i <= 3; i++) {
        const prev = arc(a, b, clamp(t - i * 0.035), lift);
        p.rect(prev.x, prev.y, 3 - i * 0.55, 1, tint);
      }
    } else if (event.kind === 'pop' && from && age < 770) {
      const a = holder(from);
      show = false;
      if (age < 100) glassSlide(p, a.x, a.y, 'urgent', time, 1, 1, '#ffce9e', zoom * 1.4);
      else if (age < 690) shattered(p, a.x, a.y, age - 100, zoom);
      if (to && room.status === 'playing' && age > 340) {
        here = arc(center, holder(to), clamp((age - 340) / 430), 7);
        show = true;
      }
    }
  }
  if (show) glassSlide(p, here.x, here.y + bob, level, time, growth, flash, tint, scale);
}
