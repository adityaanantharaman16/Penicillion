import { normalizeAnswer } from '../../content/match.mjs';

// One deleted character yields candidates for insertion, deletion, substitution
// or adjacent transposition. Keep all scoring behind an exact confirmed answer.
export function typoKeys(word) {
  if (word.length < 7 || word.length > 64 || !/^[\p{L} ]+$/u.test(word)) return [];
  return [...new Set([word, ...Array.from(word, (_, i) => word.slice(0, i) + word.slice(i + 1))])];
}
const protectedParts =
  /\b(?:type|factor|class|group|grade|stage|subtype|[ivx]+|[abc]|left|right|upper|lower|major|minor|superior|inferior|anterior|posterior|internal|external|medial|lateral|proximal|distal|short|long|deep|superficial|afferent|efferent|flexor|extensor|abductor|adductor|artery|vein|nerve|muscle)\b|\b(?:hypo|hyper|anti|tachy|brady|inter|intra)\p{L}*|\d+/giu;
function markers(s) {
  return Array.from(s.matchAll(protectedParts), (m) => m[0]).join('|');
}
export function oneEdit(a, b) {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
  if (a.length < b.length) return a.slice(i) === b.slice(i + 1);
  if (a.length > b.length) return a.slice(i + 1) === b.slice(i);
  if (a.slice(i + 1) === b.slice(i + 1)) return true;
  return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
}
export async function match(db, release, prompt, input, { suggest = false } = {}) {
  const norm = normalizeAnswer(input);
  const unknown = {
    feedback:
      'This edition doesn’t recognize that answer here. Check the scope and try another term.',
  };
  if (!norm) return { feedback: 'Enter a term before submitting.' };
  const hit = await db.query(
    `SELECT a.disposition,m.concept_id AS id,m.term,m.tier,m.points
   FROM solo_alias a LEFT JOIN solo_mapping m USING(release_id,prompt_id,concept_id)
   WHERE a.release_id=$1 AND a.prompt_id=$2 AND a.norm=$3`,
    [release, prompt, norm],
  );
  if (hit.rowCount) {
    const { disposition, ...answer } = hit.rows[0];
    if (disposition === 'hit') return { answer };
    return {
      feedback:
        disposition === 'ambiguous'
          ? 'That name has more than one meaning. Please spell it out.'
          : 'That falls outside this prompt’s scope. Try another term.',
    };
  }
  if (norm.length < 4) return { feedback: 'Please spell it out so the term is clear.' };
  const keys = suggest ? typoKeys(norm) : [];
  if (!keys.length) return unknown;
  // A real term in another category must never become today's term by correction.
  if (
    (
      await db.query('SELECT 1 FROM solo_alias WHERE release_id=$1 AND norm=$2 LIMIT 1', [
        release,
        norm,
      ])
    ).rowCount
  )
    return unknown;
  const candidates = await db.query(
    `SELECT a.norm,m.concept_id,m.term FROM solo_alias a
 JOIN solo_mapping m USING(release_id,prompt_id,concept_id)
 WHERE a.release_id=$1 AND a.prompt_id=$2 AND a.disposition='hit'
 AND a.typo_keys && $3::text[] LIMIT 81`,
    [release, prompt, keys],
  );
  if (candidates.rowCount > 80) return unknown;
  const choices = new Map();
  for (const row of candidates.rows) {
    if (
      norm.split(' ').length === row.norm.split(' ').length &&
      markers(norm) === markers(row.norm) &&
      oneEdit(norm, row.norm)
    )
      choices.set(row.concept_id, row.term);
  }
  return choices.size === 1
    ? {
        suggestion: [...choices.values()][0],
        feedback: 'Possible spelling match. Confirm the term to submit it.',
      }
    : unknown;
}
