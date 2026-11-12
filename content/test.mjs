import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {normalizeAnswer} from './match.mjs';
import {buildSchedule} from './schedule.mjs';
import {validateRelease} from './validate.mjs';

const releaseUrl = new URL('./release.json', import.meta.url);
const bytes = readFileSync(releaseUrl);
const release = JSON.parse(bytes);
const prompts = new Map(release.prompts.map(p => [p.id, p]));

// Exercise the compiled editorial index; the server's tests exercise fuzzy matching and SQL.
function accepted(promptId, input) {
  const p = prompts.get(promptId);
  const key = normalizeAnswer(input);
  if ([...p.ambiguous, ...p.exclusions].some(name => normalizeAnswer(name) === key)) return undefined;
  return p.answers.find(answer => [answer.term, ...answer.aliases].some(name => normalizeAnswer(name) === key));
}

test('prompt scope and the same canonical concept at different editorial tiers', () => {
  const red = accepted('human-cells', 'red blood cell');
  assert.equal(red.id, accepted('human-cells', ' RBC ').id);
  assert.equal(red.id, accepted('human-cells', 'ERYTHROCYTE').id);
  assert.equal(red.points, 10);
  assert.equal(accepted('human-cells', 'astrocyte').points, 30);
  assert.equal(accepted('glia', 'astrocyte').points, 10);
  assert.equal(accepted('human-cells', 'Purkinje cell of the cerebellum').points, 85);
  assert.equal(accepted('instruments', 'scalpel').points, 10);
  assert.equal(accepted('instruments', 'rongeur').points, 85);
  assert.ok(accepted('cell-parts', 'mitochondrion'));
  assert.ok(accepted('cns', 'multiple sclerosis'));
  assert.ok(accepted('cns', 'syringomyelia'));
});

test('dangerous qualifiers, scope, meaningful numbers and ambiguity', () => {
  for (const [prompt, wrong] of Object.entries({
    'human-cells':['mitochondrion', 'platelet', 'PC'], 'cell-parts':['chloroplast', 'astrocyte'],
    glia:['Schwann cell', 'neuron'], instruments:['scalpel blade', 'suture', 'gauze'],
    'cranial-nerves':['optic disc', 'optic chiasm'], clotting:['factor VI', 'factor 6'],
    antibodies:['IgG1', 'kappa'], 'amino-acids':['A'], cns:['peripheral neuropathy']
  })) {
    for (const name of wrong) assert.equal(accepted(prompt, name), undefined, prompt + ' / ' + name);
  }
  assert.notEqual(accepted('clotting', 'factor V').id, accepted('clotting', 'factor VII').id);
  assert.equal(accepted('antibodies', 'IgG').points, 10);
  assert.equal(normalizeAnswer('X'.repeat(97)), '');
  assert.equal(normalizeAnswer('  O’Brien–Smith '), "o'brien-smith");
});

test('independently challenged omissions each resolve to a sourced mapping', () => {
  const entries = {arteries:'anterior tibial artery', hydrolases:'sucrase', 'human-cells':'natural killer cell',
    autoimmune:'celiac disease', imaging:'optical coherence tomography', instruments:'Richardson retractor',
    'bacterial-genera':'Enterobacter', cornea:'corneal abrasion', hormones:'melatonin'};
  for (const [id, answer] of Object.entries(entries)) {
    const row = accepted(id, answer);
    assert.ok(row?.evidence && row?.source.url.startsWith('https://'), id);
    assert.ok(!row.fact.includes('medical subject index'));
  }
});

test('validator rejects a duplicate spelling even on the same concept', () => {
  const bad = structuredClone(release);
  const row = bad.prompts[0].answers[0];
  row.aliases.push(' ' + row.term.toUpperCase() + ' ');
  assert.throws(() => validateRelease(bad), /Duplicate normalized alias/);
});

test('a shared short form must be explicitly ambiguous', () => {
  const draft = structuredClone(release);
  const prompt = draft.prompts[0];
  prompt.answers[0].aliases.push('XR');
  prompt.answers[1].aliases.push('xr');
  assert.throws(() => validateRelease(draft), /Duplicate normalized alias/);
  prompt.ambiguous.push('XR');
  assert.doesNotThrow(() => validateRelease(draft));
});

test('closed sets, year-long spacing, and same civil date across refill or DST', () => {
  const expected = {carpals:8, 'cranial-nerves':12, 'amino-acids':20, 'essential-amino':9, vitamins:13, antibodies:5, clotting:12};
  for (const [name,count] of Object.entries(expected)) assert.equal(prompts.get(name).answers.length, count);
  const result = validateRelease(release);
  assert.ok(result.minGap >= 8 && result.minFamilies >= 4);
  for (const [start, midnight] of [['2026-03-07','2026-03-09'],['2026-10-31','2026-11-02']]) {
    assert.deepEqual(buildSchedule(start,3,release)[2], buildSchedule(midnight,1,release)[0]);
  }
  assert.throws(() => buildSchedule('2026-02-31',1,release), /Invalid start date/);
  assert.throws(() => buildSchedule('2026-03-01',1,{prompts:[]}), /Inventory below/);
});

test('a rebuild from the bundled source produces the exact reviewed release', () => {
  const temp = mkdtempSync(join(tmpdir(), 'penicillion-content-'));
  try {
    const output = join(temp, 'rebuilt.json');
    const builder = fileURLToPath(new URL('./tools/build.py', import.meta.url));
    execFileSync('python3', [builder,'--out',output]);
    assert.deepEqual(readFileSync(output), bytes);
  } finally {
    rmSync(temp, {recursive:true, force:true});
  }
});
