import { getSession, currentSession } from './api.js';
import { setupPreferences } from './preferences.js';
import { el, div, p, title, link, btn } from './ui.js';
import { stopScene } from './scene.js';
import { daily, practice, archive, run, history, rules } from './solo.js';
import { account, boards, friends, invite } from './social.js';
import { setupNavigation } from './navigation.js';
import { about } from './about.js';

const routes = {
  daily,
  practice,
  archive,
  run,
  history,
  rules,
  account,
  boards,
  friends,
  invite,
  about,
  party: async (ctx, args) => {
    const { party } = await import('./relay.js');
    if (ctx.alive()) await party(ctx, args);
  },
};
const names = {
  daily: 'Daily Rounds',
  practice: 'Practice',
  archive: 'Archive',
  run: 'Daily Rounds',
  history: 'Specimen history',
  rules: 'How to play',
  account: 'Account',
  boards: 'Daily standings',
  friends: 'Friends',
  invite: 'Group invitation',
  party: 'Party',
  about: 'About & FAQ',
};
const main = document.querySelector('main'),
  navigation = setupNavigation();
let active = 0,
  clean = [],
  lastPage = '';
function profile() {
  navigation.profile(currentSession()?.actor);
}
function go(path) {
  if (location.hash.slice(1) === path) render();
  else location.hash = path;
}
async function render() {
  navigation.closeForRoute();
  const serial = ++active;
  for (const f of clean) f();
  clean = [];
  stopScene();
  const route = (location.hash.slice(1) || 'daily').split('/');
  let name = route.shift();
  if (!Object.hasOwn(routes, name)) name = 'daily';
  const args = route.map((v) => {
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  });
  const alive = () => serial === active;
  const paint = (...nodes) => {
    if (alive()) {
      main.removeAttribute('aria-busy');
      main.replaceChildren(...nodes.flat(Infinity).filter((n) => n != null && n !== false));
    }
  };
  const context = {
    root: main,
    alive,
    go,
    paint,
    profile,
    setMode: (mode) => navigation.setCurrent(mode),
    refresh: render,
    cleanup: (f) => clean.push(f),
  };
  document.body.dataset.route = name;
  document.title = names[name] + ' · Penicillion';
  navigation.setCurrent(name);
  if (lastPage !== location.hash) {
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }
  lastPage = location.hash;
  main.setAttribute('aria-busy', 'true');
  main.replaceChildren(el('p', { class: 'loading', role: 'status' }, 'Opening the bench…'));
  try {
    // Help stays readable when the game API or sign-in is unavailable, without
    // creating a guest session just to read about the game.
    if (name === 'about' || name === 'rules') {
      await routes[name](context, args);
      return;
    }
    if (!currentSession()) await getSession();
    if (!alive()) return;
    profile();
    await routes[name](context, args);
  } catch (error) {
    if (alive())
      paint(
        title('The Culture Room', 'Bench unavailable'),
        div(
          'paper',
          p(error.message),
          div(
            'inline-actions',
            btn('Try again', render, 'btn primary'),
            link('Daily Rounds', '#daily', 'btn'),
          ),
        ),
      );
  }
}
document.querySelector('.skip-link').addEventListener('click', (e) => {
  e.preventDefault();
  main.focus();
});
window.addEventListener('hashchange', render);
function keyboard() {
  const v = window.visualViewport;
  document.body.classList.toggle(
    'typing',
    Boolean(
      matchMedia('(max-width: 760px)').matches &&
      document.activeElement?.matches('input[type="text"],input:not([type]),textarea') &&
      (v ? v.height < 550 : true),
    ),
  );
}
window.visualViewport?.addEventListener('resize', keyboard);
document.addEventListener('focusin', keyboard);
document.addEventListener('focusout', () => requestAnimationFrame(keyboard));
setupPreferences();
render();
