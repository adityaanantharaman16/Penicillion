import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { rarityFor } from '../../web/rarity.js';

const origin = new URL(process.env.TEST_ORIGIN || 'http://127.0.0.1:4320');
const release = JSON.parse(await readFile(new URL('../../content/release.json', import.meta.url)));

test('two guests pass a live slide, see the same award and lose a heart on timeout', { timeout: 100_000 }, async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const host = await desktop.newPage();
  const guest = await phone.newPage();
  const errors = [];
  for (const page of [host, guest]) {
    page.setDefaultTimeout(10_000);
    page.on('pageerror', (error) => errors.push(error.message));
  }

  await host.goto(origin.href);
  await host.getByRole('button', { name: 'Menu', exact: true }).click();
  await host.getByRole('link', { name: 'Party', exact: true }).click();
  await host.getByRole('button', { name: 'Create private room' }).click();
  const ready = { name: 'Ready', exact: true };
  await host.getByRole('button', ready).waitFor();
  await guest.goto(host.url());
  await guest.getByRole('button', { name: 'Join room' }).click();
  await guest.getByRole('button', ready).click();
  await host.getByRole('button', ready).click();
  await host.getByRole('button', { name: 'Start relay' }).click();

  const prompt = await host.locator('#relay-prompt').innerText();
  const category = release.prompts.find((p) => p.text === prompt);
  assert.ok(category, 'the displayed category should come from the bundled release');
  const answer = category.answers.find((a) => a.points === 85) || category.answers[0];
  const charge = rarityFor(answer.points).chargeGain;
  assert.ok(charge > 0, 'accepted answers should add charge');
  await host.getByLabel('Your answer').fill(answer.term);
  await host.getByRole('button', { name: 'Pass slide' }).click();

  await guest.locator('.ra-seat[data-you][data-active]').waitFor();
  await host.locator('.ra-seat:not([data-you])[data-active]').waitFor();
  assert.ok(await guest.getByLabel('Your answer').isEnabled());
  assert.ok(await host.getByLabel('Your answer').isDisabled());
  assert.equal(await host.locator('.ra-seat[data-you] .ra-charge').innerText(), String(charge));
  assert.equal(await guest.locator('.ra-seat:not([data-you]) .ra-charge').innerText(), String(charge));

  // Let the actual server fuse expire with the phone holding the slide.
  await guest.locator('.ra-seat[data-you] .ra-hearts i:not(.full)').waitFor({ timeout: 45_000 });
  await host.locator('.ra-seat[data-you][data-active]').waitFor();
  assert.equal(await guest.locator('.ra-seat[data-you] .ra-hearts .full').count(), 2);
  assert.equal(await host.locator('.ra-seat:not([data-you]) .ra-hearts .full').count(), 2);
  assert.equal(await host.locator('.ra-seat[data-you] .ra-hearts .full').count(), 3);
  assert.deepEqual(errors, [], 'both browser sessions should finish without script errors');
});
