import { seeded } from './pixels.js';

// A few side benches enter frame as the aspect ratio opens; the culture stays under the lamp.
export function nightWindow(p, x, y) {
  const w = 69,
    h = 52;
  p.rect(x - 2, y - 2, w + 4, h + 6, '#19242f');
  p.rect(x, y, w, h, '#45565e');
  p.rect(x + 3, y + 3, w - 6, h - 6, '#293d51');
  for (let i = 0; i < 5; i++)
    p.rect(x + 3, y + 7 + i * 7, w - 6, 6, ['#2d4255', '#344956', '#3d5161', '#465b65', '#546971'][i]);
  const rng = seeded(348);
  for (let i = 0; i < 18; i++)
    p.rect(x + 4 + rng() * (w - 9), y + 4 + rng() * 21, 1, 1, i % 4 ? '#647e86' : '#a3b2a1');
  // Roofs and water tanks beyond the incubation room.
  p.polygon(
    [
      x + 3,
      y + 39,
      x + 10,
      y + 35,
      x + 21,
      y + 35,
      x + 26,
      y + 29,
      x + 35,
      y + 33,
      x + 43,
      y + 30,
      x + 52,
      y + 31,
      x + 66,
      y + 26,
      x + 66,
      y + 49,
      x + 3,
      y + 49,
    ],
    '#435461',
  );
  p.polygon(
    [
      x + 3,
      y + 43,
      x + 11,
      y + 39,
      x + 25,
      y + 39,
      x + 29,
      y + 36,
      x + 37,
      y + 40,
      x + 41,
      y + 40,
      x + 46,
      y + 37,
      x + 55,
      y + 35,
      x + 65,
      y + 39,
      x + 65,
      y + 49,
      x + 3,
      y + 49,
    ],
    '#2b3c48',
  );
  p.rect(x + 14, y + 28, 10, 10, '#334350');
  p.polygon([x + 13, y + 28, x + 19, y + 24, x + 25, y + 28], '#344450');
  p.rect(x + 15, y + 37, 1, 5, '#303f4a');
  p.rect(x + 22, y + 37, 1, 5, '#303f4a');
  for (let i = 0; i < 5; i++)
    p.rect(x + 8 + i * 10, y + 41 - (i % 3), 2, 1, i === 3 ? '#b49b75' : '#788386');
  p.rect(x + 33, y + 2, 3, h - 4, '#263640');
  p.rect(x + 34, y + 2, 1, h - 4, '#53656a');
  p.rect(x + 2, y + 20, w - 4, 2, '#30414a');
  p.rect(x - 3, y + h, w + 6, 3, '#76837c');
  p.rect(x - 4, y + h + 3, w + 8, 2, '#273840');
}
export function sideStorage(p, w, cx) {
  const start = cx + 155;
  for (let x = start; x < w - 8; x += 65) {
    p.rect(x, 11, 53, 52, '#192731');
    p.rect(x + 2, 13, 49, 48, '#3a4b54');
    for (let row = 0; row < 3; row++) {
      const y = 15 + row * 15;
      p.rect(x + 4, y, 45, 13, '#293b43');
      p.rect(x + 5, y, 43, 1, '#52666a');
      p.rect(x + 16, y + 3, 14, 4, '#687674');
      p.rect(x + 18, y + 4, 10, 2, '#a0a187');
      p.rect(x + 21, y + 8, 6, 2, '#627473');
    }
  }
}
export function benchTools(p, cx, w) {
  // Ground-glass stopper and stained slides in a small wooden tray on the left.
  const x = cx - 146,
    y = 111;
  p.polygon([x - 18, y - 6, x + 19, y - 9, x + 28, y + 1, x - 15, y + 4], '#3d4146');
  p.polygon([x - 18, y - 7, x + 19, y - 10, x + 27, y - 1, x - 16, y + 2], '#897968');
  p.polygon([x - 15, y - 6, x + 17, y - 9, x + 22, y - 3, x - 13, y], '#4e5451');
  for (let i = 0; i < 3; i++) {
    const a = x - 11 + i * 9,
      b = y - 6 - i;
    p.polygon([a, b, a + 6, b - 1, a + 9, b + 4, a + 3, b + 4], '#9aaea0');
    p.rect(a + 3, b + 1, 3, 2, i % 2 ? '#a88476' : '#758f84');
  }
  // An open notebook sits at an angle to the dish. The pale ink is annotations, ribbon and shadow.
  const right = cx + 139;
  if (right - 16 > w) return;
  p.local(right, 113, () => {
    p.polygon([-23, -6, -1, -9, 1, -8, 18, -12, 27, 1, 5, 6, -19, 8], '#253b42');
    p.polygon([-23, -8, -2, -11, 2, -10, 18, -14, 24, -2, 5, 3, -19, 5], '#777365');
    p.polygon([-21, -9, -3, -12, 1, -10, 5, 1, -18, 4], '#bbb79c');
    p.polygon([1, -10, 17, -14, 22, -3, 5, 1], '#a3a78f');
    p.line(-2, -10, 3, 2, '#726d63');
    for (let row = 0; row < 3; row++) {
      p.line(-17 + row, -7 + row * 3, -6 + row, -9 + row * 3, '#84958b');
      p.line(5 + row, -8 + row * 2, 14 + row, -10 + row * 2, '#7a8f82');
    }
    p.path([3, 1, 5, 5, 8, 5], '#c58973', 2);
    p.path([13, 8, 27, 4, 29, 4], '#24323b', 2);
    p.line(14, 7, 27, 3, '#ad9476');
  });
}
