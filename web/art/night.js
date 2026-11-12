import { Pixels, clamp } from './pixels.js';
import { cultureRoom, cultureDish } from './culture.js';
import { dishLayout, revealFrame } from './growth.js';

const backgrounds = new Map(),
  renders = new WeakMap();
const baseHeight = 152;

function backdrop(width, lit) {
  const key = width + '/' + lit;
  if (!backgrounds.has(key)) {
    const layer = document.createElement('canvas');
    layer.width = width;
    layer.height = baseHeight;
    cultureRoom(new Pixels(layer.getContext('2d')), width, lit);
    if (backgrounds.size >= 12) backgrounds.delete(backgrounds.keys().next().value);
    backgrounds.set(key, layer);
  }
  return backgrounds.get(key);
}

function resize(canvas, width, height) {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

function shadeOutside(context, width, height, x, y, focus) {
  if (!focus) return;
  // The wide, graduated edge keeps the illuminated filament in the same illustrated room.
  for (const radius of [34, 44, 55, 66, 79, 94, 111]) {
    context.beginPath();
    context.rect(0, 0, width, height);
    context.ellipse(x, y, radius, radius * 0.67, 0, 0, Math.PI * 2);
    context.fillStyle = 'rgba(9,17,29,' + focus * 0.105 + ')';
    context.fill('evenodd');
  }
}

export function paintNight(canvas, state) {
  if (!canvas.clientWidth || !canvas.clientHeight) return;
  // Keep the entire specimen and keeper framed on tall phones. Extra height reveals the wall and bench front.
  const scale = Math.min(canvas.clientHeight / baseHeight, canvas.clientWidth / 164);
  const width = Math.max(1, Math.min(1600, Math.round(canvas.clientWidth / scale)));
  const height = Math.max(baseHeight, Math.min(900, Math.round(canvas.clientHeight / scale)));
  const top = Math.round((height - baseHeight) * 0.49);
  const reveal = state.phase === 'reveal' && state.points > 0 && !state.reduced;
  const step = reveal && state.elapsed < 1360 ? Math.floor(state.elapsed / 35) : 'held';
  const pose = state.reduced ? 0 : Math.floor(state.time / 570) % 4;
  const key = [
    width,
    height,
    state.phase,
    state.total,
    state.points,
    state.marks?.join(),
    pose,
    step,
    state.cosmetic,
    state.reduced,
  ].join('/');
  const previous = renders.get(canvas);
  if (previous?.key === key) return;
  const buffer = previous?.buffer || document.createElement('canvas');
  renders.set(canvas, { key, buffer });
  resize(buffer, width, height);
  resize(canvas, width, height);
  const context = buffer.getContext('2d', { alpha: false });
  context.imageSmoothingEnabled = false;
  const motion = revealFrame(state, dishLayout(width)),
    marks = state.marks || [];
  const hasPrevious = (state.phase === 'reveal' ? marks.slice(0, -1) : marks).some((n) => n >= 60);
  const lit = hasPrevious || (state.phase === 'reveal' && state.points >= 60 && motion.progress > 0.42);
  context.fillStyle = lit ? '#263645' : '#222b3d';
  context.fillRect(0, 0, width, height);
  if (top > 0) {
    context.fillStyle = '#303a49';
    for (let y = top - 20; y >= 0; y -= 17) context.fillRect(0, y, width, 1);
    context.fillStyle = '#15212c';
    context.fillRect(Math.round(width / 2) - 15, 0, 3, top);
  }
  context.drawImage(backdrop(width, lit), 0, top);
  context.save();
  context.translate(0, top);
  cultureDish(new Pixels(context), width, state, motion);
  context.restore();
  if (top + baseHeight < height) {
    const front = top + baseHeight;
    context.fillStyle = '#25343c';
    context.fillRect(0, front, width, height - front);
    for (let x = -12; x < width; x += 84) {
      context.fillStyle = '#34464a';
      context.fillRect(x, front + 4, 79, Math.max(1, height - front - 9));
      context.fillStyle = '#2c3c42';
      context.fillRect(x + 2, front + 6, 75, Math.max(1, height - front - 13));
      context.fillStyle = '#586a66';
      context.fillRect(x + 30, front + 9, 20, 2);
    }
  }
  const x = motion.tipX,
    y = motion.tipY + top;
  shadeOutside(context, width, height, x, y, motion.focus);
  const out = canvas.getContext('2d', { alpha: false });
  out.imageSmoothingEnabled = false;
  if (motion.focus === 0) {
    out.drawImage(buffer, 0, 0);
    return;
  }
  const maxZoom = width < 200 ? 1.48 : state.points === 100 ? 1.85 : 1.7;
  const zoom = 1 + (maxZoom - 1) * motion.focus;
  const cropWidth = Math.round(width / zoom),
    cropHeight = Math.round(height / zoom);
  const centerX = width * 0.5 + (x - width * 0.5) * motion.focus;
  const centerY = height * 0.5 + (y - height * 0.5) * motion.focus;
  const left = Math.round(clamp(centerX - cropWidth * 0.5, 0, width - cropWidth));
  const upper = Math.round(clamp(centerY - cropHeight * 0.5, 0, height - cropHeight));
  out.drawImage(buffer, left, upper, cropWidth, cropHeight, 0, 0, width, height);
}
