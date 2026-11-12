import { el, div, btn, link } from './ui.js';

const groups = [
  ['Play', [
    ['daily', 'Daily Rounds', 'Seven prompts. One daily culture.', 'dish'],
    ['practice', 'Practice', 'Fresh prompts, at your pace.', 'spark'],
    ['party', 'Party', 'Pass a slide with other keepers.', 'relay'],
    ['archive', 'Archive', 'Revisit past issues.', 'archive'],
  ]],
  ['Your bench', [
    ['history', 'Specimen history', 'Your saved cultures.', 'history'],
    ['boards', 'Daily standings', 'See today’s listed scores.', 'boards'],
    ['friends', 'Friends', 'Your private groups.', 'friends'],
    ['account', 'Account', 'Sign in and manage your profile.', 'keeper'],
  ]],
  ['Help', [
    ['rules', 'How to play', 'Learn the Daily Rounds rules.', 'book'],
    ['about', 'About & FAQ', 'The game, scoring and sources.', 'question'],
  ]],
];

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', name === 'spark' ? '0 0 9 9' : '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', '/marks.svg#' + name);
  svg.append(use);
  return svg;
}

export function setupNavigation() {
  const trigger = document.querySelector('#menu-button');
  const dialog = document.querySelector('#menu-dialog');
  const settings = document.querySelector('#settings-dialog');
  const nav = el('nav', { class: 'menu-nav', 'aria-label': 'Explore Penicillion' });
  const account = el('span', { class: 'menu-account' }, 'Your bench · Account options');
  const close = () => {
    if (dialog.open) dialog.close();
    trigger.setAttribute('aria-expanded', 'false');
  };
  for (const [heading, items] of groups) {
    const id = 'menu-' + heading.toLowerCase().replaceAll(' ', '-');
    nav.append(el('section', { class: 'menu-group', 'aria-labelledby': id },
      el('h3', { id }, heading),
      div('menu-grid', items.map(([route, label, description, mark]) => {
        const item = link('', '#' + route, 'menu-tile');
        item.dataset.name = route;
        item.setAttribute('aria-labelledby', 'menu-' + route + '-label');
        item.setAttribute('aria-describedby', 'menu-' + route + '-description');
        item.append(icon(mark), div('menu-tile-copy', el('span', { class: 'menu-tile-label', id: 'menu-' + route + '-label' }, label),
          el('small', { id: 'menu-' + route + '-description' }, description)));
        // The current page has no hashchange event. Closing it must leave the
        // live screen, its input and its connections untouched.
        item.addEventListener('click', close);
        return item;
      })),
    ));
  }
  const sound = btn('Sound off', () => {}, 'menu-control');
  sound.id = 'sound';
  sound.setAttribute('aria-label', 'Toggle sound');
  const gear = btn('Settings', () => {}, 'menu-control');
  gear.id = 'settings';
  dialog.append(
    div('menu-heading', div('', el('span', { class: 'label' }, 'Penicillion'),
      el('h2', { id: 'menu-title' }, 'Menu'),
      el('p', { id: 'menu-timing', class: 'menu-timing' }, 'Timed rounds keep running.')),
      el('button', { type: 'button', class: 'menu-close', autofocus: true,
        'aria-label': 'Close menu', on: { click: close } }, '×')),
    nav,
    div('menu-preferences', account, div('menu-controls', sound, gear)),
  );
  trigger.addEventListener('click', () => {
    dialog.showModal();
    dialog.scrollTop = 0;
    trigger.setAttribute('aria-expanded', 'true');
  });
  dialog.addEventListener('close', () => trigger.setAttribute('aria-expanded', 'false'));
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button:not([disabled]), a[href]')]
      .filter((node) => node.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  // A backdrop dismissal requires both ends of the gesture outside the panel,
  // so dragging a touch/scroll from inside cannot accidentally close it.
  let outside = false;
  const isOutside = (event) => {
    const box = dialog.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right ||
      event.clientY < box.top || event.clientY > box.bottom;
  };
  dialog.addEventListener('pointerdown', (event) => { outside = isOutside(event); });
  dialog.addEventListener('click', (event) => {
    if (outside && isOutside(event)) close();
    outside = false;
  });
  return {
    closeForRoute() {
      if (settings.open) settings.close();
      close();
    },
    setCurrent(name) {
      const route = name === 'invite' ? 'friends' : name;
      nav.querySelectorAll('[data-name]').forEach((item) => {
        if (item.dataset.name === route) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
      });
    },
    profile(actor) {
      account.textContent = actor?.kind === 'account' ? 'Your bench · ' + (actor.handle || 'Account') : 'Playing as a guest';
    },
  };
}
