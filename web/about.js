import { div, el, p, title, link, details, external, rarityBadge } from './ui.js';
import { rarities, relayChargeTarget } from './rarity.js';

export function about(ctx) {
  ctx.paint(
    title('Penicillion', 'About & FAQ'),
    el(
      'section',
      { class: 'paper', 'aria-labelledby': 'about-heading' },
      el('h2', { id: 'about-heading' }, 'A little recall. A growing culture.'),
      p(
        'Penicillion is a pixel-art medical word game. Find an answer inside each prompt’s scope, watch your culture grow, and discover terms you almost remembered. Play solo Daily Rounds or multiplayer Slide Relay.',
      ),
      p(
        'This is a game for play and learning. It does not provide medical advice, diagnosis or treatment, and your score is not a measure of clinical competence.',
      ),
      div(
        'inline-actions',
        link('Play Daily Rounds', '#daily', 'btn primary'),
        link('Try Practice', '#practice', 'btn'),
        link('How to play', '#rules'),
      ),
    ),
    el(
      'section',
      { class: 'paper', 'aria-labelledby': 'faq-heading' },
      el('h2', { id: 'faq-heading' }, 'Frequently asked questions'),
      details(
        'How do Daily Rounds work?',
        p(
          'Each daily issue has seven prompts, with 25 seconds for each answer and 700 possible points. Read the scope before answering: a related term only counts if it fits this prompt. A correct answer locks the round; an unaccepted answer can be retried while time remains.',
        ),
        p(
          'You get one ranked attempt per guest or account identity for each Eastern game date. After all seven prompts, your specimen log brings together your answers, sources and results.',
        ),
      ),
      details(
        'Why do correct answers earn different points?',
        p(
          'Rarity is an editorial judgment about how readily a mixed medical audience might recall an answer for this particular prompt. It is not the prevalence or seriousness of a condition. The same term can earn different points under different scopes.',
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
          'There is no speed bonus. Observed answer frequencies describe eligible players’ choices; they do not change the issue’s published points. “More Info” explains the score and links to the answer’s source.',
        ),
      ),
      details(
        'When does the daily reset?',
        p(
          'A new issue opens at midnight U.S. Eastern time, including daylight saving changes. The Daily Rounds page shows the next reset in your local time.',
        ),
        p(
          'If you started before midnight, you can finish that issue until 12:10 a.m. Eastern. An unfinished old issue then expires without ranked credit. The new day has its own attempt.',
        ),
      ),
      details(
        'Can I pause or return to a round?',
        p(
          'Your run is saved, and Daily Rounds offers Resume when you return. An open prompt’s clock keeps running if you open the menu, switch tabs, reload or lose connection. Those actions do not restart the timer.',
        ),
        p(
          'Between prompts, you can read a reveal before choosing Next. For a daily issue, the overnight cutoff still applies. Choose untimed Practice if you want to answer without a clock.',
        ),
      ),
      details(
        'How are Practice and Archive different?',
        p(
          'Practice offers repeatable sets of seven prompts outside the reserved daily schedule. Turn on Untimed practice before starting if you prefer more thinking time.',
        ),
        p(
          'Archive lets you replay past issues or explore their annotated accepted answers. Practice and Archive are unranked: they leave your daily standings and streak unchanged. Some archive answers stay hidden while they could reveal a prompt in your unfinished daily.',
        ),
        div('inline-actions', link('Practice', '#practice'), link('Archive', '#archive')),
      ),
      details(
        'How does Slide Relay work?',
        p(
          'Two to eight keepers take turns naming an unused answer to a category. A correct answer passes the slide to the next surviving player. Synonyms count as the same answer. An unaccepted answer leaves the slide with its holder.',
        ),
        p(
          'Each keeper starts with three lives. A fresh fuse lasts 10–30 seconds; a pass carries the remaining time, with at least eight seconds for the next holder. When it pops, its holder loses a life and the next player opens a fresh category. The last surviving keeper wins.',
        ),
        p(
          'Accepted passes add charge, with rarer answers adding more. At ' +
            relayChargeTarget +
            ' charge, you restore one missing life and keep any excess. At full health, charge caps at ' +
            (relayChargeTarget - 1) +
            '. Five SPECIALIST passes, one CLASSIC and one CLEVER fill an empty meter. Relay is unranked.',
        ),
        p(
          'The clock continues if you disconnect. Reconnect within 45 seconds to keep your seat.',
        ),
        link('Open Party', '#party'),
      ),
      details(
        'Do I need an account, and where are my saves?',
        p(
          'You can play Daily Rounds, Practice, Archive and Slide Relay as a guest. Runs are saved on the server and tied to this browser’s guest session, so they do not automatically follow you to another browser or device.',
        ),
        p(
          'Sign in to use your account history across devices and join private friend groups. After signing in, you choose whether to import this browser’s guest runs. Existing account dailies take priority if dates overlap.',
        ),
        link('Account options', '#account'),
      ),
      details(
        'Who can see my scores and answers?',
        p(
          'New accounts start with unlisted scores and private answers. In Account, you can choose whether to list your handle and score on the public daily board, and whether eligible friends can see your completed daily answers. Your saved run history stays private.',
        ),
        p(
          'Account also includes a delete-account option for removing your account and saved runs.',
        ),
        link('Account & privacy controls', '#account'),
      ),
      details(
        'Where do the answers come from, and can I report a missing one?',
        p(
          'The answer bank uses selected medical terms and relationships, with a stated scope, source links and editorial scoring. Open “More Info” on a reveal to read its rationale and source. The Archive answer explorer includes annotations for past issues.',
        ),
        p(
          'After a solo run, open “Report a missing answer” in your specimen log. Choose the prompt and send the term you expected to count. Reports are private and reviewed for future content releases. Corrections do not rewrite your saved issue or its published score.',
        ),
      ),
      details(
        'Can I turn off sound or animation?',
        p(
          'Open Settings to change sound, volume or Static scenery. The game also honors your device’s reduced-motion preference. Static scenery and reduced motion show cultures in their settled state.',
        ),
      ),
    ),
    el(
      'section',
      { class: 'paper', 'aria-labelledby': 'edition-heading' },
      el('h2', { id: 'edition-heading' }, 'About this edition'),
      p(
        'Penicillion adapted selected terms and category relationships from the U.S. National Library of Medicine’s 2026 Medical Subject Headings. NLM does not endorse this game. Each scored find links to its source.',
      ),
      p(
        'Penicillion selected the entries, assigned recall tiers and wrote its own facts. This edition has not been signed off by a clinician.',
      ),
      external(
        '2026 MeSH terms and conditions',
        'https://www.nlm.nih.gov/databases/download/terms_and_conditions_mesh.html',
      ),
      p(
        'The bench, keeper, reward graphics and synthesized sounds were created for Penicillion. Pixelify Sans and Penicillion Symbols use the SIL Open Font License.',
      ),
      div(
        'inline-actions',
        link('Pixelify Sans license', '/fonts/OFL-Pixelify-Sans.txt'),
        link('Symbol font license', '/fonts/OFL-Penicillion-Symbols.txt'),
      ),
    ),
  );
}
