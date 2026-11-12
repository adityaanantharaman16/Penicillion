import { btn, el, field, p } from './ui.js';
let context = null,
  master = null;
const media = matchMedia('(prefers-reduced-motion: reduce)');
function saved(key, defaultValue) {
  try {
    return localStorage.getItem('penicillion:' + key) ?? defaultValue;
  } catch {
    return defaultValue;
  }
}
function save(key, value) {
  try {
    localStorage.setItem('penicillion:' + key, value);
  } catch {}
}
export const prefs = {
  sound: saved('sound', 'off') === 'on',
  static: saved('static', 'off') === 'on',
  volume: Number(saved('volume', '.45')),
  get reduced() {
    return media.matches || this.static;
  },
};
export function unlockSound() {
  if (!prefs.sound) return;
  try {
    if (!context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      context = new Audio();
      master = context.createGain();
      master.connect(context.destination);
    }
    master.gain.value = Math.max(0, Math.min(1, prefs.volume)) * 0.16;
    if (context.state === 'suspended') context.resume().catch(() => {});
  } catch {}
}
function note(hz, delay, length, level, type = 'sine') {
  const start = context.currentTime + delay,
    osc = context.createOscillator(),
    env = context.createGain();
  osc.type = type;
  osc.frequency.value = hz;
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(level, start + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(env);
  env.connect(master);
  osc.start(start);
  osc.stop(start + length + 0.012);
  osc.onended = () => {
    osc.disconnect();
    env.disconnect();
  };
}
export function cue(kind, points = 0) {
  if (!prefs.sound || !context || context.state !== 'running') return;
  if (kind === 'recap')
    return [293.66, 369.99, 440, 587.33].forEach((hz, i) => note(hz, 0.035 * i, 0.6, 0.22));
  if (kind === 'pass') {
    note(392, 0, 0.12, 0.28);
    note(523.25, 0.1, 0.21, 0.24);
    return;
  }
  if (kind === 'pop') {
    note(220, 0, 0.09, 0.36, 'triangle');
    note(146.83, 0.055, 0.17, 0.25);
    return;
  }
  if (kind === 'life') {
    [392, 493.88, 659.25].forEach((hz, i) => note(hz, i * 0.08, 0.24, 0.25));
    return;
  }
  if (points <= 0) return;
  note(246.94, 0, 0.13, 0.4, 'triangle');
  note(329.63, 0.11, 0.25, 0.4);
  if (points >= 60) {
    note(440, 0.23, 0.3, 0.35);
    note(659.26, 0.36, 0.4, 0.24);
  }
}
function toggleSound() {
  prefs.sound = !prefs.sound;
  save('sound', prefs.sound ? 'on' : 'off');
  if (prefs.sound) unlockSound();
  else if (master) master.gain.value = 0;
  refresh();
}
function refresh() {
  const b = document.querySelector('#sound');
  b.textContent = prefs.sound ? 'Sound on' : 'Sound off';
  b.setAttribute('aria-pressed', prefs.sound);
  document.documentElement.dataset.static = prefs.reduced ? 'yes' : 'no';
}
export function setupPreferences() {
  document.querySelector('#sound').addEventListener('click', toggleSound);
  const gear = document.querySelector('#settings');
  gear.textContent = 'Settings';
  gear.addEventListener('click', () => {
    const dialog = document.querySelector('#settings-dialog'),
      sound = el('input', { type: 'checkbox', checked: prefs.sound }),
      still = el('input', { type: 'checkbox', checked: prefs.reduced, disabled: media.matches }),
      volume = el('input', { type: 'range', min: '0', max: '1', step: '.05', value: prefs.volume });
    sound.addEventListener('change', toggleSound);
    still.addEventListener('change', () => {
      prefs.static = still.checked;
      save('static', prefs.static ? 'on' : 'off');
      refresh();
    });
    volume.addEventListener('input', () => {
      prefs.volume = Number(volume.value);
      save('volume', String(prefs.volume));
      unlockSound();
    });
    dialog.replaceChildren(
      el('h2', { id: 'settings-title' }, 'Bench settings'),
      field('Sound', sound),
      field('Volume', volume),
      field('Static scenery', still),
      p(
        media.matches
          ? 'Reduced motion is enabled in your device settings.'
          : 'Static scenery keeps every result visible without movement.',
      ),
      btn('Done', () => dialog.close(), 'btn primary'),
    );
    dialog.showModal();
  });
  document.addEventListener('pointerdown', unlockSound, { passive: true });
  document.addEventListener('keydown', unlockSound, { passive: true });
  media.addEventListener('change', refresh);
  refresh();
}
