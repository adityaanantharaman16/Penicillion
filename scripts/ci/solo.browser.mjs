import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { rarityFor } from '../../web/rarity.js';

const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:4320';
const bank = JSON.parse(await readFile(new URL('../../content/release.json', import.meta.url)));
for (const mode of ['daily', 'practice']) {
  test(mode + ' floating entry, scored reveal and next prompt', async (t) => {
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const phone = mode === 'practice';
    const page = await browser.newPage({
      viewport: phone ? {width: 360, height: 740} : {width: 1440, height: 900},
      hasTouch: phone, isMobile: phone,
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/#' + mode);
    await page.getByRole('button', { name: phone ? 'Start practice' : 'Play Daily Rounds' }).click();
    const entry = page.locator('.solo-controls #answer');
    await entry.waitFor();
    assert.match(await entry.evaluate(e => getComputedStyle(e.form).animationName), /tray-hover/);
    const question = await page.locator('#visible-prompt').innerText();
    const answers = bank.prompts.find(p => p.text === question).answers;
    const answer = answers.reduce((best, next) => best.points >= next.points ? best : next);
    await entry.fill(answer.term);
    await entry.press('Enter');
    const result = page.locator('.floating-result');
    await result.waitFor();
    assert.equal(await result.locator('.result-term').innerText(), answer.term);
    const tier = rarityFor(answer.points);
    assert.equal(await result.getAttribute('data-rarity'), tier.id);
    assert.equal(await result.locator('.result-tier').innerText(), tier.label.toUpperCase());
    const opacity = selector => page.locator(selector).evaluate(el => Number(getComputedStyle(el).opacity));
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.result-term')).opacity) > 0.9);
    assert.equal(await opacity('.result-tier'), 0);
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.result-tier')).opacity) === 1);
    assert.equal(await opacity('.result-term'), 0);
    await page.getByText('More Info', { exact: true }).click();
    await page.reload();
    await page.locator('.floating-result[data-live="no"]').waitFor();
    assert.equal(await opacity('.result-tier'), 1);
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.getByRole('button', { name: 'Next round' }).click();
    await entry.waitFor();
    assert.equal(await entry.evaluate(e => getComputedStyle(e.form).animationName), 'none');
    assert.deepEqual(errors, []);
  });
}
