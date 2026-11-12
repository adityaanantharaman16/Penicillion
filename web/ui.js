import { rarityFor } from './rarity.js';

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'on')
      for (const [name, fn] of Object.entries(value)) node.addEventListener(name, fn);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'checked' || key === 'disabled' || key === 'selected' || key === 'required')
      node[key] = !!value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity))
    if (child != null && child !== false) node.append(child);
  return node;
}
export const div = (cls, ...nodes) => el('div', { class: cls }, nodes);
export const p = (s, cls) => el('p', { class: cls }, s);
export const tag = (s) => el('span', { class: 'tag' }, s);
export const btn = (text, fn, cls = 'btn') =>
  el('button', { type: 'button', class: cls, on: { click: fn } }, text);
export const link = (text, href, cls = 'text-link') => el('a', { href, class: cls }, text);
export const label = (text) => el('span', { class: 'label' }, text);
export const dateText = (day, opts = { month: 'long', day: 'numeric', year: 'numeric' }) =>
  day
    ? new Intl.DateTimeFormat(undefined, { ...opts, timeZone: 'UTC' }).format(
        new Date(day + 'T12:00:00Z'),
      )
    : '';
export function asTime(value) {
  if (value == null) return NaN;
  if (typeof value === 'number') return value < 1e11 ? value * 1000 : value;
  return new Date(value).getTime();
}
export function localTime(value) {
  const ms = asTime(value);
  if (!Number.isFinite(ms)) return 'the next reset';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(ms));
}
export function external(text, url) {
  try {
    const target = new URL(url);
    if (!['https:', 'http:'].includes(target.protocol)) return document.createTextNode(text || '');
    return el(
      'a',
      { href: target.href, target: '_blank', rel: 'noopener noreferrer' },
      text || 'Source',
    );
  } catch {
    return document.createTextNode(text || '');
  }
}
export function details(summary, ...nodes) {
  return el(
    'details',
    { class: 'disclosure' },
    el('summary', {}, summary),
    div('detail-body', nodes),
  );
}
export function say(message) {
  document.querySelector('#announce').textContent = message;
}
export function title(eyebrow, title, aside = '') {
  return div(
    'page-heading',
    div('heading-copy', eyebrow && label(eyebrow), el('h1', {}, title)),
    aside && div('aside-label', aside),
  );
}
export function note(text, kind = 'note') {
  return div(kind, text);
}
export function field(caption, input) {
  return el('label', { class: 'field' }, el('span', {}, caption), input);
}
export function submitButton(text, cls = 'btn primary') {
  return el('button', { type: 'submit', class: cls }, text);
}
export function feedback(host, text, error = true) {
  host.textContent = text || '';
  host.className = error ? 'feedback error' : 'feedback';
  host.setAttribute('role', error ? 'alert' : 'status');
}
export async function copyText(text, host) {
  try {
    await navigator.clipboard.writeText(text);
    feedback(host, 'Copied.', false);
  } catch {
    const input = el(
      'textarea',
      { 'aria-label': 'Select and copy', readonly: true, rows: 3 },
      text,
    );
    host.replaceChildren(p('Select and copy the text below.'), input);
    input.focus();
    input.select();
  }
}
export function guard(fn, out) {
  return async (event) => {
    const button = event.currentTarget;
    if (button.disabled) return;
    button.disabled = true;
    try {
      await fn(event);
    } catch (error) {
      feedback(out, error.message);
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  };
}

export function tierMark(points) {
  const tier = rarityFor(points);
  return el('span', { class: 'tier-mark', 'aria-hidden': 'true' }, tier.symbol);
}
export function rarityBadge(points) {
  const tier = rarityFor(points);
  return el('span', { class: 'rarity-badge', 'data-rarity': tier.id }, tierMark(points), tier.label.toUpperCase());
}
export function table(headers, rows, caption) {
  return div(
    'table-wrap',
    el(
      'table',
      {},
      el('caption', { class: 'sr' }, caption),
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          headers.map((s) => el('th', { scope: 'col' }, s)),
        ),
      ),
      el(
        'tbody',
        {},
        rows.map((row) =>
          el(
            'tr',
            {},
            row.map((cell) => el('td', {}, cell ?? '')),
          ),
        ),
      ),
    ),
  );
}
