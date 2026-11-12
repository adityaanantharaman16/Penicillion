import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from 'playwright-core';

const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:4320';
const release = JSON.parse(await readFile(new URL('../../content/release.json', import.meta.url)));
const menuName = { name: 'Menu', exact: true };
const dialogName = { name: 'The Culture Room menu', exact: true };
const sizes = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'phone', viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true },
];

async function openMenu(page) {
  await page.getByRole('button', menuName).click();
  const dialog = page.getByRole('dialog', dialogName);
  await dialog.waitFor();
  return dialog;
}

function recordErrors(page, errors) {
  page.setDefaultTimeout(10_000);
  page.on('pageerror', (error) => errors.push(error.message));
}

for (const { name, ...options } of sizes) {
  test(name + ' menu contains navigation, traps focus and closes without rerendering the current route', { timeout: 30_000 }, async (t) => {
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage(options);
    const errors = [];
    recordErrors(page, errors);
    await page.goto(origin + '/#practice');
    await page.getByRole('button', { name: 'Start practice', exact: true }).waitFor();
    const originalMain = await page.locator('main').elementHandle();
    const originalStart = await page.getByRole('button', { name: 'Start practice', exact: true }).elementHandle();
    const dialog = await openMenu(page);
    for (const route of ['daily', 'practice', 'party', 'archive', 'history', 'boards', 'friends', 'account', 'rules', 'about']) {
      assert.equal(await dialog.locator('a[href="#' + route + '"]').count(), 1, route + ' should be reachable from the menu');
    }
    assert.equal(await dialog.locator('a[href="#practice"]').getAttribute('aria-current'), 'page');
    assert.ok(await dialog.getByRole('button', { name: 'Settings', exact: true }).isVisible());
    assert.ok(await dialog.getByRole('button', { name: 'Toggle sound', exact: true }).isVisible());
    assert.ok(await dialog.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
    }), 'the menu should fit inside the viewport');

    // Exercise both boundaries with real keyboard input, not a synthetic focus event.
    const focusable = dialog.locator('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]');
    const visible = [];
    for (let i = 0; i < await focusable.count(); i++) {
      if (await focusable.nth(i).isVisible()) visible.push(focusable.nth(i));
    }
    assert.ok(visible.length > 2);
    const first = visible[0], last = visible.at(-1);
    await first.focus();
    await page.keyboard.press('Shift+Tab');
    assert.ok(await last.evaluate((element) => element === document.activeElement), 'backwards Tab stays in the dialog');
    await page.keyboard.press('Tab');
    assert.ok(await first.evaluate((element) => element === document.activeElement), 'forwards Tab stays in the dialog');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.ok(await page.getByRole('button', menuName).evaluate((element) => element === document.activeElement));

    await openMenu(page);
    await dialog.getByRole('button', { name: 'Settings', exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'Bench settings', exact: true });
    await settings.waitFor();
    await settings.getByRole('button', { name: 'Done', exact: true }).click();
    await settings.waitFor({ state: 'hidden' });
    assert.ok(await dialog.isVisible());
    assert.ok(await dialog.getByRole('button', { name: 'Settings', exact: true }).evaluate((element) => element === document.activeElement), 'closing Settings should return focus to its menu control');
    await dialog.locator('a[href="#practice"]').click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await originalMain.evaluate((element) => element === document.querySelector('main')), true);
    assert.equal(await originalStart.evaluate((element) => element.isConnected), true, 'choosing the current route should preserve its existing controls');

    await openMenu(page);
    await dialog.locator('a[href="#about"]').click();
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForURL('**/#about');
    await page.getByRole('heading', { name: 'About & FAQ', exact: true }).waitFor();
    assert.match(await page.locator('main').innerText(), /frequently asked|faq|about/i);
    assert.deepEqual(errors, []);
  });

  test(name + ' menu preserves a live solo answer and allows the timer and submission to continue', { timeout: 35_000 }, async (t) => {
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage(options);
    const errors = [];
    recordErrors(page, errors);
    await page.goto(origin + '/#practice');
    await page.getByRole('button', { name: 'Start practice', exact: true }).click();
    const entry = page.locator('#answer');
    await entry.waitFor();
    const originalEntry = await entry.elementHandle();
    const runURL = page.url();
    const prompt = await page.locator('#visible-prompt').innerText();
    const category = release.prompts.find((item) => item.text === prompt);
    assert.ok(category, 'the live practice question should be in the bundled content');
    const answer = category.answers[0];
    await entry.fill(answer.term);
    const remaining = Number(await page.locator('#round-timer').getAttribute('value'));
    const dialog = await openMenu(page);
    await page.waitForFunction((before) => Number(document.querySelector('#round-timer')?.value) <= before - 1, remaining);
    assert.equal(page.url(), runURL);
    assert.ok(await originalEntry.evaluate((element) => element.isConnected));
    assert.equal(await entry.inputValue(), answer.term);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(page.url(), runURL);
    assert.ok(await originalEntry.evaluate((element) => element === document.querySelector('#answer')));
    assert.equal(await entry.inputValue(), answer.term);
    await entry.press('Enter');
    await page.locator('.floating-result .result-term').waitFor();
    assert.equal(await page.locator('.floating-result .result-term').innerText(), answer.term);
    assert.deepEqual(errors, []);
  });
}

test('About and FAQ load without creating a guest session', { timeout: 20_000 }, async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const requests = [], errors = [];
  recordErrors(page, errors);
  await page.route('**/api/session', async (route) => {
    requests.push(route.request().url());
    await route.abort();
  });
  await page.goto(origin + '/#about');
  await page.locator('main h1').waitFor();
  assert.match(await page.locator('main').innerText(), /frequently asked|faq/i);
  assert.deepEqual(requests, [], 'reading About should not require or create a player session');
  assert.deepEqual(errors, []);
});

test('relay messages and its connection remain live while the menu is open', { timeout: 45_000 }, async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const host = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const guest = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
  const errors = [], sockets = [];
  for (const page of [host, guest]) recordErrors(page, errors);
  host.on('websocket', (socket) => {
    const observation = { closed: false };
    sockets.push(observation);
    socket.on('close', () => { observation.closed = true; });
  });
  await host.goto(origin + '/#party');
  await host.getByRole('button', { name: 'Create private room', exact: true }).click();
  await host.getByRole('button', { name: 'Ready', exact: true }).waitFor();
  await host.waitForFunction(() => document.querySelector('[data-connected="true"]'));
  const roomURL = host.url();
  const dialog = await openMenu(host);
  await guest.goto(roomURL);
  await guest.getByRole('button', { name: 'Join room', exact: true }).click();
  await host.waitForFunction(() => document.querySelectorAll('.seat-list li').length === 2);
  assert.ok(await dialog.isVisible(), 'a live roster update should leave the menu open');
  assert.equal(host.url(), roomURL);
  assert.equal(sockets.length, 1, 'opening the menu should retain the existing socket');
  assert.equal(sockets[0].closed, false);
  await host.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await guest.getByRole('button', { name: 'Ready', exact: true }).click();
  await host.getByRole('button', { name: 'Ready', exact: true }).click();
  await host.getByRole('button', { name: 'Start relay', exact: true }).click();
  const prompt = await host.locator('#relay-prompt').innerText();
  const category = release.prompts.find((item) => item.text === prompt);
  assert.ok(category?.answers.length > 1);
  const first = category.answers[0];
  // Different canonical concepts prevent synonyms from counting as the same pass.
  const second = category.answers.find((answer) => answer.id !== first.id);
  assert.ok(second, 'the relay category should allow two different answers');
  await host.getByLabel('Your answer', { exact: true }).fill(first.term);
  await host.getByRole('button', { name: 'Pass slide', exact: true }).click();
  await guest.locator('.ra-seat[data-you][data-active]').waitFor();
  const originalArena = await host.locator('.relay-arena').elementHandle();
  await openMenu(host);
  await guest.getByLabel('Your answer', { exact: true }).fill(second.term);
  await guest.getByRole('button', { name: 'Pass slide', exact: true }).click();
  await host.locator('.ra-seat[data-you][data-active]').waitFor();
  assert.ok(await dialog.isVisible(), 'receiving the slide should not close the menu');
  assert.ok(await dialog.evaluate((element) => element.contains(document.activeElement)), 'the live game should not steal focus from the menu');
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].closed, false);
  assert.ok(await originalArena.evaluate((element) => element.isConnected));
  await host.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.ok(await host.getByLabel('Your answer', { exact: true }).isEnabled());
  assert.equal(host.url(), roomURL);
  assert.deepEqual(errors, []);
});
