import { request, commandId } from './api.js';
import {
  el,
  div,
  p,
  label,
  title,
  link,
  btn,
  details,
  feedback,
  guard,
  submitButton,
  copyText,
  say,
  rarityBadge,
} from './ui.js';
import { cue } from './preferences.js';
import { createRelayArena } from './relay-arena.js';
import { rarities, relayChargeTarget } from './rarity.js';

const relayRules = () =>
  details(
    'Slide Relay rules',
    p(
      'Two to eight players take turns naming an unused answer to one category. An accepted term passes the slide to the next surviving seat. Synonyms count once. An unaccepted term leaves the slide with you.',
    ),
    p(
      'A fresh fuse lasts 10–30 seconds. A pass carries the remaining time, with at least eight seconds for the next holder. Watch the steady, warming and urgent signals. When the fuse ends, the holder loses a life and the next player opens a fresh category.',
    ),
    p(
      'Each keeper starts with three lives. An accepted pass adds charge to your meter. At ' +
        relayChargeTarget +
        ' charge, you recover one missing life and keep the excess. At full lives you can bank up to ' +
        (relayChargeTarget - 1) +
        '. Five Specialist passes, one Classic and one Clever fill an empty meter.',
    ),
    el(
      'ul',
      { class: 'charge-key', 'aria-label': 'Charge for each accepted pass' },
      rarities
        .filter((tier) => tier.chargeGain)
        .map((tier) =>
          el('li', {}, rarityBadge(tier.points), el('b', {}, '+' + tier.chargeGain + ' charge')),
        ),
    ),
    p(
      'Using the last available answer passes a fresh category to the next player. Everyone keeps their lives.',
    ),
    p(
      'The last surviving player wins. The clock keeps running on disconnect. Reconnect within 45 seconds to keep your seat. Relay runs are unranked.',
    ),
  );
function codeFrom(value) {
  const raw = value.trim().toUpperCase();
  return raw.includes('#PARTY/') ? raw.split('#PARTY/').pop() : raw;
}
export async function party(ctx, [rawCode]) {
  if (rawCode) return roomView(ctx, codeFrom(rawCode));
  const { room } = await request('/api/rooms/current');
  if (!ctx.alive()) return;
  const preview = createRelayArena({ preview: true });
  ctx.cleanup(() => preview.destroy());
  const out = div('feedback'),
    code = el('input', {
      id: 'join-code',
      required: true,
      maxlength: 200,
      autocapitalize: 'characters',
      autocomplete: 'off',
      placeholder: '7-character code',
    });
  async function enter(path, body) {
    const { room } = await request(path, body);
    if (ctx.alive() && room) ctx.go('party/' + room.code);
  }
  const join = submitButton('Join room'),
    form = el(
      'form',
      { class: 'relay-join' },
      el('label', { class: 'label', for: 'join-code' }, 'Room code or invitation link'),
      div('answer-line', code, join),
    );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (join.disabled) return;
    join.disabled = true;
    try {
      await enter('/api/rooms/join', { code: codeFrom(code.value) });
    } catch (err) {
      feedback(out, err.message);
    } finally {
      join.disabled = false;
    }
  });
  ctx.paint(
    title('', 'Slide Relay', '2–8 players'),
    div(
      'instrument',
      preview.element,
      div(
        'dock landing relay-entry',
        div(
          'copy',
          el('h2', {}, 'Pass the slide before it pops.'),
          p(
            'Name an unused term to send the growing culture to the next keeper. Rarer answers help you earn back a life.',
          ),
          div(
            'inline-actions',
            room && link('Resume room ' + room.code, '#party/' + room.code, 'btn primary'),
            btn(
              'Create private room',
              guard(() => enter('/api/rooms', {}), out),
              'btn ' + (room ? '' : 'primary'),
            ),
            btn(
              'Quick match',
              guard(() => enter('/api/rooms/match', {}), out),
            ),
          ),
        ),
        form,
        out,
      ),
    ),
    relayRules(),
  );
}
async function roomView(ctx, code) {
  const path = '/api/rooms/' + encodeURIComponent(code);
  let room;
  try {
    ({ room } = await request(path));
  } catch (e) {
    if (e.status !== 403) throw e;
    if (!ctx.alive()) return;
    const out = div('feedback');
    ctx.paint(
      title('Slide Relay', 'Private invitation', code),
      div(
        'paper',
        el('h2', {}, 'Take a seat in this relay?'),
        p('Join as the current guest or account.'),
        btn(
          'Join room',
          guard(async () => {
            await request('/api/rooms/join', { code });
            if (ctx.alive()) ctx.refresh();
          }, out),
          'btn primary',
        ),
        out,
      ),
      relayRules(),
    );
    return;
  }
  if (!ctx.alive()) return;
  const arena = createRelayArena();
  ctx.cleanup(() => arena.destroy());
  let liveSocket = null,
    retryTimer = null,
    attempt = 0,
    connected = false,
    needsFreshSnapshot = document.hidden,
    awaiting = false,
    pending = null,
    syncing = false;
  let lastNotice = 0,
    inputEpoch = null,
    rosterKey = '',
    activityVersion = -1,
    latestUrgency = 0,
    place = null,
    connection = null,
    out = null,
    cleanup = false;
  const urgencyLevels = ['steady', 'warming', 'urgent'];
  function setConnection(value) {
    connected = value;
    if (connection) {
      connection.textContent = connected ? 'Connected' : 'Reconnecting';
      connection.dataset.connected = String(connected);
    }
  }
  function showNotice(text, error = true) {
    if (out) feedback(out, text, error);
  }
  function accept(data, animate = true) {
    if (!ctx.alive() || !data || !Object.hasOwn(data, 'room')) return;
    const next = data.room;
    if (!next) {
      ctx.go('party');
      return;
    }
    if (next.code !== code || next.version < room.version) return;
    if (next.version === room.version && next.epoch === room.epoch) {
      const rank = urgencyLevels.indexOf(next.urgency);
      if (rank < latestUrgency) next.urgency = urgencyLevels[latestUrgency];
    }
    const previous = room;
    animate = animate && !needsFreshSnapshot && !document.hidden;
    const lastEvent = next.events.at(-1);
    if (
      animate &&
      place &&
      next.version === previous.version + 1 &&
      !document.hidden &&
      lastEvent?.seq === next.version
    ) {
      if (lastEvent.kind === 'pass') cue(lastEvent.bonusLife ? 'life' : 'pass');
      if (lastEvent.kind === 'pop') cue('pop');
    }
    room = next;
    latestUrgency = urgencyLevels.indexOf(room.urgency);
    if (!place || room.status !== previous.status || room.hostId !== previous.hostId) paint();
    update();
    arena.update(room, { animate });
    if (next.version > lastNotice && next.notice) {
      lastNotice = next.version;
      say(next.notice + (lastEvent?.tier ? ' ' + lastEvent.tier : ''));
    }
    if (data.feedback) showNotice(data.feedback);
  }
  async function sync(animate = false) {
    if (syncing || !ctx.alive() || document.hidden) return;
    syncing = true;
    try {
      const current = await request(path);
      accept(current, animate);
      if (!document.hidden && current.room?.version >= room.version) needsFreshSnapshot = false;
    } catch (err) {
      if (ctx.alive()) {
        showNotice(err.message);
        if (err.status === 403) {
          disconnect();
          ctx.refresh();
        }
      }
    } finally {
      syncing = false;
    }
  }
  function connect() {
    if (!ctx.alive() || cleanup) return;
    const address = new URL(path + '/live', location.href);
    address.protocol = address.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(address.href);
    let firstSnapshot = true;
    liveSocket = socket;
    socket.addEventListener('open', () => {
      if (liveSocket !== socket) return;
      attempt = 0;
      setConnection(true);
      sync();
    });
    socket.addEventListener('message', (event) => {
      if (liveSocket !== socket || typeof event.data !== 'string') return;
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      accept(data, !firstSnapshot && !document.hidden);
      if (firstSnapshot && data?.room && !document.hidden) needsFreshSnapshot = false;
      if (data?.room) firstSnapshot = false;
    });
    socket.addEventListener('close', () => {
      if (liveSocket !== socket || cleanup) return;
      needsFreshSnapshot = true;
      setConnection(false);
      clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 10000));
    });
    socket.addEventListener('error', () => {
      socket.close();
    });
  }
  function disconnect() {
    cleanup = true;
    clearTimeout(retryTimer);
    liveSocket?.close();
  }
  async function command(action, answer) {
    if (awaiting) return;
    const fingerprint = JSON.stringify([room.epoch, action, answer]);
    if (pending?.fingerprint !== fingerprint) pending = { fingerprint, id: commandId() };
    const epoch = room.epoch;
    awaiting = true;
    update();
    try {
      const payload = await request(path + '/command', {
        action,
        epoch,
        commandId: pending.id,
        ...(answer ? { answer } : {}),
      });
      pending = null;
      accept(payload);
    } catch (err) {
      if (err.status) pending = null;
      showNotice(err.message);
      if (err.status === 409) sync();
    } finally {
      awaiting = false;
      update();
    }
  }
  function cmdBtn(name, action, cls = 'btn') {
    const button = btn(name, () => command(action), cls);
    button.dataset.cmd = action;
    return button;
  }

  function updateRoster() {
    // Preserve expanded disclosures and input focus across presence-only messages.
    const key = JSON.stringify([room.hostId, room.seats]);
    if (rosterKey === key) return;
    rosterKey = key;
    const list = place.querySelector('.seat-list');
    list.replaceChildren(
      ...room.seats.map((s) => {
        const status =
          room.status === 'lobby'
            ? s.ready
              ? 'Ready'
              : 'Waiting'
            : s.lives === 0
              ? 'Out'
              : s.lives + (s.lives === 1 ? ' life' : ' lives');
        return el(
          'li',
          { 'data-seat': s.id, class: s.active ? 'active' : '' },
          div(
            'seat-name',
            el('b', {}, s.name + (s.id === room.selfId ? ' · you' : '')),
            s.id === room.hostId && label('Host'),
          ),
          div(
            'seat-state',
            el('span', {}, status),
            el('span', {}, 'Charge ' + s.charge + '/' + room.chargeTarget),
            el('span', { class: 'seat-connection' }, s.connected ? 'Online' : 'Reconnecting'),
          ),
        );
      }),
    );
  }

  function updateActivity() {
    if (activityVersion === room.version) return;
    activityVersion = room.version;
    const notice = place.querySelector('.room-notice');
    const event = room.events.at(-1);
    notice.replaceChildren(room.notice || '');
    if (event?.points) notice.append(rarityBadge(event.points));
    if (event?.bonusLife) notice.append(el('b', { class: 'life-gain' }, '+1 life'));
    const history = place.querySelector('.relay-events');
    history.replaceChildren(
      ...room.events.map((e) => el('li', {}, e.text, e.points && rarityBadge(e.points))),
    );
  }

  function update() {
    if (!ctx.alive() || !place) return;
    const self = room.seats.find((s) => s.id === room.selfId);
    const active = room.seats.find((s) => s.id === room.activeId);
    const mine = room.status === 'playing' && room.activeId === room.selfId;
    for (const button of place.querySelectorAll('[data-cmd]')) {
      const type = button.dataset.cmd;
      button.disabled =
        awaiting ||
        (type === 'start' && (room.seats.length < 2 || !room.seats.every((s) => s.ready))) ||
        (type === 'answer' && !mine);
      if (type === 'ready') button.textContent = self?.ready ? 'Unready' : 'Ready';
    }
    if (room.status === 'lobby') {
      const n = room.seats.filter((s) => s.ready).length;
      place.querySelector('.table-status').textContent = n + ' of ' + room.seats.length + ' ready';
    }
    if (room.status === 'playing') {
      const question = place.querySelector('#relay-prompt');
      if (question.textContent !== room.prompt?.text) {
        question.replaceChildren(el('span', {}, room.prompt?.text || 'Opening a category'));
        place.querySelector('#relay-scope').textContent = room.prompt?.scope || '';
      }
      const turn = place.querySelector('.turn-label');
      turn.textContent = mine ? 'Your turn' : (active?.name || 'Next keeper') + ' holds the slide';
      turn.dataset.mine = String(mine);
      const signal = place.querySelector('.signal');
      signal.dataset.level = room.urgency;
      signal.textContent =
        { steady: 'Steady', warming: 'Warming', urgent: 'Urgent' }[room.urgency] || 'Steady';
      const input = place.querySelector('#relay-answer');
      input.disabled = !mine;
      input.readOnly = awaiting;
      input.placeholder = mine
        ? 'An unused term'
        : self?.lives
          ? 'Waiting for your turn'
          : 'Watching the relay';
      if (inputEpoch !== room.epoch) {
        inputEpoch = room.epoch;
        input.value = '';
        feedback(out, '', false);
        if (mine && matchMedia('(pointer:fine)').matches && !document.querySelector('dialog[open]'))
          input.focus({ preventScroll: true });
      }
    }
    updateRoster();
    updateActivity();
    setConnection(connected);
  }

  function lobbyDock() {
    const copyLink = btn('Copy room link', () =>
      copyText(location.origin + '/#party/' + room.code, out),
    );
    return div(
      'relay-dock lobby',
      div(
        'copy',
        el('h3', { class: 'table-status' }, 'Ready your keeper'),
        p(
          room.quick
            ? 'Play starts when everyone is ready.'
            : 'Share the room link. When everyone is ready, the host can start.',
        ),
      ),
      div(
        'inline-actions',
        cmdBtn('Ready', 'ready', 'btn primary'),
        !room.quick && room.selfId === room.hostId && cmdBtn('Start relay', 'start'),
        !room.quick && copyLink,
      ),
    );
  }

  function playDock() {
    const input = el('input', {
      id: 'relay-answer',
      type: 'text',
      maxlength: 96,
      required: true,
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      enterkeyhint: 'go',
      'aria-describedby': 'relay-prompt relay-scope',
    });
    const pass = submitButton('Pass slide');
    pass.dataset.cmd = 'answer';
    const form = el(
      'form',
      {},
      div(
        'form-top',
        el('label', { for: 'relay-answer', class: 'label' }, 'Your answer'),
        el('span', { class: 'turn-label' }),
      ),
      div('answer-line', input, pass),
      out,
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (input.value.trim() && !pass.disabled) command('answer', input.value.trim());
    });
    const scope = el(
      'details',
      { class: 'relay-scope' },
      el('summary', {}, 'What counts'),
      el('p', { id: 'relay-scope' }),
    );
    scope.open = matchMedia('(min-width: 701px) and (min-height: 576px)').matches;
    return div('relay-dock playing', scope, form);
  }

  function resultDock() {
    const winner = room.seats.find((s) => s.id === room.winnerId);
    const result =
      room.status === 'expired'
        ? 'Room expired'
        : winner?.id === room.selfId
          ? 'You win the relay.'
          : (winner?.name || 'The last survivor') + ' wins the relay.';
    return div(
      'relay-dock finish',
      div('copy', label('Relay result'), el('h2', {}, result)),
      room.status === 'finished' && cmdBtn('Open rematch', 'rematch', 'btn primary'),
    );
  }

  function paint() {
    out = div('feedback');
    connection = el('span', { class: 'connection' });
    const lobby = room.status === 'lobby';
    const playing = room.status === 'playing';
    const glass = playing
      ? div(
          'relay-category slide-glass',
          el('h2', { id: 'relay-prompt' }),
          el('span', { class: 'signal' }),
        )
      : div(
          'relay-category',
          el(
            'h2',
            {},
            lobby ? (room.quick ? 'Quick match lobby' : 'Private room lobby') : 'Final slide',
          ),
        );
    const heading = title('', 'Slide Relay');
    heading.append(div('room-info', label('Room ' + room.code), connection));
    const dock = lobby ? lobbyDock() : playing ? playDock() : resultDock();
    place = div(
      'relay-room',
      div('relay-bench', glass, arena.element, dock, !playing && out),
      p('', 'room-notice'),
      details('Players in turn order', el('ol', { class: 'seat-list' })),
      details('Relay events', el('ol', { class: 'relay-events' })),
      relayRules(),
      details(
        'Leave this room',
        p('Leaving forfeits an active seat.'),
        cmdBtn('Leave room', 'leave'),
      ),
    );
    place.dataset.phase = room.status;
    activityVersion = -1;
    rosterKey = '';
    inputEpoch = null;
    ctx.paint(heading, place);
  }
  accept({ room }, false);
  connect();
  const poll = setInterval(() => sync(connected), 3500);
  const visible = () => {
    needsFreshSnapshot = true;
    if (!document.hidden) sync();
  };
  document.addEventListener('visibilitychange', visible);
  ctx.cleanup(() => {
    clearInterval(poll);
    disconnect();
    document.removeEventListener('visibilitychange', visible);
  });
}
