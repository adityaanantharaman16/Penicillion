import { Pixels, seeded } from './pixels.js';

const shapes = {
  1: [[0.5, 0.65]],
  2: [
    [0.25, 0.62],
    [0.75, 0.62],
  ],
  3: [
    [0.28, 0.42],
    [0.72, 0.42],
    [0.5, 0.77],
  ],
  4: [
    [0.28, 0.39],
    [0.72, 0.39],
    [0.72, 0.76],
    [0.28, 0.76],
  ],
  5: [
    [0.34, 0.33],
    [0.66, 0.33],
    [0.81, 0.63],
    [0.5, 0.84],
    [0.19, 0.63],
  ],
  6: [
    [0.34, 0.29],
    [0.66, 0.29],
    [0.8, 0.54],
    [0.66, 0.8],
    [0.34, 0.8],
    [0.2, 0.54],
  ],
  7: [
    [0.34, 0.25],
    [0.66, 0.25],
    [0.81, 0.44],
    [0.77, 0.67],
    [0.5, 0.83],
    [0.23, 0.67],
    [0.19, 0.44],
  ],
  8: [
    [0.34, 0.27],
    [0.66, 0.27],
    [0.8, 0.44],
    [0.8, 0.66],
    [0.63, 0.82],
    [0.37, 0.82],
    [0.2, 0.66],
    [0.2, 0.44],
  ],
};
const portraitShapes = {
  2: [
    [0.34, 0.4],
    [0.66, 0.76],
  ],
  3: [
    [0.25, 0.37],
    [0.75, 0.37],
    [0.5, 0.78],
  ],
  4: [
    [0.25, 0.36],
    [0.75, 0.36],
    [0.75, 0.76],
    [0.25, 0.76],
  ],
  5: [
    [0.3, 0.245],
    [0.7, 0.245],
    [0.82, 0.54],
    [0.5, 0.79],
    [0.18, 0.54],
  ],
  6: [
    [0.3, 0.25],
    [0.7, 0.25],
    [0.83, 0.5],
    [0.69, 0.75],
    [0.31, 0.75],
    [0.17, 0.5],
  ],
  7: [
    [0.28, 0.16],
    [0.72, 0.16],
    [0.81, 0.394],
    [0.77, 0.628],
    [0.5, 0.848],
    [0.23, 0.628],
    [0.19, 0.394],
  ],
  8: [
    [0.28, 0.16],
    [0.72, 0.16],
    [0.81, 0.394],
    [0.81, 0.628],
    [0.68, 0.848],
    [0.32, 0.848],
    [0.19, 0.628],
    [0.19, 0.394],
  ],
};
// Three rear and three front places keep eight distinct portraits visible when vertical space is tight.
const lowFormations = {
  7: [
    [0.22, 0.26],
    [0.5, 0.18],
    [0.78, 0.26],
    [0.85, 0.56],
    [0.66, 0.8],
    [0.34, 0.8],
    [0.15, 0.56],
  ],
  8: [
    [0.235, 0.26],
    [0.5, 0.18],
    [0.765, 0.26],
    [0.85, 0.55],
    [0.765, 0.79],
    [0.5, 0.84],
    [0.235, 0.79],
    [0.15, 0.55],
  ],
};
export function arenaLayout(cssWidth, cssHeight, seats, preview = false) {
  const n = Math.max(1, Math.min(8, seats.length));
  const compact = cssWidth < 600;
  const pixel = Math.max(
    1,
    Math.min(cssWidth / (compact ? 218 : 354), cssHeight / (n >= 7 ? 239 : 185)),
  );
  const w = Math.round(cssWidth / pixel),
    h = Math.round(cssHeight / pixel),
    portrait = compact && cssHeight > cssWidth * 0.59;
  const dense = !preview && n >= 7 && compact && cssHeight < 500;
  const coordinates =
    (dense && lowFormations[n]) || (portrait && !preview ? portraitShapes[n] : null) || shapes[n];
  const group = n >= 7,
    duel = n <= 2;
  const size = preview
    ? Math.min(h * 0.37, w * 0.25)
    : duel
      ? Math.min(h * 0.32, w * 0.24)
      : Math.min(
          h * (group ? (dense ? 0.145 : compact ? 0.135 : 0.165) : 0.23),
          w * (group ? 0.156 : 0.189),
        );
  const slots = seats.map((seat, i) => {
    const [px, py] = coordinates[i],
      x = Math.round(w * px),
      y = Math.round(h * py);
    const scale = (size * (0.9 + py * 0.15)) / 61;
    const centerAligned = Math.abs(px - 0.5) < 0.07;
    const facing = centerAligned ? (py > 0.6 ? -1 : 1) : px < 0.5 ? 1 : -1;
    // Hold the slide on the inside edge of the table, in reach of its current keeper.
    const holdX = x;
    const holdY = y;
    return { id: seat.id, slot: seat.slot ?? i, x, y, scale, facing, holdX, holdY };
  });
  // Reserve the silhouettes and the room directly under each keeper for its HUD.
  // Overhead is preferred; tightly packed back seats can use a clear patch inward.
  const halfGlass = Math.min(1.13, Math.max(0.67, slots[0]?.scale * 0.92 || 1)) * 1.5;
  const plateHalfW = halfGlass * 25,
    plateHalfH = halfGlass * 17;
  const hudHalfWidth = (compact ? Math.min(94, cssWidth * 0.26) : 108) / (2 * pixel);
  const hudHeight = (compact ? 40 : 47) / pixel;
  const occupied = [];
  for (const a of slots) {
    occupied.push([a.x - 18 * a.scale, a.y - 60 * a.scale, a.x + 18 * a.scale, a.y + 2]);
    if (!preview)
      occupied.push([a.x - hudHalfWidth, a.y + 6, a.x + hudHalfWidth, a.y + 6 + hudHeight]);
  }
  for (const a of slots) {
    const facing = a.facing;
    const ceiling = a.y - 61 * a.scale - plateHalfH - 3;
    const inward = 22 * a.scale + plateHalfW + 3;
    const candidates = [
      [a.x + facing * 10 * a.scale, ceiling],
      [a.x + facing * inward, a.y - 48 * a.scale],
      [a.x + facing * inward, a.y - 22 * a.scale],
      [a.x - facing * inward, a.y - 46 * a.scale],
      [a.x + facing * inward, ceiling + 4],
      [a.x - facing * 9 * a.scale, ceiling],
    ];
    let best = Infinity;
    for (const [cx, cy] of candidates) {
      const xx = Math.max(plateHalfW + 2, Math.min(w - plateHalfW - 2, cx));
      const yy = Math.max(plateHalfH + 2, Math.min(h - plateHalfH - 2, cy));
      const bounds = [xx - plateHalfW, yy - plateHalfH, xx + plateHalfW, yy + plateHalfH];
      let overlap = 0;
      for (const [left, top, right, bottom] of occupied) {
        overlap +=
          Math.max(0, Math.min(right, bounds[2]) - Math.max(left, bounds[0])) *
          Math.max(0, Math.min(bottom, bounds[3]) - Math.max(top, bounds[1]));
      }
      if (overlap < best) {
        best = overlap;
        a.holdX = xx;
        a.holdY = yy;
      }
      if (!overlap) break;
    }
  }
  return {
    w,
    h,
    slots,
    compact,
    dense,
    pixel,
    center: { x: w * 0.5, y: h * (portrait ? 0.49 : 0.53) },
  };
}

function observationBay(p, x, y, width) {
  p.rect(x - 2, y - 2, width + 4, 24, '#131d29');
  p.rect(x, y, width, 21, '#506369');
  p.rect(x + 2, y + 2, width - 4, 16, '#273d4e');
  const rng = seeded(228);
  for (let i = 0; i < width / 6; i++)
    p.rect(x + 3 + rng() * (width - 7), y + 3 + rng() * 10, 1, 1, i % 4 ? '#789197' : '#b7b99f');
  p.polygon(
    [
      x + 2,
      y + 17,
      x + 7,
      y + 14,
      x + 17,
      y + 15,
      x + 23,
      y + 12,
      x + 32,
      y + 15,
      x + 39,
      y + 13,
      x + 46,
      y + 14,
      x + width - 2,
      y + 11,
      x + width - 2,
      y + 18,
      x + 2,
      y + 18,
    ],
    '#3a5260',
  );
  for (let i = 24; i < width - 6; i += 29) {
    p.rect(x + i, y + 1, 2, 19, '#233641');
    p.rect(x + i, y + 1, 1, 19, '#526970');
  }
  p.rect(x - 2, y + 20, width + 4, 2, '#78877d');
}
function vial(p, x, y, h, tint) {
  p.rect(x - 2, y - h - 2, 5, 2, '#827766');
  p.rect(x - 2, y - h, 5, h, '#708783');
  p.rect(x - 1, y - h, 3, h - 1, '#30494d');
  p.rect(x - 1, y - 4, 3, 3, tint);
  p.rect(x - 1, y - h + 2, 1, 3, '#a7afa1');
}
function sideStation(p, x, y, sign) {
  p.c.save();
  p.c.translate(x, y);
  p.c.scale(sign, 1);
  p.polygon([0, 0, 19, -3, 27, 5, 7, 9], '#84938b');
  p.polygon([7, 9, 27, 5, 27, 10, 7, 15], '#293d43');
  p.polygon([0, 0, 7, 9, 7, 15, 0, 6], '#1c3039');
  for (let i = 0; i < 3; i++)
    vial(p, 6 + i * 5, 4 - i, 8 + (i % 2) * 3, i === 1 ? '#b68975' : '#7da48e');
  p.c.restore();
}

function ring(p, x, y, rx, ry) {
  // Etched copper tracks follow the oval. Small scale marks turn it into a bench instrument.
  p.oval(x, y + 4, rx + 3, ry + 3, '#23363e');
  p.oval(x, y + 1, rx + 2, ry + 2, '#617772');
  p.oval(x, y, rx + 1, ry + 1, '#293e46');
  p.oval(x, y, rx - 2, ry - 1, '#405951');
  p.ring(x, y, rx - 5, ry - 3, '#829084');
  p.ring(x, y, rx - 7, ry - 5, '#4a7168');
  p.oval(x, y, rx - 9, ry - 6, '#38534f');
  const rng = seeded(729);
  for (let i = 0; i < rx * 1.35; i++) {
    const angle = rng() * Math.PI * 2,
      r = Math.sqrt(rng());
    p.rect(
      x + Math.cos(angle) * (rx - 11) * r,
      y + Math.sin(angle) * (ry - 7) * r,
      1 + Math.floor(rng() * 3),
      1,
      i % 5 ? '#3d5b55' : '#4a635b',
    );
  }
  for (let tick = 0; tick < 48; tick++) {
    const a = (tick * Math.PI) / 24,
      span = tick % 4 ? 1 : 3;
    p.line(
      x + (rx - 2) * Math.cos(a),
      y + (ry - 1) * Math.sin(a),
      x + (rx - 2 - span) * Math.cos(a),
      y + (ry - 1 - span) * Math.sin(a),
      tick % 4 ? '#5d7670' : '#a6a38a',
    );
  }
}
function medallion(p, cx, cy) {
  p.oval(cx, cy + 1, 15, 7, '#2b4848');
  p.ring(cx, cy, 15, 7, '#57766b');
  p.ring(cx, cy, 11, 5, '#46685d');
  p.path([cx - 7, cy + 1, cx - 1, cy + 1, cx + 3, cy - 2, cx + 7, cy - 2], '#789583');
  for (const [dx, dy] of [
    [-5, -1],
    [0, -2],
    [2, 2],
  ])
    p.rect(cx + dx, cy + dy, 2, 1, '#769684');
}
export function arenaBackdrop(layout) {
  const { w, h, compact, center } = layout;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const p = new Pixels(c.getContext('2d', { alpha: false })),
    wall = Math.round(h * 0.14),
    rng = seeded(367);
  p.rect(0, 0, w, h, '#2c3c47');
  for (let y = 0; y < wall + 4; y += 8) {
    p.rect(0, y, w, 1, '#354855');
    for (let x = -18 + (y % 3) * 11; x < w; x += 34) p.rect(x, y, 1, 8, '#354855');
  }
  const bayWidth = Math.min(82, Math.floor(w * 0.25));
  observationBay(p, Math.floor((w - bayWidth) / 2), Math.min(0, wall - 24), bayWidth);
  for (const side of [-1, 1]) {
    const dx = Math.round(w / 2 + side * (bayWidth / 2 + 22));
    p.rect(dx - 10, 0, 19, wall - 4, '#1c2d37');
    p.rect(dx - 8, 0, 15, wall - 6, '#3d525b');
    for (let i = 0; i < 4; i++) p.rect(dx - 6 + i * 3, 2, 1, Math.max(3, wall - 11), '#273d49');
  }
  p.rect(0, wall - 2, w, 4, '#192c37');
  p.rect(0, wall, w, 1, '#6d807a');
  p.rect(0, wall + 2, w, h - wall - 2, '#37494d');
  // Long staggered tiles, darker at the perimeter and quieter where names sit.
  for (let row = 0, y = wall + 3; y < h; row++) {
    const rh = 8 + row * 2;
    p.rect(0, y, w, 1, '#304047');
    for (let x = -15 - (row % 2) * 23; x < w; x += 46 + row * 2)
      p.line(x, y, x - 2 + Math.round((x - w / 2) * 0.014), y + rh, '#314248');
    y += rh;
  }
  for (let i = 0; i < w * 0.7; i++)
    p.rect(rng() * w, wall + rng() * (h - wall), 1 + Math.floor(rng() * 3), 1, '#405156');
  const rx = Math.floor(w * (compact ? 0.445 : 0.405)),
    ry = Math.floor(h * (compact ? 0.35 : 0.325));
  ring(p, Math.round(center.x), Math.round(h * 0.53), rx, ry);
  medallion(p, Math.round(center.x), Math.round(h * 0.54));
  const yt = Math.round(h * 0.58);
  sideStation(p, compact ? -13 : 3, yt, 1);
  sideStation(p, compact ? w + 13 : w - 3, yt, -1);
  // A low shadowed front rail frames the floor, like the rail under the solo dish.
  p.rect(0, h - 5, w, 5, '#1f323a');
  p.rect(0, h - 5, w, 1, '#65766d');
  for (let x = 12; x < w; x += 47) p.rect(x, h - 3, 2, 1, '#66766c');
  return c;
}
