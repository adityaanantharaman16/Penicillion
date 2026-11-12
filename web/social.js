import { currentSession, request, getSession } from './api.js';
import {
  el,
  div,
  p,
  label,
  title,
  link,
  btn,
  field,
  details,
  feedback,
  guard,
  submitButton,
  copyText,
  dateText,
  localTime,
  table,
  rarityBadge,
} from './ui.js';
import { distribution } from './solo.js';

const joinKey = 'penicillion:pending-invite';
function pendingInvite(value) {
  try {
    if (value === null) sessionStorage.removeItem(joinKey);
    else if (value !== undefined) sessionStorage.setItem(joinKey, value);
    return sessionStorage.getItem(joinKey);
  } catch {
    return null;
  }
}
function action(text, onClick, out, cls = 'btn') {
  return btn(text, guard(onClick, out), cls);
}
function formFor(fields, caption, onSubmit, out) {
  const submit = submitButton(caption),
    form = el('form', { class: 'stack-form' }, fields, submit, out);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    try {
      await onSubmit();
    } catch (error) {
      feedback(out, error.message);
    } finally {
      submit.disabled = false;
    }
  });
  return form;
}
async function mutate(ctx, path, body) {
  await request(path, body);
  await getSession();
  if (ctx.alive()) ctx.refresh();
}
export async function account(ctx) {
  const s = await getSession();
  if (!ctx.alive()) return;
  ctx.profile();
  const a = s.actor,
    out = div('feedback');
  if (a.kind === 'guest') {
    const login = action(
      'Sign in',
      async () => {
        const { url } = await request('/api/login', {});
        const dest = new URL(url, location.origin);
        if (!['https:', 'http:'].includes(dest.protocol))
          throw new Error('Invalid sign-in destination.');
        location.assign(dest.href);
      },
      out,
      'btn primary',
    );
    ctx.paint(
      title('Your bench', 'Guest account'),
      div(
        'paper',
        el('h2', {}, 'Keep your specimen history.'),
        p(
          'Daily Rounds works immediately as a guest. Sign in to carry your history between devices and join private friend groups.',
        ),
        p('After signing in, choose whether to import the runs from this browser.'),
        login,
        out,
        s.localLogin && p('This local installation uses a development identity provider.', 'small'),
      ),
      link('Your specimen history', '#history', 'btn'),
    );
    return;
  }
  let claim = null;
  if (s.claim) {
    const claimOut = div('feedback');
    claim = div(
      'paper claim',
      label('Guest history'),
      el('h2', {}, 'Bring your runs to this account?'),
      p(
        s.claim.runs +
          ' guest runs, including ' +
          s.claim.completed +
          ' completed. ' +
          s.claim.collisions +
          ' overlapping daily dates. Existing account dailies take priority.',
      ),
      s.claim.unrankedImports > s.claim.collisions &&
        p(s.claim.unrankedImports + ' daily attempts will be saved as private, unranked history.'),
      div(
        'inline-actions',
        action(
          'Import guest history',
          () => mutate(ctx, '/api/claim', { import: true }),
          claimOut,
          'btn primary',
        ),
        action(
          'Continue without importing',
          () => mutate(ctx, '/api/claim', { import: false }),
          claimOut,
        ),
      ),
      claimOut,
    );
  }
  const handle = el('input', {
      value: a.handle || '',
      maxlength: 20,
      minlength: 3,
      required: true,
      pattern: '[A-Za-z][A-Za-z0-9_]{2,19}',
      autocomplete: 'nickname',
      placeholder: 'e.g. NightKeeper',
    }),
    listed = el('input', { type: 'checkbox', checked: a.listed }),
    sharing = el('input', { type: 'checkbox', checked: a.shareAnswers }),
    profileOut = div('feedback');
  const profile = formFor(
    [
      field('Public handle', handle),
      p('3–20 letters, numbers or underscores. Start with a letter.', 'small'),
      field('List my handle and score on the public daily board', listed),
      field('Share my completed daily answers with eligible friends', sharing),
    ],
    'Save profile',
    async () => {
      await request('/api/profile', {
        handle: handle.value.trim(),
        listed: listed.checked,
        shareAnswers: sharing.checked,
      });
      await getSession();
      ctx.profile();
      feedback(profileOut, 'Profile saved.', false);
    },
    profileOut,
  );
  const confirm = el('input', {
      placeholder: 'DELETE',
      required: true,
      pattern: 'DELETE',
      autocomplete: 'off',
    }),
    deleteOut = div('feedback');
  const invite = pendingInvite();
  ctx.paint(
    title('Your bench', a.handle || 'Account'),
    claim,
    invite && link('Return to group invitation', '#invite/' + encodeURIComponent(invite), 'btn'),
    div('paper', el('h2', {}, 'Profile & privacy'), profile),
    div(
      'paper',
      div(
        'inline-actions',
        link('Specimen history', '#history', 'btn'),
        link('Friends', '#friends', 'btn'),
        action('Sign out', () => mutate(ctx, '/api/logout', {}), out),
      ),
      out,
    ),
    details(
      'Delete account',
      p('Delete this account and its saved play history. Type DELETE to confirm.'),
      formFor(
        [field('Confirmation', confirm)],
        'Delete account',
        () => mutate(ctx, '/api/account/delete', { confirm: confirm.value }),
        deleteOut,
      ),
    ),
  );
}
function requireHandle(ctx, token) {
  const a = currentSession().actor;
  if (a.kind === 'account' && a.handle) return false;
  if (token) pendingInvite(token);
  ctx.paint(
    title('Private groups', 'Friends'),
    div(
      'paper',
      el('h2', {}, a.kind === 'guest' ? 'Play with people you know.' : 'Choose a handle to join.'),
      p(
        'Create a private group or join from an invitation. Compare daily and weekly scores after you finish today’s issue.',
      ),
      link(
        a.kind === 'guest' ? 'Sign in for Friends' : 'Choose a handle',
        '#account',
        'btn primary',
      ),
    ),
  );
  return true;
}
function tokenFrom(value) {
  const raw = value.trim();
  const match = /(?:#invite\/)([A-Za-z0-9_-]{32})$/.exec(raw);
  return match ? match[1] : raw;
}
export async function invite(ctx, [token]) {
  if (requireHandle(ctx, token)) return;
  const out = div('feedback');
  ctx.paint(
    title('Friends', 'Group invitation'),
    div(
      'paper',
      el('h2', {}, 'Join this private group?'),
      p(
        'Members see your handle and eligible scores. Answer sharing is controlled in your profile.',
      ),
      action(
        'Join group',
        async () => {
          const { id } = await request('/api/groups/join', { token });
          pendingInvite(null);
          if (ctx.alive()) ctx.go('friends/' + id);
        },
        out,
        'btn primary',
      ),
      out,
    ),
  );
}
export async function friends(ctx, [id]) {
  if (requireHandle(ctx)) return;
  if (id) return group(ctx, id);
  const data = await request('/api/groups');
  if (!ctx.alive()) return;
  const name = el('input', {
      required: true,
      minlength: 2,
      maxlength: 39,
      autocomplete: 'off',
      placeholder: 'Name your group',
    }),
    token = el('input', {
      required: true,
      autocomplete: 'off',
      placeholder: 'Invitation link or token',
    }),
    createOut = div('feedback'),
    joinOut = div('feedback');
  ctx.paint(
    title('Private groups', 'Friends'),
    div(
      'paper',
      el('h2', {}, 'Your groups'),
      data.groups.length
        ? el(
            'ul',
            { class: 'directory' },
            data.groups.map((g) =>
              el('li', {}, link(g.name, '#friends/' + encodeURIComponent(g.id)), label(g.role)),
            ),
          )
        : p('Create a group or join with an invitation.'),
    ),
    div(
      'split',
      div(
        'paper',
        el('h2', {}, 'Create a group'),
        formFor(
          [field('Group name', name)],
          'Create group',
          async () => {
            const { id } = await request('/api/groups', { name: name.value.trim() });
            if (ctx.alive()) ctx.go('friends/' + id);
          },
          createOut,
        ),
      ),
      div(
        'paper',
        el('h2', {}, 'Join a group'),
        formFor(
          [field('Invitation', token)],
          'Join group',
          async () => {
            const { id } = await request('/api/groups/join', { token: tokenFrom(token.value) });
            if (ctx.alive()) ctx.go('friends/' + id);
          },
          joinOut,
        ),
      ),
    ),
    link('Daily standings', '#boards', 'btn'),
  );
}
async function group(ctx, id) {
  const path = '/api/groups/' + encodeURIComponent(id),
    g = await request(path);
  if (!ctx.alive()) return;
  const owner = g.role === 'owner',
    actor = currentSession().actor,
    inviteOut = div('feedback'),
    membersOut = div('feedback'),
    answerOut = div('feedback');
  const named = (rows, daily) =>
    rows.length
      ? table(
          daily ? ['Rank', 'Player', 'Total', 'Answers'] : ['Rank', 'Player', 'Total'],
          rows.map((row) => {
            const base = [row.rank, row.handle, row.total];
            if (daily)
              base.push(
                row.canSeeAnswers
                  ? action(
                      'View answers',
                      async () => {
                        const { rows } = await request(
                          path + '/answers?member=' + encodeURIComponent(row.id),
                        );
                        answerOut.replaceChildren(
                          el('h3', {}, row.handle + '’s specimen log'),
                          el(
                            'ol',
                            {},
                            rows.map((r) =>
                              el(
                                'li',
                                {},
                                r.term || 'No answer',
                                ' · ',
                                rarityBadge(r.points),
                                ' · +' + r.points,
                              ),
                            ),
                          ),
                        );
                      },
                      answerOut,
                      'quiet',
                    )
                  : 'Private',
              );
            return base;
          }),
          daily ? 'Daily scores' : 'Weekly scores',
        )
      : p('No eligible scores yet.');
  const change = async (action, body = {}, returnToList = false) => {
    await request(path + '/' + action, body);
    if (ctx.alive()) returnToList ? ctx.go('friends') : ctx.refresh();
  };
  const management = details(
    'Group members & settings',
    el(
      'ul',
      { class: 'directory' },
      g.members.map((m) =>
        el(
          'li',
          {},
          div('', el('b', {}, m.handle), label(m.role)),
          m.id !== actor.id &&
            details(
              'Manage ' + m.handle,
              owner &&
                action('Remove from group', () => change('remove', { id: m.id }), membersOut),
              action(
                owner ? 'Block and remove' : 'Block and leave group',
                () => change('block', { id: m.id }, !owner),
                membersOut,
              ),
            ),
        ),
      ),
    ),
    membersOut,
    owner &&
      div(
        'inline-actions',
        action(
          'Create invitation',
          async () => {
            const res = await request(path + '/invite', {});
            const input = el('input', {
              readonly: true,
              'aria-label': 'Private invitation URL',
              value: res.url,
            });
            const copy = div('feedback');
            inviteOut.replaceChildren(
              p('Valid for seven days. Creating another invitation revokes this one.'),
              input,
              btn('Copy invitation', () => copyText(res.url, copy)),
              copy,
            );
          },
          inviteOut,
        ),
        action(
          'Revoke invitation',
          async () => {
            await request(path + '/revoke', {});
            feedback(inviteOut, 'Invitation revoked.', false);
          },
          inviteOut,
        ),
      ),
    inviteOut,
    details(
      'Leave this group',
      p(
        owner
          ? 'Ownership passes to the next member when you leave.'
          : 'Your membership ends immediately.',
      ),
      action('Leave group', () => change('leave', {}, true), membersOut),
    ),
  );
  ctx.paint(
    title('Friends', g.name, g.members.length + ' members'),
    link('Back to groups', '#friends'),
    g.locked
      ? div(
          'paper',
          el('h2', {}, 'Standings open after your daily.'),
          p('Complete today’s Daily Rounds to compare scores.'),
          link('Open Daily Rounds', '#daily', 'btn primary'),
        )
      : div(
          'paper',
          el('h2', {}, 'Daily standings'),
          p(dateText(g.date) + ' · Updated ' + localTime(g.updatedAt), 'small'),
          named(g.daily, true),
          answerOut,
          el('h2', {}, 'This week'),
          p('Eligible points from Monday through today.', 'small'),
          named(g.weekly, false),
        ),
    management,
  );
}
export async function boards(ctx, [date, page = '0']) {
  const out = div('feedback');
  const qs = new URLSearchParams();
  if (date) qs.set('date', date);
  qs.set('page', String(Math.max(0, Number(page) || 0)));
  let board;
  try {
    board = await request('/api/boards?' + qs);
  } catch (error) {
    if (error.status !== 403) throw error;
    if (ctx.alive())
      ctx.paint(
        title('Daily Rounds', 'Daily standings'),
        div(
          'paper',
          el('h2', {}, 'Finish this daily to open its board.'),
          link('Open Daily Rounds', '#daily', 'btn primary'),
        ),
      );
    return;
  }
  const stats = await request('/api/distribution?date=' + encodeURIComponent(board.date));
  if (!ctx.alive()) return;
  const index = Number(page) || 0,
    base = '#boards/' + board.date + '/';
  ctx.paint(
    title('Daily Rounds', 'Daily standings', dateText(board.date)),
    div('paper', distribution(stats)),
    div(
      'paper',
      el('h2', {}, 'Public board'),
      p(
        'Listed handles only. Equal totals share a rank. Updated ' +
          localTime(board.updatedAt) +
          '.',
        'small',
      ),
      board.rows.length
        ? table(
            ['Rank', 'Handle', 'Score'],
            board.rows.map((r) => [r.rank, r.handle, r.total]),
            'Public standings',
          )
        : p('No listed scores on this page.'),
      div(
        'inline-actions',
        index > 0 && link('Previous page', base + (index - 1), 'btn'),
        board.rows.length === 50 && link('Next page', base + (index + 1), 'btn'),
      ),
      out,
    ),
    link('Friends', '#friends', 'btn'),
  );
}
