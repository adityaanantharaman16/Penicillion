import { strict as assert } from 'node:assert';
import test from 'node:test';
import { matchInstrument } from './content.mjs';

test('demo anchors have distinct recall tiers and verifiable facts', () => {
  for (const [input, tier, points] of [
    ['scalpel', 'Gross View', 10], ['rongeur', 'Serial Section', 85], ['Gigli saw', 'Atlas Plate', 100],
  ]) {
    const answer = matchInstrument(input);
    assert.equal(answer.tier, tier);
    assert.equal(answer.points, points);
    assert.ok(answer.reason && answer.fact && answer.source.label);
    assert.equal(new URL(answer.source.url).protocol, 'https:');
  }
});

test('curated spellings, inflections, punctuation and spacing identify one scoring concept', () => {
  for (const [typed, canonical] of [
    ['  ＳＣＡＬＰＥＬＳ  ', 'Scalpel'], ['surgical knives', 'Scalpel'],
    ['haemostat', 'Hemostat'], ['haemostats', 'Hemostat'],
    ['bone\tronGeurs', 'Rongeur'], ['needle‑driver', 'Needle holder'],
    ['Gigli’s  wire saw', 'Gigli saw'], ['orthopaedic saw', 'Bone saw'],
    ['METZ', 'Metzenbaum scissors'],
  ]) {
    assert.strictEqual(matchInstrument(typed), matchInstrument(canonical), typed);
  }
});

test('supplies, unrecognized qualifiers, short guesses and malformed input do not earn points', () => {
  for (const input of [
    'scalpel blade', 'suture', 'needle', 'gauze', 'bone screw', 'hip implant',
    'hemostasis', 'ron', 'roc', 'surgery', 'scalpel or rongeur', 'not a scalpel',
    'Gigli saw wire', 'needle driver type II', 'scalpeI', 'scapula',
    '__proto__', 'constructor', '<img src=x>', 'a'.repeat(120), ' '.repeat(100) + 'scalpel',
    null, ['scalpel'], { toString: () => 'scalpel' }, 10,
  ]) assert.equal(matchInstrument(input), null);
});
