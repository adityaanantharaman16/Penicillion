// Server-only fixtures for comparing the two art directions.
export const demoContentRelease = 'concept-instruments.2';
export const instrumentPrompt = 'Name an instrument used in surgery.';
export const instrumentScope = 'Handheld surgical tools count. Leave out implants, loose blades and other supplies.';

const acs = Object.freeze({
  label: 'American College of Surgeons',
  url: 'https://www.facs.org/media/wgcmalet/common_surgical_instruments_module.pdf',
});
const fda = Object.freeze({
  label: 'FDA · K131851',
  url: 'https://www.accessdata.fda.gov/cdrh_docs/pdf13/K131851.pdf',
});
const suturing = Object.freeze({
  label: 'Practical Plastic Surgery · ch. 1',
  url: 'https://ldt.bradley.edu/ldt/onlinecourse/NUR/NUR600/Documents/Archive/NUR600_W14_SuturingTheBasics.pdf',
});
const redCross = Object.freeze({
  label: 'Red Cross equipment catalogue',
  url: 'https://itemscatalogue.redcross.int/detail.aspx?from=kit&itemcode=XSINMEDI576402',
});
const tiers = new Map([
  [10, 'Gross View'], [15, 'Teaching Slide'], [30, 'Fine Focus'],
  [60, 'Special Stain'], [85, 'Serial Section'], [100, 'Atlas Plate'],
]);

// A named pattern can be a distinct design (e.g. Mayo scissors). Inflections,
// alternate spellings and names for the same design share a single result.
const entries = [
  {
    term: 'Scalpel', points: 10, source: acs,
    aliases: ['scalpels', 'surgical scalpel', 'surgical scalpels', 'surgical knife', 'surgical knives'],
    fact: 'A No. 15 scalpel blade is a smaller version of the No. 10, made for finer cuts.',
    reason: 'A scalpel is an easy first guess when you picture an operating room.',
  },
  {
    term: 'Rongeur', points: 85, source: fda,
    aliases: ['rongeurs', 'bone rongeur', 'bone rongeurs', 'manual rongeur', 'rongeur forceps', 'kerrison rongeur', 'kerrison rongeurs'],
    fact: 'A rongeur takes bites of bone. On some designs, the scoop-shaped tip squeezes and cuts the bone.',
    reason: 'Remembering this bone tool by name takes a second leap after the familiar cutters and clamps.',
  },
  {
    term: 'Surgical scissors', points: 10, source: acs,
    aliases: ['scissors', 'surgical shears'],
    fact: 'Surgical scissors come with straight or curved blades.',
    reason: 'An everyday name gives players a direct way into the instrument tray.',
  },
  {
    term: 'Forceps', points: 10, source: acs,
    aliases: ['surgical forceps'],
    fact: 'Forceps grip objects or tissue. Some have small teeth at their tips.',
    reason: 'Grasping tools are among the first instruments a learner encounters.',
  },
  {
    term: 'Surgical clamp', points: 10, source: acs,
    aliases: ['clamp', 'clamps', 'surgical clamps', 'locking forceps'],
    fact: 'Many surgical clamps have a ratchet that holds their jaws shut.',
    reason: 'A familiar workshop word also names a surgical tool.',
  },
  {
    term: 'Hemostat', points: 15, source: acs,
    aliases: ['hemostats', 'haemostat', 'haemostats', 'haemostatic forceps', 'hemostatic forceps', 'hemostatic clamp', 'haemostatic clamp', 'artery forceps'],
    fact: 'A hemostat can hold a blood vessel while the surgeon ties it off.',
    reason: 'This classic instrument-tray name comes early in surgical training.',
  },
  {
    term: 'Retractor', points: 15, source: acs,
    aliases: ['retractors', 'surgical retractor', 'surgical retractors', 'handheld retractor', 'hand-held retractor'],
    fact: 'A retractor holds tissue aside to keep the operating field visible.',
    reason: 'Its name describes its job, giving players a clue once they picture the field.',
  },
  {
    term: 'Needle holder', points: 30, source: suturing,
    aliases: ['needle holders', 'needle driver', 'needle drivers', 'needle-holder', 'needle-driver', 'needle-holders', 'needle-drivers'],
    fact: 'A needle holder grips the curved needle as a surgeon places a stitch.',
    reason: 'Thinking through how a stitch is placed brings this tool to mind.',
  },
  {
    term: 'Bone saw', points: 30, source: acs,
    aliases: ['bone saws', 'surgical bone saw', 'orthopedic saw', 'orthopaedic saw'],
    fact: 'Some bone saws follow a guide called a jig.',
    reason: 'It takes a shift from soft tissue to the tools of orthopaedic surgery.',
  },
  {
    term: 'Mayo scissors', points: 30, source: acs,
    aliases: ['mayo surgical scissors'],
    fact: 'Curved Mayo scissors can cut fascia, the tough tissue around muscles.',
    reason: 'Recalling a particular design goes a step beyond naming scissors.',
  },
  {
    term: 'Metzenbaum scissors', points: 60, source: acs,
    aliases: ['metz', 'metz scissors'],
    fact: 'Metzenbaum scissors are light enough to work on delicate tissue.',
    reason: 'The name usually comes back when picturing a particular pair on the tray.',
  },
  {
    term: 'Weitlaner retractor', points: 60, source: acs,
    aliases: ['weitlaner', 'weitlaner retractors'],
    fact: 'The Weitlaner holds itself open, freeing the hands that placed it.',
    reason: 'A memorable set of prongs helps someone who has seen one retrieve its name.',
  },
  {
    term: 'Trocar', points: 60, source: acs,
    aliases: ['trocars'],
    fact: 'In laparoscopy, a trocar provides access for instruments through the abdominal wall.',
    reason: 'Switching from an open instrument tray to keyhole surgery can unlock this answer.',
  },
  {
    term: 'Yankauer suction tube', points: 60, source: acs,
    aliases: ['yankauer', 'yankauer suction', 'yankauer suction tip', 'yankauer suction tubes', 'yankauer suction tips'],
    fact: 'The Yankauer draws fluid away from the surface of the operating field.',
    reason: 'Players who picture the suction tubing may remember the name of its tip.',
  },
  {
    term: 'Gigli saw', points: 100, source: redCross,
    aliases: ['gigli saws', 'gigli wire saw', "gigli's saw", "gigli's wire saw"],
    fact: 'A Gigli saw cuts bone with a flexible wire stretched between two handles.',
    reason: 'Two handles and a wire make a memorable picture. Recalling the saw’s name is the harder part.',
  },
];

function normalized(input) {
  return input.normalize('NFKC').toLowerCase().replace(/[‘’]/gu, "'")
    .replace(/[‐‑‒–—]/gu, '-').trim().replace(/\s+/gu, ' ');
}

const matches = new Map();
for (const { term, points, fact, source, reason, aliases } of entries) {
  const tier = tiers.get(points);
  if (!tier) throw new Error('Missing tier for ' + term);
  const result = Object.freeze({ term, tier, points, fact, source, reason });
  for (const name of [term, ...aliases]) {
    const key = normalized(name);
    if (matches.has(key)) throw new Error('Duplicate instrument alias: ' + key);
    matches.set(key, result);
  }
}

export function matchInstrument(input) {
  if (typeof input !== 'string' || input.length > 96) return null;
  return matches.get(normalized(input)) ?? null;
}
