/**
 * Browser tests (Chrome/Chromium via playwright-core): the public page at
 * phone/tablet/desktop widths, the 404 page, signing in, editing and
 * publishing, two tabs at once, and an accessibility audit (axe-core).
 *
 * Skipped when no Chrome/Chromium is found. Set CHROME_PATH to point at one.
 * Needs the client to be built (`npm test` builds it first).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { after, before, describe, test } from 'node:test';
import { launchBrowser, PASSWORD, ROOT, startServer, UA } from './helpers.mjs';

const require = createRequire(import.meta.url);
const hasClient = fs.existsSync(`${ROOT}/client/dist/index.html`);
const browser = hasClient ? await launchBrowser() : null;
const skip = !hasClient ? 'client not built (run `npm test`)' : !browser ? 'no Chrome/Chromium found (set CHROME_PATH)' : false;

let s;
let ed;

/** The text card from a real page: bold across lines made <strong><p>…</p></strong>. */
const MESSY_HTML =
  '<h3>About me</h3><p>Hi, I’m<strong> </strong>Andrew<strong>. </strong>I build things.</p><ul><li>One</li></ul><strong><strong><p><strong><strong><br></strong></strong></p>Why I built this page</strong></strong><p><strong><br></strong></p><p>I didn’t want…</p>';

before(async () => {
  if (skip) return;
  s = await startServer();
  ed = await s.login();
  const { page } = (await s.api('GET', '/api/draft', { headers: ed })).body;
  page.profile.name = 'Test Person';
  page.profile.bio = 'Testing Trellis';
  page.settings.accent = '#22c55e'; // light accent: text on it must turn dark
  page.settings.appearance = { ...page.settings.appearance, buttonFill: 'solid' };
  page.tiles = [
    { id: 'h1', type: 'heading', w: 4, h: 1, data: { text: 'Find me online' } },
    { id: 'l1', type: 'link', w: 2, h: 1, data: { url: 'https://example.com', title: 'Example' } },
    { id: 't1', type: 'text', w: 2, h: 3, data: { html: MESSY_HTML } },
    { id: 'c1', type: 'contact', w: 2, h: 2, data: { title: 'Get in touch' } },
  ];
  const r = await s.api('POST', '/api/draft/publish', { headers: ed, json: page });
  assert.equal(r.status, 200);
});

after(async () => {
  await browser?.close();
  await s?.stop();
});

async function open(path, { width = 1280, height = 900, storage } = {}) {
  // bypassCSP: lets the test inject axe-core (the site's CSP rightly blocks it).
  const context = await browser.newContext({ viewport: { width, height }, userAgent: UA, bypassCSP: true, ...(storage && { storageState: storage }) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto(s.url + path);
  return { page, context, errors };
}

/** axe-core violations of at least `serious` impact, minus `ignore`d rules. */
async function audit(page, { ignore = [] } = {}) {
  // Let entrance fades finish: half-faded text would fail the contrast check.
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const result = await page.evaluate(async () => window.axe.run(document, { resultTypes: ['violations'] }));
  return result.violations
    .filter((v) => ['serious', 'critical'].includes(v.impact) && !ignore.includes(v.id))
    .map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`);
}

/** Wait until the server's draft has this name (more reliable than the save indicator). */
async function draftNameIs(name, timeout = 10_000) {
  const end = Date.now() + timeout;
  for (;;) {
    const current = (await s.api('GET', '/api/draft', { headers: ed })).body.page.profile.name;
    if (current === name) return;
    if (Date.now() > end) throw new Error(`draft name is "${current}", expected "${name}"`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function signIn(page) {
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForSelector('.toolbar');
}

describe('public page', { skip }, () => {
  for (const [name, width, height] of [
    ['phone', 375, 812],
    ['tablet', 820, 1180],
    ['desktop', 1440, 900],
  ]) {
    test(`renders on a ${name} without errors or sideways scrolling`, async () => {
      const { page, context, errors } = await open('/', { width, height });
      await page.waitForSelector('.tile-cell');
      assert.equal(await page.textContent('h1'), 'Test Person');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `page scrolls sideways by ${overflow}px`);
      assert.deepEqual(errors, []);
      await context.close();
    });
  }

  test('text cards with messy saved HTML render cleanly', async () => {
    const { page, context } = await open('/');
    const html = await page.innerHTML('.type-text .rich-text');
    assert.doesNotMatch(html, /<strong><p>|<strong><strong>/);
    assert.match(html, /<p><strong>Why I built this page<\/strong><\/p>/);
    await context.close();
  });

  test('accent buttons keep readable text; headings aren’t styled as buttons', async () => {
    const { page, context } = await open('/');
    const color = await page.$eval('.type-link', (el) => getComputedStyle(el).color);
    assert.equal(color, 'rgb(17, 17, 17)', 'dark text on a light green accent');
    const headingBg = await page.$eval('.type-heading', (el) => getComputedStyle(el).backgroundColor);
    assert.equal(headingBg, 'rgba(0, 0, 0, 0)');
    await context.close();
  });

  test('text over an animated background gets a readable halo', async () => {
    const { page: draftPage } = (await s.api('GET', '/api/draft', { headers: ed })).body;
    const original = structuredClone(draftPage.settings.appearance);
    draftPage.settings.appearance.background = { ...draftPage.settings.appearance.background, effect: 'grid' };
    await s.api('POST', '/api/draft/publish', { headers: ed, json: draftPage });
    const { page, context } = await open('/');
    assert.equal(await page.getAttribute('html', 'data-backdrop'), 'busy');
    assert.notEqual(await page.$eval('.profile__bio', (el) => getComputedStyle(el).textShadow), 'none');
    await context.close();
    draftPage.settings.appearance = original;
    await s.api('POST', '/api/draft/publish', { headers: ed, json: draftPage });
    const plain = await open('/');
    assert.equal(await plain.page.getAttribute('html', 'data-backdrop'), 'plain');
    assert.equal(await plain.page.$eval('.profile__bio', (el) => getComputedStyle(el).textShadow), 'none');
    await plain.context.close();
  });

  test('icon colour styles restyle the page’s logos but not the editor’s menus', async () => {
    const { page: draftPage } = (await s.api('GET', '/api/draft', { headers: ed })).body;
    const original = structuredClone(draftPage.settings.appearance);
    draftPage.settings.appearance.iconStyle = 'mono';
    await s.api('POST', '/api/draft/publish', { headers: ed, json: draftPage });
    const { page, context } = await open('/');
    const [bg, text] = await page.$eval('.type-link .brand-badge, .layout .brand-badge', (el) => [getComputedStyle(el).backgroundColor, getComputedStyle(document.documentElement).getPropertyValue('--text')]);
    assert.notEqual(bg, 'rgba(0, 0, 0, 0)');
    assert.ok(text, 'theme has a text colour');
    await context.close();
    draftPage.settings.appearance = original;
    await s.api('POST', '/api/draft/publish', { headers: ed, json: draftPage });
  });

  test('passes the accessibility audit (public page, contact form, 404)', async () => {
    const { page, context } = await open('/');
    await page.waitForSelector('.tile-cell');
    assert.deepEqual(await audit(page), []);
    await page.click('.type-contact button, .type-contact a');
    await page.waitForSelector('dialog[open]');
    assert.deepEqual(await audit(page), []);
    await page.goto(`${s.url}/no-such-page`);
    await page.waitForSelector('.not-found');
    assert.deepEqual(await audit(page), []);
    await context.close();
  });
});

describe('cards that can’t be shown as saved', { skip }, () => {
  test('unfinished cards are hidden from visitors; sizes a type can’t have are corrected', async () => {
    const { page: before } = (await s.api('GET', '/api/draft', { headers: ed })).body;
    const tiles = [
      ...before.tiles,
      { id: 'nofile', type: 'file', w: 2, h: 2, data: {} },
      { id: 'tt', type: 'tiktok', w: 4, h: 1, data: { url: 'https://www.tiktok.com/@scout2015/video/6718335390845095173' } },
      { id: 'vm', type: 'vimeo', w: 1, h: 1, data: { url: 'https://vimeo.com/76979871' } },
    ];
    assert.equal((await s.api('POST', '/api/draft/publish', { headers: ed, json: { ...before, tiles } })).status, 200);
    const { page, context, errors } = await open('/');
    await page.waitForSelector('[data-tile-id="tt"]');
    assert.equal(await page.locator('[data-tile-id="nofile"]').isVisible(), false, 'empty file card hidden');
    assert.match(await page.getAttribute('[data-tile-id="tt"]', 'class'), /\bh-3\b/, 'TikTok at least 3 rows');
    assert.match(await page.getAttribute('[data-tile-id="vm"]', 'class'), /\bw-2 h-2\b/, 'Vimeo at least 2 × 2');
    assert.deepEqual(errors, []);
    await context.close();
    await s.api('POST', '/api/draft/publish', { headers: ed, json: before });
  });
});

describe('tablets, galleries and gradients', { skip }, () => {
  test('tablet widths keep desktop-sized cards; photo grids have no gaps; light gradients get dark text', async () => {
    const { page: before } = (await s.api('GET', '/api/draft', { headers: ed })).body;
    const photo = fs.readFileSync(`${ROOT}/docs/images/page-notebook.jpg`);
    const up = await s.fetch('/api/uploads', { method: 'POST', headers: { ...ed, 'Content-Type': 'image/jpeg' }, body: photo });
    const { url } = await up.json();
    const images = Array.from({ length: 5 }, () => ({ src: url }));
    const settings = {
      ...before.settings,
      theme: 'dark', // dark mode on the (light) starting gradient
      appearance: { ...before.settings.appearance, background: { ...before.settings.appearance.background, type: 'gradient', color1: '#a1c4fd', color2: '#c2e9fb' } },
    };
    const tiles = [...before.tiles, { id: 'g5', type: 'gallery', w: 2, h: 4, data: { mode: 'grid', images } }, { id: 'g2', type: 'gallery', w: 1, h: 4, data: { mode: 'grid', images: images.slice(0, 2) } }];
    assert.equal((await s.api('POST', '/api/draft/publish', { headers: ed, json: { ...before, settings, tiles } })).status, 200);
    const { page, context, errors } = await open('/', { width: 1024, height: 768 });
    await page.waitForSelector('[data-tile-id="g5"] img');
    assert.ok((await page.locator('.tile-grid').boundingBox()).width <= 800, 'grid no wider than on a laptop');
    const fill = await page.evaluate(() => [...document.querySelectorAll('.gallery--grid')].map((g) => {
      const r = g.getBoundingClientRect();
      return [...g.children].reduce((a, k) => a + k.getBoundingClientRect().width * k.getBoundingClientRect().height, 0) / (r.width * r.height);
    }));
    for (const f of fill) assert.ok(f > 0.95, `photo grid filled ${(f * 100).toFixed(0)}%`);
    const tall = await page.locator('[data-tile-id="g2"] .gallery--grid > *').first().boundingBox();
    assert.ok(tall.width >= tall.height * 0.9, `two photos in a tall card are stacked, not thin strips (${Math.round(tall.width)}×${Math.round(tall.height)})`);
    assert.equal(await page.getAttribute('html', 'data-theme'), 'light', 'light gradient → light colours');
    assert.deepEqual(errors, []);
    await context.close();
    await s.api('POST', '/api/draft/publish', { headers: ed, json: before });
  });
});

describe('editor', { skip }, () => {
  test('sign in, edit, publish', async () => {
    const { page, context, errors } = await open(s.adminPath);
    assert.deepEqual(await audit(page), [], 'sign-in screen');
    await signIn(page);
    await page.fill('textarea[aria-label="Name"]', 'Edited Name');
    await draftNameIs('Edited Name');
    await page.waitForSelector('.save-status--saved', { timeout: 10_000 });
    await page.click('.toolbar__publish');
    await page.waitForSelector('.toast:has-text("Published")');
    const live = (await s.api('GET', '/api/page')).body;
    assert.equal(live.profile.name, 'Edited Name');
    assert.deepEqual(errors, []);
    await context.close();
  });

  test('editor passes the accessibility audit (known drag-and-drop grid issues aside)', async () => {
    const { page, context } = await open(s.adminPath);
    await signIn(page);
    // Cards are list items (not buttons) even though they're drag handles.
    const ignore = [];
    assert.deepEqual(await audit(page, { ignore }), []);
    for (const label of ['Short links', 'Sign-in & security', 'Statistics']) {
      await page.click('button[aria-label="More"]');
      await page.click(`[role=menuitem]:has-text("${label}")`);
      await page.waitForSelector('dialog[open] .modal__body, dialog[open]');
      await page.waitForTimeout(300);
      assert.deepEqual(await audit(page, { ignore }), [], label);
      await page.keyboard.press('Escape');
    }
    await context.close();
  });

  test('Design → Buttons: says when no card is button-size, converts link cards in one undoable step', async () => {
    const { page: before } = (await s.api('GET', '/api/draft', { headers: ed })).body;
    const { page, context } = await open(s.adminPath);
    await signIn(page);
    await page.click('button[aria-label="Design"]');
    await page.waitForSelector('.buttons-convert');
    assert.match(await page.textContent('section:has(.buttons-convert) .field__help'), /button-size/);
    await page.click('.buttons-convert');
    const end = Date.now() + 10_000;
    let tiles;
    do {
      tiles = (await s.api('GET', '/api/draft', { headers: ed })).body.page.tiles;
      if (tiles.find((t) => t.type === 'link')?.h === 1) break;
      await new Promise((r) => setTimeout(r, 100));
    } while (Date.now() < end);
    assert.equal(tiles.find((t) => t.type === 'link').h, 1, 'link card became a button');
    assert.equal(tiles.find((t) => t.type === 'text').h, before.tiles.find((t) => t.type === 'text').h, 'text card unchanged');
    await context.close();
    await s.api('POST', '/api/draft/publish', { headers: ed, json: before });
  });

  test('publishing while an autosave is on its way is not mistaken for another tab', async () => {
    const { page, context, errors } = await open(s.adminPath);
    await signIn(page);
    // A slow connection: each autosave takes a second and a half.
    await page.route('**/api/draft', async (route) => {
      if (route.request().method() === 'PUT') await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.fill('textarea[aria-label="Name"]', 'Published mid-save');
    await page.waitForSelector('.toolbar:has-text("Saving")', { timeout: 10_000 });
    await page.click('.toolbar__publish');
    await page.waitForSelector('.toast:has-text("Published")', { timeout: 10_000 });
    assert.equal(await page.locator('dialog[open]:has-text("Edited in another tab")').count(), 0);
    assert.equal((await s.api('GET', '/api/page')).body.profile.name, 'Published mid-save');
    assert.deepEqual(errors, []);
    await context.close();
  });

  test('two tabs: the stale one asks before overwriting', async () => {
    const one = await open(s.adminPath);
    await signIn(one.page);
    const storage = await one.context.storageState();
    const two = await open(s.adminPath, { storage });
    await two.page.waitForSelector('.toolbar');
    await two.page.fill('textarea[aria-label="Name"]', 'From tab two');
    await draftNameIs('From tab two');

    await one.page.fill('textarea[aria-label="Name"]', 'From tab one');
    await one.page.waitForSelector('dialog[open]:has-text("Edited in another tab")', { timeout: 10_000 });
    assert.equal((await s.api('GET', '/api/draft', { headers: ed })).body.page.profile.name, 'From tab two', 'nothing was overwritten');
    await one.page.click('button:has-text("Load the other version")');
    assert.equal(await one.page.inputValue('textarea[aria-label="Name"]'), 'From tab two');
    // Undo (in the toast) brings this tab's edit back, and it saves normally again.
    await one.page.click('.toast button:has-text("Undo")');
    assert.equal(await one.page.inputValue('textarea[aria-label="Name"]'), 'From tab one');
    await draftNameIs('From tab one');
    await one.context.close();
    await two.context.close();
  });
});
