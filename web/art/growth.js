import { clamp, seeded } from './pixels.js';

const colors = {
  10: '#d3d8d7',
  15: '#a2dba9',
  30: '#99cdec',
  60: '#cbadec',
  85: '#f4cd7e',
  100: '#f5a0a2',
};
const positions = [
  [-0.45, -0.08],
  [0.36, -0.16],
  [-0.05, 0.48],
  [0.66, 0.07],
  [-0.66, 0.22],
  [0.25, 0.5],
  [-0.08, -0.43],
];

export function dishLayout(width) {
  const rx = Math.min(87, Math.round(width * 0.34)),
    ry = Math.round(rx * 0.37);
  const x = Math.round(width * 0.5) - 8,
    y = 97;
  return { x, y, rx, ry, keeperX: x + Math.round(rx * 0.94) };
}

export function ease(t) {
  const n = clamp(t);
  return n * n * (3 - 2 * n);
}
const windowAt = (value, start, end) => ease((value - start) / (end - start));
export const tierColor = (points) => colors[points] || '#a7aaa1';

// One deposited sample per locked round, always in the same well of the dish.
export function sampleAt(dish, slot, points) {
  const [dx, dy] = positions[slot % positions.length];
  const x = Math.round(dish.x + dx * dish.rx),
    y = Math.round(dish.y + dy * dish.ry);
  const sx = Math.round(dish.x + (slot % 2 ? -0.12 : 0.12) * dish.rx),
    sy = Math.round(dish.y + 0.14 * dish.ry);
  const side = x > sx ? 1 : -1,
    span = x - sx;
  return {
    x,
    y,
    sx,
    sy,
    side,
    points,
    slot,
    track: [
      [sx, sy],
      [sx + span * 0.14, sy - 2],
      [sx + span * 0.31, sy + 1],
      [sx + span * 0.49, sy - 3],
      [sx + span * 0.68, sy - 2],
      [sx + span * 0.85, y + 2],
      [x, y],
    ],
  };
}

function pointAlong(points, progress) {
  const end = clamp(progress) * (points.length - 1),
    index = Math.min(points.length - 2, Math.floor(end));
  const f = end - index,
    [x0, y0] = points[index],
    [x1, y1] = points[index + 1];
  return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
}

function stroke(p, points, progress, color, width = 1) {
  if (progress <= 0) return;
  const end = clamp(progress) * (points.length - 1),
    whole = Math.floor(end);
  for (let i = 0; i < whole; i++) p.line(...points[i], ...points[i + 1], color, width);
  if (whole < points.length - 1) p.line(...points[whole], ...pointAlong(points, progress), color, width);
}

export function revealFrame(state, dish) {
  const { points = 0, phase, elapsed = 2000, reduced = false } = state;
  const marks = state.marks || [];
  const active = phase === 'reveal' && points > 0;
  const rare = active && points >= 60;
  const sample = sampleAt(dish, Math.max(0, marks.length - 1), points);
  // Keep the lens on the growing tip as the filament extends and branches open.
  const duration = points >= 60 ? 2.9 + points / 100 : 3;
  const clock = state.slowGrowth ? elapsed / duration : elapsed;
  const progress =
    !active || reduced ? 1 : rare ? clamp((clock - 85) / 850) : ease((clock - 80) / 620);
  const focus = !rare || reduced ? 0 : windowAt(clock, 65, 490) * (1 - windowAt(clock, 860, 1360));
  const lift = points === 100 ? 37 : points === 85 ? 25 : 3;
  const [tipX, tipY] = pointAlong(sample.track, windowAt(progress, 0, 0.55));
  return { progress, focus, tipX, tipY: tipY - lift * windowAt(progress, 0.42, 0.88), sample };
}

function pearl(p, x, y, size, points) {
  const shade =
    points === 100 ? '#a45e6d' : points === 85 ? '#a27b55' : points === 60 ? '#8e7da6' : '#689d94';
  p.oval(x, y, size, size * 0.78, shade);
  p.oval(x, y - 1, size * 0.76, size * 0.55, tierColor(points));
  p.rect(x - 1, y - 2, 2, 1, '#f3ebcf');
}

function patch(p, x, y, r, points, slot) {
  if (r <= 0) return;
  const colors =
    points === 10
      ? ['#627c73', '#8fae92', '#c9d2ad']
      : points === 15
        ? ['#467e6f', '#75ae89', '#afcea2']
        : ['#416f76', '#6ca6a7', '#a1c8ba'];
  const seed = seeded(229 + slot),
    shape = [];
  for (let i = 0; i < 28; i++) {
    const a = (i * Math.PI) / 14,
      edge = 0.9 + 0.11 * Math.sin(a * 6 + slot) + 0.03 * seed();
    shape.push([Math.cos(a) * edge, Math.sin(a) * edge * 0.53]);
  }
  for (let layer = 0; layer < 3; layer++) {
    const scale = r * (1 - layer * 0.24);
    p.polygon(
      shape.flatMap(([dx, dy]) => [x + dx * scale, y + dy * scale - layer * 0.35]),
      colors[layer],
    );
  }
  for (let i = 0; i < r * 1.6; i++) {
    const a = seed() * Math.PI * 2,
      dist = Math.sqrt(seed()) * r * 0.7;
    p.rect(
      x + Math.cos(a) * dist,
      y + Math.sin(a) * dist * 0.49,
      1,
      1,
      i % 3 ? '#819c82' : tierColor(points),
    );
  }
}

function feed(p, s, progress) {
  const travel = windowAt(progress, 0, 0.54),
    warm = progress < 0.96;
  stroke(p, s.track, travel, '#4c8d80', 3);
  stroke(p, s.track, travel, '#b0d6a4', 1);
  for (let i = 2; i <= 5; i++) {
    const at = s.track[i],
      sign = i % 2 ? 1 : -1;
    const t = clamp((travel - i / 6) * 4);
    const twig = [at, [at[0] + s.side * 2, at[1] - 2 * sign], [at[0] + s.side * 4, at[1] - 4 * sign]];
    stroke(p, twig, t, '#89bc99');
  }
  if (travel > 0 && travel < 1 && warm) {
    const [tx, ty] = pointAlong(s.track, travel);
    p.rect(tx - 1, ty - 1, 3, 2, '#f5efbe');
  }
}

function lowFan(p, s, progress) {
  const { x, y, side } = s;
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.43,
      end = [x + side * (9 + Math.cos(a) * 8), y + Math.sin(a) * 11 - 1];
    const path = [[x, y], [x + side * 4, y - (i % 2)], [x + side * 9, y + Math.sin(a) * 6], end];
    const t = windowAt(progress, 0.32 + i * 0.035, 0.82 + i * 0.035);
    stroke(p, path, t, '#8799ac', 2);
    stroke(p, path, t, '#c9c9bb');
    if (t > 0.87) pearl(p, ...end, 1 + (i % 2), 60);
  }
}

function frond(p, x, y, height, lean, points, progress) {
  const top = [x + lean, y - height],
    t = clamp(progress);
  if (!t) return;
  const pointsOnStem = [
    [x, y],
    [x + lean * 0.1, y - height * 0.28],
    [x + lean * 0.6, y - height * 0.6],
    top,
  ];
  stroke(p, pointsOnStem, t, '#529182', 3);
  stroke(p, pointsOnStem, t, '#b7d6a5');
  for (let i = -1; i <= 1; i++) {
    const fork = [
      [top[0] - lean * 0.35, top[1] + height * 0.28],
      [top[0] + i * 3, top[1] + 2],
      [top[0] + i * 6, top[1] - 3 - Math.abs(i)],
    ];
    const reach = windowAt(t, 0.57, 1);
    stroke(p, fork, reach, '#9cc6a3', 2);
    if (reach > 0.8) pearl(p, ...fork[2], i === 0 ? 3 : 2, points);
  }
}

function crown(p, s, progress) {
  // The two antler-like arms reach across an empty center before the warm fruit opens.
  const { x, y } = s;
  for (const sign of [-1, 1]) {
    const arm = [
      [x, y],
      [x + sign * 8, y - 9],
      [x + sign * 14, y - 18],
      [x + sign * 14, y - 29],
      [x + sign * 10, y - 36],
      [x + sign * 4, y - 42],
      [x, y - 43],
    ];
    const length = windowAt(progress, 0.33, 0.88);
    stroke(p, arm, length, '#659d89', 3);
    stroke(p, arm, length, '#c5d8aa');
    for (const [i, ox, oy] of [
      [2, 7, 3],
      [3, 5, 7],
      [4, 5, 10],
    ]) {
      const point = arm[i],
        branch = [point, [point[0] + sign * 3, point[1] - 3], [point[0] + sign * ox, point[1] - oy]];
      const bloom = windowAt(progress, 0.48 + i * 0.06, 0.69 + i * 0.065);
      stroke(p, branch, bloom, '#a9c59f', 2);
      if (bloom > 0.65) pearl(p, ...branch[2], 1 + bloom * 1.7, 100);
    }
  }
  const bloom = windowAt(progress, 0.78, 1);
  if (bloom > 0) {
    const cy = y - 44,
      r = 4 * bloom;
    p.polygon([x, cy - r * 1.7, x + r, cy, x, cy + r, x - r, cy], '#d78582');
    p.polygon([x, cy - r * 1.7, x + r * 0.35, cy, x, cy + r * 0.6, x - r, cy], '#f7b29b');
    p.rect(x - 1, cy - r, 2, 1, '#ffe6b5');
    const crownTips = [
      [-5, -3],
      [0, -6],
      [5, -3],
    ];
    for (const [dx, dy] of crownTips) {
      const tx = x + dx * bloom,
        ty = cy + dy * bloom;
      p.line(x, cy, tx, ty, '#e59289', 2);
      p.rect(tx, ty - 1, 2, 2, '#f9c2a9');
    }
  }
}

export function drawSample(p, s, progress) {
  if (progress <= 0 || !s.points) return;
  const { x, y, points, slot } = s;
  if (points < 60) {
    const r = (points === 10 ? 8 : points === 15 ? 9 : 10) * progress;
    patch(p, x, y, r, points, slot);
    if (points >= 15 && progress > 0.48) patch(p, x + 5, y + 2, r * 0.54, points, slot + 12);
    if (points === 30) {
      stroke(
        p,
        [
          [x, y],
          [x + 3, y - 3],
          [x + 6, y - 4],
          [x + 9, y - 3],
        ],
        progress,
        '#a6cfd1',
      );
      if (progress > 0.81) pearl(p, x + 9, y - 4, 1, 30);
    }
    return;
  }
  feed(p, s, progress);
  const anchor = windowAt(progress, 0.26, 0.66);
  if (anchor > 0) patch(p, x, y, 6 * anchor, points, slot);
  if (points === 60) lowFan(p, s, progress);
  if (points === 85) {
    frond(p, x, y, 24, s.side * 3, 85, windowAt(progress, 0.32, 0.87));
    frond(p, x - 5, y + 1, 13, -4, 85, windowAt(progress, 0.48, 0.98));
    frond(p, x + 5, y + 2, 16, 5, 85, windowAt(progress, 0.52, 1));
  }
  if (points === 100) crown(p, s, progress);
}
