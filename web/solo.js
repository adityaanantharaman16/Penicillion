import { rarities, rarityFor } from './rarity.js';
import { request, commandId, currentSession } from './api.js';
import {
  el,
  div,
  p,
  btn,
  link,
  title,
  label,
  details,
  note,
  say,
  field,
  submitButton,
  feedback,
  copyText,
  asTime,
  dateText,
  localTime,
  table,
  rarityBadge,
  tierMark,
  external,
} from './ui.js';
import { scene, pips } from './scene.js';
import { cue } from './preferences.js';
import { collection, rememberUnlocks } from './collection.js';

function modeName(mode) {
  return (
    { daily: 'Daily Rounds', practice: 'Practice', archive: 'Archive' }[mode] || 'Daily Rounds'
  );
}
function issueNo(issue) {
  return issue?.number != null ? 'Issue ' + String(issue.number).padStart(3, '0') : '';
}
function termsRule() {
  return details(
    'How to play',
    p(
      'Name one answer inside the stated scope. You have 25 seconds when each prompt opens. An accepted answer locks that round. A miss can be retried while time remains.',
    ),
    p(
      'The scope decides which answers count. Editors assign rarity by how readily a mixed medical audience might recall each term here. Observed frequency counts actual choices by eligible finishers for this version of the prompt. Each issue keeps its published points, with no speed bonus.',
    ),
    div(
      'tier-ladder',
      rarities.slice(1).map((tier) =>
        div(
          'tier-line',
          rarityBadge(tier.points),
          el('b', {}, '+' + tier.points),
          el('small', { class: 'tier-flavour' }, tier.hint),
        ),
      ),
    ),
    p(
      'There are seven prompts and 700 possible points. Read each reveal for as long as you like. Next opens the following prompt.',
    ),
    p(
      'Each identity gets one ranked attempt per Eastern game date. A run started before midnight can finish up to 10 minutes after reset. Guest history stays with this browser until you import it into an account.',
    ),
  );
}
function beginButton(ctx, settings, text) {
  const error = div('feedback');
  let key = commandId();
  const button = btn(
    text,
    async () => {
      if (button.disabled) return;
      button.disabled = true;
      feedback(error, 'Opening the first prompt…', false);
      try {
        const snap = await request('/api/runs', { ...settings, commandId: key });
        if (!ctx.alive()) return;
        ctx.go('run/' + encodeURIComponent(snap.id));
      } catch (e) {
        if (e.status) key = commandId();
        feedback(error, e.message);
        button.disabled = false;
      }
    },
    'btn primary play-button',
  );
  return div('action-stack', button, error);
}

export async function daily(ctx) {
  const info = await request('/api/daily');
  if (!ctx.alive()) return;
  const issue = info.issue,
    completed = info.phase === 'recap';
  const action = info.runId
    ? link(
        completed
          ? 'Open specimen log'
          : info.phase === 'expired'
            ? 'View expired run'
            : 'Resume Daily Rounds',
        '#run/' + encodeURIComponent(info.runId),
        'btn primary play-button',
      )
    : beginButton(ctx, { mode: 'daily' }, 'Play Daily Rounds');
  ctx.paint(
    title('', 'Daily Rounds', issueNo(issue)),
    div(
      'instrument',
      scene({ phase: 'landing' }),
      div(
        'dock landing',
        div(
          'copy',
          label(dateText(issue.date, { weekday: 'long', month: 'short', day: 'numeric' })),
          el('h2', {}, 'Rarer correct answers earn more.'),
          p('Seven medical prompts. Twenty-five seconds each. What comes to mind?'),
        ),
        div(
          'action-stack',
          action,
          el(
            'small',
            {},
            info.runId ? 'Your run is saved.' : 'One ranked guest or account attempt.',
          ),
        ),
      ),
    ),
    div(
      'bench-foot',
      el('span', {}, 'Next daily: ' + localTime(issue.resetAt)),
      link('Your specimen history', '#history'),
    ),
    info.carryOver &&
      div(
        'paper',
        el('h3', {}, 'Yesterday’s issue is still open.'),
        p('Finish by ' + localTime(info.carryOver.graceUntil) + '.'),
        link('Resume yesterday’s run', '#run/' + encodeURIComponent(info.carryOver.id), 'btn'),
      ),
    termsRule(),
  );
}
export async function practice(ctx) {
  const check = el('input', { type: 'checkbox', id: 'untimed' });
  const settings = { mode: 'practice', untimed: false };
  check.addEventListener('change', () => (settings.untimed = check.checked));
  ctx.paint(
    title('', 'Practice', 'Unranked'),
    div(
      'instrument',
      scene({ phase: 'landing' }),
      div(
        'dock landing',
        div(
          'copy',
          label('Practice rounds'),
          el('h2', {}, 'Try seven fresh prompts.'),
          p(
            'Practice uses prompts outside the reserved daily schedule. Replay as often as you like. Your daily streak and boards stay separate.',
          ),
          field('Untimed practice', check),
        ),
        beginButton(ctx, settings, 'Start practice'),
      ),
    ),
    termsRule(),
  );
}
export async function archive(ctx, [date, cursor]) {
  if (date && date !== 'before') {
    const data = await request('/api/archive/' + encodeURIComponent(date) + '/explorer');
    if (!ctx.alive()) return;
    ctx.paint(
      title('Past issue', 'Answer explorer', dateText(date)),
      link('Back to archive', '#archive'),
      ...data.prompts.map((item, i) =>
        el(
          'article',
          { class: 'paper list-item' },
          label('Prompt ' + (i + 1)),
          el('h2', {}, item.prompt),
          p(item.scope),
          item.withheld
            ? p('Finish today’s issue to see the accepted answers for this prompt.')
            : details(
                'Explore accepted answers',
                ...item.answers.map((a) =>
                  div(
                    'answer-entry',
                    div(
                      '',
                      el('b', {}, a.term || a.name),
                      rarityBadge(a.points),
                      el('span', {}, '+' + a.points),
                    ),
                    a.fact && p(a.fact),
                    a.reason && p(a.reason),
                    a.source && external(a.source.label, a.source.url),
                  ),
                ),
              ),
        ),
      ),
    );
    return;
  }
  const data = await request(
    '/api/archive' + (cursor ? '?before=' + encodeURIComponent(cursor) : ''),
  );
  if (!ctx.alive()) return;
  ctx.paint(
    title('Past rounds', 'Archive', 'Unranked'),
    p(
      'Replay a past issue or look through its annotated answer bank. Archive runs leave the daily boards and your streak unchanged.',
      'lede',
    ),
    div(
      'paper archive-list',
      data.issues.length
        ? data.issues.map((issue) =>
            div(
              'archive-row',
              div('', label(issueNo(issue)), el('h2', {}, dateText(issue.date))),
              div(
                'inline-actions',
                beginButton(ctx, { mode: 'archive', date: issue.date }, 'Play issue'),
                link('Answer explorer', '#archive/' + encodeURIComponent(issue.date)),
              ),
            ),
          )
        : p('The first issue will appear here after tonight’s reset.'),
    ),
    data.nextBefore &&
      link('Earlier issues', '#archive/before/' + encodeURIComponent(data.nextBefore), 'btn'),
  );
}
function sourceBlock(result) {
  return details(
    'More Info',
    p(result.reason || 'This score reflects the editorial tier for this prompt.'),
    result.source && external(result.source.label || 'Source', result.source.url),
  );
}
export async function run(ctx, [id]) {
  if (!id) {
    ctx.go('daily');
    return;
  }
  let snap = await request('/api/runs/' + encodeURIComponent(id));
  if (!ctx.alive()) return;
  let busy = false,
    opened = performance.now(),
    serverAt = asTime(snap.serverNow),
    ticker = null,
    pending = null,
    reconcileBusy = false,
    nextRecheck = 0,
    rev = 0;
  const path = '/api/runs/' + encodeURIComponent(id);
  const channel =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('penicillion-runs') : null;
  ctx.cleanup(() => {
    clearInterval(ticker);
    channel?.close();
    document.removeEventListener('visibilitychange', visible);
  });
  function enter(e) {
    if (
      e.key === 'Enter' &&
      !e.repeat &&
      !e.isComposing &&
      !busy &&
      snap.phase === 'reveal' &&
      (e.target === document.body || e.target === ctx.root)
    ) {
      e.preventDefault();
      transact('next');
    }
  }
  document.addEventListener('keydown', enter);
  ctx.cleanup(() => document.removeEventListener('keydown', enter));
  function visible() {
    if (!document.hidden) sync();
  }
  document.addEventListener('visibilitychange', visible);
  if (channel)
    channel.onmessage = (e) => {
      if (e.data === id && !busy) sync();
    };
  function status(message, isError = true) {
    const out = document.querySelector('#run-feedback');
    if (out) feedback(out, message, isError);
  }
  async function sync() {
    if (busy || !ctx.alive() || reconcileBusy || document.hidden) return;
    reconcileBusy = true;
    const version = rev;
    try {
      const fresh = await request(path);
      if (version === rev && !busy && ctx.alive()) accept(fresh, false);
    } catch (e) {
      if (ctx.alive()) status(e.message);
    } finally {
      reconcileBusy = false;
    }
  }
  async function transact(action, answer = '') {
    if (busy) return;
    busy = true;
    rev++;
    const fingerprint = [action, snap.roundId, answer].join('|');
    if (pending?.fingerprint !== fingerprint) pending = { fingerprint, id: commandId() };
    const original = pending;
    const dock = document.querySelector('#run-dock');
    if (dock) {
      dock.setAttribute('aria-busy', 'true');
      dock.querySelectorAll('button').forEach((b) => (b.disabled = true));
      const input = dock.querySelector('input');
      if (input) input.readOnly = true;
    }
    try {
      const payload = { roundId: snap.roundId, commandId: original.id };
      if (action === 'answer') payload.answer = answer;
      const fresh = await request(path + '/' + action, payload);
      pending = null;
      if (!ctx.alive()) return;
      accept(fresh, true, answer);
      channel?.postMessage(id);
    } catch (e) {
      if (e.status) pending = null;
      if (!ctx.alive()) return;
      if (e.status === 409) {
        try {
          const fresh = await request(path);
          if (ctx.alive()) accept(fresh, false);
        } catch {}
      }
      status(e.message);
    } finally {
      busy = false;
      if (dock?.isConnected) {
        dock.setAttribute('aria-busy', 'false');
        dock.querySelectorAll('button').forEach((b) => (b.disabled = false));
        const input = dock.querySelector('input');
        if (input) input.readOnly = false;
      }
    }
  }
  function accept(fresh, own, submitted = '') {
    const changed =
      fresh.phase !== snap.phase || fresh.roundId !== snap.roundId || fresh.take !== snap.take;
    snap = fresh;
    serverAt = asTime(snap.serverNow);
    opened = performance.now();
    if (changed) {
      paint(own, submitted);
      return;
    }
    if (own && snap.phase === 'prompt') {
      const out = document.querySelector('#run-feedback'),
        input = document.querySelector('#answer'),
        suggest = document.querySelector('#suggestion');
      if (!out) return;
      feedback(out, snap.feedback || 'Please check the scope and try another term.');
      suggest.replaceChildren();
      if (snap.suggestion) {
        const text = typeof snap.suggestion === 'string' ? snap.suggestion : snap.suggestion.term;
        if (text)
          suggest.append(
            btn('Confirm “' + text + '”', () => transact('answer', text), 'btn compact'),
          );
      }
      if (input) {
        input.readOnly = false;
        input.focus({ preventScroll: true });
        input.select();
      }
    }
  }
  function tick() {
    if (!ctx.alive() || snap.phase !== 'prompt' || document.hidden) return;
    const clock = document.querySelector('#round-clock'),
      bar = document.querySelector('#round-timer');
    if (!clock || snap.deadline == null) return;
    const left = Math.max(
      0,
      (asTime(snap.deadline) - (serverAt + performance.now() - opened)) / 1000,
    );
    clock.textContent = Math.ceil(left) + ' s';
    clock.classList.toggle('low', left <= 5);
    bar.value = left;
    if (!left && performance.now() > nextRecheck) {
      nextRecheck = performance.now() + 900;
      sync();
    }
  }
  function paint(own = false, submitted = '') {
    if (!ctx.alive()) return;
    const last = snap.results.at(-1),
      marks = snap.results.map((r) => r.points),
      take = snap.take || snap.results.length,
      mode = modeName(snap.mode);
    const out = el('p', { class: 'feedback', id: 'run-feedback', role: 'status' });
    const docTitle = mode + ' · Penicillion';
    document.title = docTitle;
    if (snap.phase === 'recap') {
      if (own) cue('recap');
      recap(ctx, snap);
      return;
    }
    if (snap.phase === 'expired') {
      ctx.paint(
        title('Daily Rounds', 'Run expired'),
        div(
          'paper',
          el('h2', {}, 'The grace period ended.'),
          p('This unfinished run is saved without ranked credit.'),
          link('Open current daily', '#daily', 'btn primary'),
        ),
      );
      return;
    }
    const animatedRound = snap.mode === 'daily' || snap.mode === 'practice';
    const dock = div('dock');
    dock.id = 'run-dock';
    let plaque = null;
    if (snap.phase === 'prompt') {
      const promptId = 'visible-prompt';
      plaque = div('plaque', pips(marks, take - 1), el('h2', { id: promptId }, snap.prompt));
      const input = el('input', {
        id: 'answer',
        type: 'text',
        maxlength: 96,
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        enterkeyhint: 'go',
        placeholder: 'Type one answer',
        'aria-labelledby': 'your-answer ' + promptId,
        'aria-describedby': 'scope run-feedback',
      });
      const timer = el(
        'span',
        { id: 'round-clock', role: 'timer', 'aria-live': 'off' },
        snap.deadline == null ? 'Untimed' : '25 s',
      );
      const form = el(
        'form',
        {},
        div(
          'form-top',
          el('label', { id: 'your-answer', for: 'answer', class: 'label' }, 'Your answer'),
          timer,
        ),
        div('answer-line', input, submitButton('Submit')),
        snap.deadline != null &&
          el('progress', { id: 'round-timer', max: 25, value: 25, 'aria-label': 'Time remaining' }),
        div(
          'input-status',
          out,
          btn('Skip', () => transact('skip'), 'quiet'),
        ),
        div('suggestion'),
      );
      form.lastElementChild.id = 'suggestion';
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const answer = input.value.trim();
        if (answer) transact('answer', answer);
        else {
          status('Type an answer first.');
          input.focus();
        }
      });
      dock.classList.add('prompt-dock');
      if (animatedRound) dock.classList.add('solo-controls');
      dock.append(
        div(
          'copy',
          label(mode + ' / ' + take + ' of 7'),
          el('h3', {}, 'What counts'),
          el('p', { id: 'scope' }, snap.scope),
        ),
        form,
      );
      if (own) say('Round ' + take + '. ' + snap.prompt);
      if (matchMedia('(pointer:fine)').matches)
        requestAnimationFrame(() => input.focus({ preventScroll: true }));
    } else if (snap.phase === 'reveal' && last) {
      const good = last.status === 'accepted';
      const name = good ? last.term : last.status === 'timeout' ? 'Time ran out' : 'Round skipped';
      const next = btn(
        take >= 7 ? 'View specimen log' : 'Next round',
        () => transact('next'),
        'btn primary next-round',
      );
      const award = div(
        'award',
        label('Round ' + take),
        div('award-value', el('strong', {}, '+' + last.points), ' points'),
      );
      const body = div(
        'finding',
        div('tier-title', rarityBadge(last.points)),
        el('h2', {}, name),
        p(good ? last.fact : 'Your earlier growth is safe. You can advance when you are ready.'),
        good && sourceBlock(last),
      );
      dock.classList.add('reveal-dock');
      if (animatedRound && good) {
        const tier = rarityFor(last.points);
        plaque = el('div', {
          class: 'floating-result', 'data-rarity': tier.id, 'aria-hidden': 'true',
          'data-live': own ? 'yes' : 'no',
        }, el('span', { class: 'result-term' }, submitted || name),
           el('strong', { class: 'result-tier' }, tier.label.toUpperCase()));
        const identifyAt = (last.points >= 60 ? 1950 : 1250) + 'ms';
        plaque.style.setProperty('--identify-at', identifyAt);
        if (own) {
          dock.classList.add('identifying');
          dock.style.setProperty('--identify-at', identifyAt);
        }
      }
      if (own && last.points >= 60 && !animatedRound) dock.classList.add('fresh-discovery');
      dock.append(
        award,
        body,
        div('action-stack', next, el('small', {}, 'Read at your pace.'), out),
      );
      if (own) {
        cue('accept', last.points);
        say(name + '. ' + rarityFor(last.points).label.toUpperCase() + ' · ' + last.points + ' points.');
        requestAnimationFrame(() => next.focus({ preventScroll: true }));
      }
    }
    const illustration = scene(
      { phase: snap.phase, total: snap.total, points: last?.points || 0, marks, settled: !own, slowGrowth: animatedRound },
      plaque,
    );
    ctx.paint(
      title(
        '',
        mode,
        snap.mode === 'daily' ? [issueNo(snap.issue), dateText(snap.date)].filter(Boolean).join(' · ') : 'Unranked',
      ),
      div('instrument', illustration, dock),
      div(
        'bench-foot',
        el(
          'span',
          {},
          snap.ranked ? 'Ranked daily · saved automatically' : 'Unranked · saved automatically',
        ),
        link('How to play', '#rules'),
      ),
    );
    tick();
  }
  paint(false);
  ticker = setInterval(tick, 200);
}

export function distribution(data) {
  if (!data) return p('Comparable results are still being collected.');
  const n = Number(data.sampleSize ?? data.n ?? data.count ?? 0);
  const updated = data.updatedAt ? ' · Updated ' + localTime(data.updatedAt) : '';
  if (n < 20)
    return div(
      'distribution',
      el('h3', {}, 'Collecting results'),
      p(
        n +
          ' eligible ' +
          (n === 1 ? 'finisher' : 'finishers') +
          updated +
          '. A distribution appears at 20.',
      ),
    );
  const bins = data.bins || data.histogram || [];
  const max = Math.max(1, ...bins.map((b) => Number(typeof b === 'number' ? b : b.count)));
  const you = data.you?.total ?? data.you ?? data.total;
  const plot = div(
    'histogram',
    bins.map((b, i) => {
      const count = typeof b === 'number' ? b : b.count;
      const low = b.min ?? b.low ?? i * 100,
        high = b.max ?? b.high ?? low + 99,
        yes = typeof you === 'number' && you >= low && you <= high;
      const meter = el('meter', {
        min: 0,
        max,
        value: count,
        'aria-label': low + ' to ' + high + ' points: ' + count + ' finishers',
      });
      return div(
        'bin' + (yes ? ' you' : ''),
        el('span', {}, low + '–' + high),
        meter,
        el('b', {}, count + (yes ? ' · you' : '')),
      );
    }),
  );
  return div(
    'distribution',
    el('h3', {}, 'Today’s scores'),
    p(
      (data.percentile != null ? 'Higher than ' + data.percentile + '% of finishers. ' : '') +
        n +
        ' finishers' +
        updated +
        '.',
    ),
    plot,
  );
}

function recap(ctx, snap) {
  const marks = snap.results.map((r) => r.points),
    last = snap.results.at(-1),
    best =
      snap.bestFind ||
      snap.results.reduce((best, r) => (r.points > (best?.points || 0) ? r : best), null);
  const rows = snap.results.map((r, i) => {
    const alt = r.alternative,
      expand = [];
    if (r.fact) expand.push(p(r.fact));
    if (r.reason) expand.push(p(r.reason));
    if (r.source) expand.push(external(r.source.label, r.source.url));
    if (alt)
      expand.push(
        el('p', {}, 'Another accepted answer: ', alt.term || alt.name, ' ',
          rarityBadge(alt.points), ' · ' + alt.points + ' points'),
        alt.fact && p(alt.fact),
        alt.source && external(alt.source.label, alt.source.url),
      );
    return el(
      'li',
      {},
      div(
        'log-row',
        el('span', { class: 'row-number' }, String(i + 1).padStart(2, '0')),
        div(
          '',
          label(r.prompt || 'Prompt ' + (i + 1)),
          el('h3', {}, r.term || (r.status === 'timeout' ? 'Time expired' : 'Skipped')),
        ),
        el('div', { class: 'log-points', 'data-rarity': rarityFor(r.points).id }, tierMark(r.points), el('b', {}, '+' + r.points)),
      ),
      details(el('span', {}, rarityBadge(r.points), ' · More Info'), ...expand),
    );
  });
  const issue = issueNo(snap.issue) || modeName(snap.mode),
    plain =
      'Penicillion · ' +
      issue +
      '\n' +
      snap.total +
      ' / 700\n' +
      marks.map((n) => rarityFor(n).symbol).join(' ') +
      '\nTiers: ' +
      snap.results.map((r) => rarityFor(r.points).label.toUpperCase()).join(', ') +
      '\n' +
      location.origin +
      '/';
  const shareOut = div('feedback'),
    share = btn('Share result', async () => {
      try {
        if (!navigator.share) return await copyText(plain, shareOut);
        await navigator.share({ title: 'Penicillion · ' + issue, text: plain });
      } catch (e) {
        if (e.name !== 'AbortError') await copyText(plain, shareOut);
      }
    });
  const reportText = el('textarea', {
    maxlength: 280,
    rows: 3,
    required: true,
    placeholder: 'A term that belongs in this prompt…',
  });
  const select = el(
    'select',
    {},
    snap.results.map((r, i) =>
      el('option', { value: i + 1 }, i + 1 + '. ' + (r.prompt || 'Prompt')),
    ),
  );
  const reportOut = div('feedback');
  let reportKey = null;
  const report = el(
    'form',
    {},
    field('Which prompt?', select),
    field('Missing answer', reportText),
    p('Reports are private. Editors consider corrections for a future release.', 'small'),
    submitButton('Send report'),
    reportOut,
  );
  report.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = report.querySelector('button');
    button.disabled = true;
    try {
      const body = { slot: Number(select.value), text: reportText.value },
        payload = JSON.stringify(body);
      if (reportKey?.payload !== payload) reportKey = { payload, id: commandId() };
      await request('/api/runs/' + encodeURIComponent(snap.id) + '/report', {
        ...body,
        commandId: reportKey.id,
      });
      reportKey = null;
      feedback(reportOut, 'Received for editorial review.', false);
      reportText.value = '';
    } catch (err) {
      if (err.status) reportKey = null;
      feedback(reportOut, err.message);
    } finally {
      button.disabled = false;
    }
  });
  const stats = snap.stats || {};
  rememberUnlocks(stats.unlocks || []);
  ctx.paint(
    title(modeName(snap.mode), 'Specimen log', issue),
    div(
      'instrument',
      scene({ phase: 'recap', total: snap.total, marks, points: last?.points || 0 }),
      div(
        'dock recap-intro',
        div('', label('Total growth'), el('h2', {}, snap.total + ' / 700'), pips(marks)),
        div(
          '',
          label('Best find'),
          el('h3', {}, best?.term || 'No scored find'),
          best ? rarityBadge(best.points) : p('You completed the round.'),
        ),
        div(
          'action-stack',
          share,
          btn('Copy result', () => copyText(plain, shareOut), 'quiet'),
          shareOut,
        ),
      ),
    ),
    div('paper log', el('h2', {}, 'Seven entries'), el('ol', {}, rows)),
    snap.ranked &&
      div(
        'paper',
        distribution(snap.distribution),
        div(
          'inline-actions',
          link('Daily standings', '#boards/' + encodeURIComponent(snap.date), 'btn'),
          link('Friends', '#friends', 'btn'),
        ),
      ),
    snap.mode === 'daily' &&
      div(
        'paper',
        el('h3', {}, 'At the bench'),
        p(
          (stats.currentStreak ?? stats.current ?? 0) +
            '-day streak' +
            (stats.nextCosmetic
              ? ' · Next cosmetic: ' + (stats.nextCosmetic.name || stats.nextCosmetic)
              : ''),
        ),
        p('Next daily: ' + localTime(snap.nextResetAt || snap.issue?.resetAt)),
        link('View your collection', '#history'),
      ),
    currentSession()?.actor.kind === 'guest' &&
      div(
        'paper',
        el('h3', {}, 'Keep your finds'),
        p('Sign in to choose whether to import this guest history.'),
        link('Account options', '#account', 'btn'),
      ),
    details('Report a missing answer', report),
    div(
      'inline-actions end-links',
      link('Practice again', '#practice', 'btn'),
      link('Play Slide Relay', '#party', 'btn'),
    ),
  );
}

export async function history(ctx, [cursor]) {
  const data = await request(
    '/api/history' + (cursor ? '?before=' + encodeURIComponent(cursor) : ''),
  );
  if (!ctx.alive()) return;
  const stats = data.stats || {},
    unlocks = stats.cosmetics || stats.unlocks || data.cosmetics || [];
  rememberUnlocks(unlocks);
  ctx.paint(
    title('Your bench', 'Specimen history'),
    div(
      'paper',
      div(
        'stats-row',
        [
          ['Current streak', stats.currentStreak ?? stats.current ?? 0],
          ['Best streak', stats.bestStreak ?? stats.best ?? 0],
          ['Daily best', stats.dailyBest ?? stats.bestScore ?? 0],
        ].map(([key, value]) => div('', label(key), el('strong', {}, value))),
      ),
      el('h2', {}, 'Collection'),
      collection(unlocks),
    ),
    div(
      'paper',
      el('h2', {}, 'Saved runs'),
      data.runs?.length
        ? table(
            ['Date', 'Mode', 'Score', 'Run'],
            data.runs.map((r) => [
              r.date ? dateText(r.date) : 'Practice',
              modeName(r.mode) + (r.ranked === false ? ' · unranked' : ''),
              r.total ?? 0,
              link(r.phase === 'recap' ? 'Log' : 'Open', '#run/' + encodeURIComponent(r.id)),
            ]),
            'Saved runs',
          )
        : p('Your runs will appear here.'),
    ),
    data.nextBefore &&
      link('Earlier runs', '#history/' + encodeURIComponent(data.nextBefore), 'btn'),
  );
}
export function rules(ctx) {
  ctx.paint(
    title('Penicillion', 'How to play'),
    div(
      'paper',
      el('h2', {}, 'Daily Rounds'),
      p(
        'Name a correct answer before the clock runs out. The less readily it comes to mind for a mixed audience, the more the editors award.',
      ),
      termsRule(),
      link('Play Daily Rounds', '#daily', 'btn primary'),
    ),
    div(
      'paper',
      el('h2', {}, 'About this edition'),
      p(
        'Penicillion adapted selected terms and category relationships from the U.S. National Library of Medicine’s 2026 Medical Subject Headings. NLM does not endorse this game. Each scored find links to its source.',
      ),
      external(
        '2026 MeSH terms and conditions',
        'https://www.nlm.nih.gov/databases/download/terms_and_conditions_mesh.html',
      ),
      p(
        'The bench, keeper, reward graphics and synthesized sounds were created for Night Culture. Pixelify Sans and Penicillion Symbols use the SIL Open Font License.',
      ),
      div(
        'inline-actions',
        link('Pixelify Sans license', '/fonts/OFL-Pixelify-Sans.txt'),
        link('Symbol font license', '/fonts/OFL-Penicillion-Symbols.txt'),
      ),
    ),
  );
}
