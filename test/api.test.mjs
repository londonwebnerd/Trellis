/**
 * API and security tests against a real server with a fresh data folder:
 * what the editor protects, what visitors may see, and the features that
 * rely on the server (conflicts, two-step sign-in, short links, backups).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { PASSWORD, startServer } from './helpers.mjs';

process.env.DATA_DIR ||= path.join(fs.mkdtempSync('/tmp/trellis-unit-'), 'd');
process.env.TRELLIS_ENV_FILE = 'none';
const { totpNow } = await import('../server/src/lib/totp.js');

const hasClient = fs.existsSync(new URL('../client/dist/index.html', import.meta.url));

let s;
let ed; // editor headers

before(async () => {
  s = await startServer();
  ed = await s.login();
});
after(() => s?.stop());

const draft = async () => (await s.api('GET', '/api/draft', { headers: ed })).body;
const publish = (page) => s.api('POST', '/api/draft/publish', { headers: ed, json: page });

describe('access control', () => {
  test('editor endpoints refuse visitors (401)', async () => {
    for (const [m, p] of [
      ['GET', '/api/draft'],
      ['PUT', '/api/draft'],
      ['POST', '/api/draft/publish'],
      ['GET', '/api/inbox'],
      ['GET', '/api/versions'],
      ['GET', '/api/stats'],
      ['DELETE', '/api/stats'],
      ['POST', '/api/uploads'],
      ['GET', '/api/auth/security'],
      ['POST', '/api/auth/2fa/setup'],
      ['GET', '/api/backups'],
      ['POST', '/api/backups'],
      ['GET', '/api/shortlinks'],
      ['POST', '/api/shortlinks'],
      ['PUT', '/api/integrations/newsletter'],
    ]) {
      const r = await s.api(m, p, { headers: { 'X-Requested-With': 'trellis' }, json: m === 'GET' ? undefined : {} });
      assert.equal(r.status, 401, `${m} ${p}`);
    }
  });

  test('writes without the CSRF header are refused (403)', async () => {
    const { page } = await draft();
    const r = await s.api('PUT', '/api/draft', { headers: { Cookie: ed.Cookie }, json: page });
    assert.equal(r.status, 403);
  });

  test('login only works from the secret editor path', async () => {
    const r = await s.api('POST', '/api/auth/login', { headers: { 'X-Requested-With': 'trellis' }, json: { password: PASSWORD, path: '/admin' } });
    assert.equal(r.status, 401);
  });

  test('path traversal never reaches data files', async () => {
    for (const p of ['/uploads/../auth.json', '/uploads/..%2f..%2fauth.json', '/%2e%2e/%2e%2e/etc/passwd', '/api/versions/..%2f..%2fauth']) {
      const r = await s.fetch(p);
      const text = await r.text();
      assert.ok(r.status >= 400, `${p} -> ${r.status}`);
      assert.doesNotMatch(text, /scrypt|"hash"/, p);
    }
  });

  test('//evil.com is not an open redirect', async () => {
    const r = await s.fetch('//evil.com');
    assert.ok(!(r.headers.get('location') || '').includes('evil.com'));
  });

  test('oversized beacon is refused', async () => {
    const r = await s.fetch('/api/collect', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x'.repeat(10_000) });
    assert.equal(r.status, 413);
  });

  test('security headers are present', async () => {
    const r = await s.fetch('/');
    assert.match(r.headers.get('content-security-policy') || '', /script-src 'self' 'nonce-/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  });
});

describe('what visitors get', () => {
  test('names and HTML in the page can’t break out of the shell', { skip: !hasClient && 'client not built' }, async () => {
    const { page } = await draft();
    page.profile.name = '</script><script>alert(1)</script>"\'<img src=x onerror=alert(1)>';
    page.tiles = [{ id: 'txt', type: 'text', w: 2, h: 2, data: { html: '<p>ok<a href="javascript:alert(1)">x</a><img src=x onerror=alert(1)><svg onload=alert(1)></svg></p>' } }];
    assert.equal((await publish(page)).status, 200);
    const html = await (await s.fetch('/')).text();
    assert.doesNotMatch(html, /<\/script><script>alert/);
    assert.doesNotMatch(html, /<img src=x onerror/);
    const pub = (await s.api('GET', '/api/page')).body;
    const stored = pub.tiles.find((t) => t.id === 'txt').data.html;
    assert.doesNotMatch(stored, /javascript:|onerror|<svg|<img/);
  });

  test('code-locked cards: secrets stripped, feeds refused, unlock needs the code', async () => {
    const { page } = await draft();
    page.tiles = [
      { id: 'lockedblog', type: 'blog', w: 2, h: 2, data: { url: 'https://secret-blog.example.com', title: 'Members' }, lock: { type: 'code', code: 'open sesame' } },
      { id: 'lockedgh', type: 'github', w: 2, h: 2, data: { username: 'secretuser' }, lock: { type: 'code', code: 'abc' } },
    ];
    assert.equal((await publish(page)).status, 200);
    const pub = JSON.stringify((await s.api('GET', '/api/page')).body);
    assert.doesNotMatch(pub, /secret-blog|secretuser|open sesame/);
    for (const id of ['lockedblog', 'lockedgh']) assert.equal((await s.api('GET', `/api/feeds/${id}`)).status, 404, id);
    assert.equal((await s.api('POST', '/api/unlock/lockedblog', { json: { code: 'nope' } })).status, 403);
    const ok = await s.api('POST', '/api/unlock/lockedblog', { json: { code: 'open sesame' } });
    assert.equal(ok.status, 200);
    assert.match(JSON.stringify(ok.body), /secret-blog/);
  });

  test('hidden and scheduled cards are not sent to visitors', async () => {
    const { page } = await draft();
    const future = new Date(Date.now() + 864e5).toISOString();
    page.tiles = [
      { id: 'hid', type: 'link', w: 2, h: 1, data: { url: 'https://hidden.example.com', title: 'Hidden' }, visibility: { hidden: true } },
      { id: 'soon', type: 'link', w: 2, h: 1, data: { url: 'https://soon.example.com', title: 'Soon' }, visibility: { showFrom: future } },
      { id: 'vis', type: 'link', w: 2, h: 1, data: { url: 'https://visible.example.com', title: 'Visible' } },
    ];
    await publish(page);
    const ids = (await s.api('GET', '/api/page')).body.tiles.map((t) => t.id);
    assert.deepEqual(ids, ['vis']);
  });

  test('contact form: typos don’t use up the limit; real sends do', async () => {
    const { page } = await draft();
    page.tiles = [{ id: 'cf', type: 'contact', w: 2, h: 2, data: { title: 'Get in touch' } }];
    await publish(page);
    const send = (body) => s.api('POST', '/api/forms/cf/contact', { json: body });
    for (let i = 0; i < 8; i++) assert.equal((await send({ name: 'Ann', email: 'ann@localhost', message: 'Hi there' })).status, 400);
    for (let i = 0; i < 5; i++) assert.equal((await send({ name: 'Ann', email: 'ann@example.com', message: `Hello ${i}` })).status, 204);
    assert.equal((await send({ name: 'Ann', email: 'ann@example.com', message: 'One too many' })).status, 429);
  });

  test('unknown addresses get the 404 page, even with a preview image set', { skip: !hasClient && 'client not built' }, async () => {
    const { page } = await draft();
    page.settings.shareImage = '/uploads/preview.webp';
    page.profile.avatar = '/uploads/avatar.webp';
    await publish(page);
    const r = await s.fetch('/this-does-not-exist', { headers: { Accept: 'text/html' } });
    assert.equal(r.status, 404);
    assert.match(r.headers.get('content-type'), /html/);
    assert.equal((await s.fetch('/?unknown=1', { headers: { Accept: 'text/html' } })).status, 404);
    assert.equal((await s.fetch('/missing.js')).status, 404);
  });

  test('health check: version only for the server itself', async () => {
    assert.ok((await s.api('GET', '/api/health')).body.version);
    const proxied = await s.api('GET', '/api/health', { headers: { 'X-Forwarded-For': '203.0.113.9' } });
    assert.equal(proxied.body.version, undefined);
    for (const h of ['Forwarded', 'X-Real-IP', 'CF-Connecting-IP', 'X-Forwarded-Host']) {
      const r = await s.api('GET', '/api/health', { headers: { [h]: '203.0.113.9' } });
      assert.equal(r.body.version, undefined, h);
    }
    // A same-host proxy that passes the public Host along (fetch can't set Host).
    const http = await import('node:http');
    const body = await new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: s.port, path: '/api/health', headers: { Host: 'example.com' } }, (res) => {
        let t = '';
        res.on('data', (d) => (t += d));
        res.on('end', () => resolve(JSON.parse(t)));
      }).on('error', reject);
    });
    assert.equal(body.ok, true);
    assert.equal(body.version, undefined);
  });
});

describe('search engines, AI crawlers and agents', () => {
  const GOOGLE = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
  const GPT = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot';
  const GEMINI = 'Mozilla/5.0 (compatible; Gemini-Deep-Research)';
  const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';
  const SIGNED = { 'Signature-Agent': '"https://chatgpt.com"', 'Signature-Input': 'sig1=("@authority");tag="web-bot-auth"', Signature: 'sig1=:x:' };
  const setPrivacy = async (privacy) => {
    const { page } = await draft();
    page.settings = { ...page.settings, noindex: false, blockAI: false, allowPreviews: false, ...privacy };
    assert.equal((await publish(page)).status, 200);
  };
  const get = (path, ua, headers = {}) => s.fetch(path, { headers: { 'User-Agent': ua, Accept: 'text/html', ...headers } });
  after(() => setPrivacy({}));

  test('hidden: crawlers, scripts and agents are refused everywhere; people get the page marked noindex', async () => {
    await setPrivacy({ noindex: true });
    for (const path of ['/', '/api/page', '/manifest.webmanifest', '/nope']) {
      for (const [ua, extra] of [[GOOGLE], [GPT], [GEMINI], ['curl/8.5.0'], [''], [CHROME, SIGNED], [CHROME, { 'Sec-Ch-Ua': '"HeadlessChrome";v="138"' }]]) {
        const r = await get(path, ua, extra);
        assert.equal(r.status, 403, `${path} ${ua || '(no UA)'} ${extra ? Object.keys(extra)[0] : ''}`);
        assert.match(r.headers.get('x-robots-tag'), /noindex/);
      }
    }
    const page = await get('/', CHROME);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('x-robots-tag'), /noindex/);
    if (hasClient) assert.match(await page.text(), /<meta name="robots" content="noindex/);
    // robots.txt: AI bots and archives disallowed; search engines may ask (and get 403 + noindex).
    const robots = await (await get('/robots.txt', GOOGLE)).text();
    assert.match(robots, /User-agent: GPTBot[\s\S]*?Disallow: \//);
    assert.match(robots, /User-agent: ia_archiver[\s\S]*?Disallow: \//);
    assert.match(robots, /User-agent: \*\nDisallow:\n/);
    assert.equal((await get('/sitemap.xml', CHROME)).status, 404);
  });

  test('hidden with link previews: chat apps may fetch, search engines still may not', async () => {
    await setPrivacy({ noindex: true, allowPreviews: true });
    assert.equal((await get('/', 'WhatsApp/2.23.20.0')).status, 200);
    assert.equal((await get('/', GOOGLE)).status, 403);
  });

  test('block AI only: AI crawlers and signed agents refused, search engines and people allowed', async () => {
    await setPrivacy({ blockAI: true });
    for (const ua of [GPT, GEMINI, 'Manus-User/1.0', 'Mozilla/5.0 (compatible; Google-Agent)', 'DeepSeekBot/1.0']) assert.equal((await get('/', ua)).status, 403, ua);
    assert.equal((await get('/', CHROME, SIGNED)).status, 403, 'signed agent');
    assert.equal((await get('/', GOOGLE)).status, 200);
    const people = await get('/', CHROME);
    assert.equal(people.status, 200);
    assert.match(people.headers.get('x-robots-tag'), /noai/);
  });

  test('the editor is refused to every bot, whatever the settings', async () => {
    await setPrivacy({});
    for (const [ua, extra] of [[GOOGLE], [GEMINI], [CHROME, SIGNED]]) assert.equal((await get(s.adminPath, ua, extra)).status, 403, ua);
    assert.equal((await get(s.adminPath, CHROME)).status, hasClient ? 200 : 404);
  });
});

describe('statistics', () => {
  const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
  const beacon = (body, headers = {}) => s.fetch('/api/collect', { method: 'POST', headers: { 'Content-Type': 'text/plain', 'User-Agent': CHROME, ...headers }, body: JSON.stringify(body) });

  test('counts people; skips bots, agents, Do Not Track, the editor and other sites', async () => {
    const { page } = await draft();
    page.settings = { ...page.settings, analytics: true, noindex: false, blockAI: false };
    page.tiles = [{ id: 'st1', type: 'link', w: 2, h: 1, data: { url: 'https://example.com', title: 'Example' } }];
    await publish(page);
    assert.equal((await s.api('DELETE', '/api/stats', { headers: ed })).status, 204);
    const origin = s.url;
    await beacon({ type: 'view', referrer: 'https://www.instagram.com/x', utm: { source: 'newsletter' } }, { Origin: origin, 'Accept-Language': 'fr-FR' });
    await beacon({ type: 'view' }, { 'User-Agent': IPHONE, Origin: origin });
    await beacon({ type: 'click', tile: 'st1' }, { Origin: origin });
    // Not counted:
    await beacon({ type: 'view' }, { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' });
    await beacon({ type: 'view' }, { 'Signature-Agent': '"https://chatgpt.com"' });
    await beacon({ type: 'view' }, { DNT: '1' });
    await beacon({ type: 'view' }, { 'Sec-GPC': '1' });
    await beacon({ type: 'view' }, { Origin: 'https://evil.example' });
    await beacon({ type: 'view' }, { Cookie: ed.Cookie });
    await beacon({ type: 'click', tile: 'not-a-card' });
    const { body } = await s.api('GET', '/api/stats?days=7', { headers: ed });
    assert.deepEqual(body.totals, { views: 2, visitors: 2, clicks: 1 });
    assert.deepEqual(body.referrers, [{ key: 'instagram.com', count: 1 }]);
    assert.deepEqual(body.utm.source, [{ key: 'newsletter', count: 1 }]);
    assert.deepEqual(body.devices.map((d) => d.key).sort(), ['Desktop', 'Mobile']);
    assert.equal(body.tiles[0].count, 1);
  });

  test('reloading or re-clicking all day does not inflate the numbers', async () => {
    await s.api('DELETE', '/api/stats', { headers: ed });
    const ua = { 'User-Agent': `${CHROME} Reloader/1` };
    for (let i = 0; i < 25; i++) await beacon({ type: 'view' }, ua);
    for (let i = 0; i < 25; i++) await beacon({ type: 'click', tile: 'st1' }, ua);
    const { body } = await s.api('GET', '/api/stats?days=7', { headers: ed });
    assert.deepEqual(body.totals, { views: 1, visitors: 1, clicks: 1 });
  });

  test('turned off: nothing is counted', async () => {
    const { page } = await draft();
    page.settings = { ...page.settings, analytics: false };
    await publish(page);
    await s.api('DELETE', '/api/stats', { headers: ed });
    await beacon({ type: 'view' });
    assert.equal((await s.api('GET', '/api/stats?days=7', { headers: ed })).body.totals.views, 0);
    page.settings.analytics = true;
    await publish(page);
  });
});

describe('two tabs editing', () => {
  test('a stale save gets 409 with the newer version; a fresh one goes through', async () => {
    const d = await draft();
    assert.ok(d.revision);
    const a = await s.api('PUT', '/api/draft', { headers: { ...ed, 'X-Base-Revision': d.revision }, json: { ...d.page, profile: { ...d.page.profile, name: 'Tab A' } } });
    assert.equal(a.status, 200);
    assert.notEqual(a.body.revision, d.revision);
    const b = await s.api('PUT', '/api/draft', { headers: { ...ed, 'X-Base-Revision': d.revision }, json: { ...d.page, profile: { ...d.page.profile, name: 'Tab B' } } });
    assert.equal(b.status, 409);
    assert.equal(b.body.code, 'conflict');
    assert.equal(b.body.page.profile.name, 'Tab A');
    const stalePublish = await s.api('POST', '/api/draft/publish', { headers: { ...ed, 'X-Base-Revision': d.revision }, json: d.page });
    assert.equal(stalePublish.status, 409);
    const c = await s.api('PUT', '/api/draft', { headers: { ...ed, 'X-Base-Revision': b.body.revision }, json: { ...d.page, profile: { ...d.page.profile, name: 'Tab B wins' } } });
    assert.equal(c.status, 200);
    assert.equal((await draft()).page.profile.name, 'Tab B wins');
    assert.equal((await s.api('GET', '/api/draft/revision', { headers: ed })).body.revision, c.body.revision);
  });

  test('two saves at the same instant: exactly one wins', async () => {
    const d = await draft();
    const save = (name) => s.api('PUT', '/api/draft', { headers: { ...ed, 'X-Base-Revision': d.revision }, json: { ...d.page, profile: { ...d.page.profile, name } } });
    const results = await Promise.all([save('Race A'), save('Race B'), save('Race C')]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409]);
    const winner = results.find((r) => r.status === 200);
    assert.equal((await s.api('GET', '/api/draft/revision', { headers: ed })).body.revision, winner.body.revision);
  });

  test('saves without a revision (scripts) still work', async () => {
    const d = await draft();
    assert.equal((await s.api('PUT', '/api/draft', { headers: ed, json: d.page })).status, 200);
  });
});

describe('short links', () => {
  test('create, redirect, count, rename, delete', async () => {
    const add = await s.api('POST', '/api/shortlinks', { headers: ed, json: { slug: '/CV', url: 'example.com/cv.pdf', note: 'business cards' } });
    assert.equal(add.status, 201);
    assert.equal(add.body.link.slug, 'cv');
    assert.equal(add.body.link.url, 'https://example.com/cv.pdf');

    const r = await s.fetch('/cv');
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), 'https://example.com/cv.pdf');
    assert.match(r.headers.get('cache-control'), /no-store/);
    assert.equal((await s.fetch('/CV/')).status, 302);
    // Bots and the signed-in editor are redirected but not counted.
    await s.fetch('/cv', { headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' } });
    await s.fetch('/cv', { headers: { Cookie: ed.Cookie } });
    let list = (await s.api('GET', '/api/shortlinks', { headers: ed })).body.links;
    assert.equal(list[0].clicks, 2);

    const renamed = await s.api('PUT', '/api/shortlinks/cv', { headers: ed, json: { slug: 'resume', url: 'https://example.com/new.pdf' } });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.link.clicks, 2);
    assert.equal((await s.fetch('/cv', { headers: { Accept: 'text/html' } })).status, 404);
    assert.equal((await s.fetch('/resume')).headers.get('location'), 'https://example.com/new.pdf');

    const stats = (await s.api('GET', '/api/stats?days=7', { headers: ed })).body;
    assert.deepEqual(stats.shortLinks.find((x) => x.key === 'cv'), { key: 'cv', count: 2 });

    assert.equal((await s.api('DELETE', '/api/shortlinks/resume', { headers: ed })).status, 200);
    list = (await s.api('GET', '/api/shortlinks', { headers: ed })).body.links;
    assert.equal(list.length, 0);
  });

  test('refuses reserved names, the editor path and unsafe targets', async () => {
    for (const slug of ['api', 'uploads', 'assets', 'robots.txt', 'xrpc', '.well-known', s.adminPath.slice(1), 'has space', '-x', 'x'.repeat(65)]) {
      const r = await s.api('POST', '/api/shortlinks', { headers: ed, json: { slug, url: 'https://example.com' } });
      assert.equal(r.status, 400, slug);
    }
    for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', '']) {
      const r = await s.api('POST', '/api/shortlinks', { headers: ed, json: { slug: 'ok', url } });
      assert.equal(r.status, 400, url);
    }
    assert.equal((await s.api('POST', '/api/shortlinks', { headers: ed, json: { slug: 'mail', url: 'mailto:me@example.com' } })).status, 201);
    assert.equal((await s.api('POST', '/api/shortlinks', { headers: ed, json: { slug: 'mail', url: 'https://x.example' } })).status, 400);
  });
});

describe('design presets', () => {
  test('every built-in preset survives the server’s validation unchanged', async () => {
    const { PRESETS, presetPatch } = await import('../client/src/lib/appearance.js');
    assert.ok(PRESETS.length >= 24);
    assert.equal(new Set(PRESETS.map((p) => p.key)).size, PRESETS.length, 'unique keys');
    for (const preset of PRESETS) {
      const patch = presetPatch(preset);
      const r = await s.api('POST', '/api/presets/validate', { headers: ed, json: { name: preset.name, theme: patch.theme, accent: patch.accent, appearance: patch.appearance } });
      assert.equal(r.status, 200, preset.key);
      const { preset: _ignored, ...expected } = patch.appearance;
      for (const [k, v] of Object.entries(expected)) assert.deepEqual(r.body.appearance[k], v, `${preset.key}: ${k}`);
      assert.equal(r.body.accent, patch.accent, preset.key);
    }
  });
});

describe('avatar animation and icon colours', () => {
  test('is saved, applied before first paint, and unknown values fall back to auto', { skip: !hasClient && 'client not built' }, async () => {
    const { page } = await draft();
    page.settings.appearance = { ...page.settings.appearance, avatarEffect: 'ring' };
    await publish(page);
    assert.equal((await s.api('GET', '/api/page')).body.settings.appearance.avatarEffect, 'ring');
    assert.match(await (await s.fetch('/')).text(), /r\.dataset\.avatar="ring"/);
    page.settings.appearance.avatarEffect = '<script>';
    await publish(page);
    assert.equal((await s.api('GET', '/api/page')).body.settings.appearance.avatarEffect, 'auto');
  });

  test('icon colours: saved, pre-painted, unknown values fall back to brand', { skip: !hasClient && 'client not built' }, async () => {
    const { page } = await draft();
    page.settings.appearance = { ...page.settings.appearance, iconStyle: 'mono' };
    await publish(page);
    assert.equal((await s.api('GET', '/api/page')).body.settings.appearance.iconStyle, 'mono');
    assert.match(await (await s.fetch('/')).text(), /r\.dataset\.icons="mono"/);
    page.settings.appearance.iconStyle = 'rainbow';
    await publish(page);
    assert.equal((await s.api('GET', '/api/page')).body.settings.appearance.iconStyle, 'brand');
  });
});

describe('backups', () => {
  test('back up now from the editor: archive without sessions or backups', async () => {
    const r = await s.api('POST', '/api/backups', { headers: ed });
    assert.equal(r.status, 200);
    assert.equal(r.body.backups.length, 1);
    assert.ok(r.body.last.ok);
    const file = path.join(s.dataDir, 'backups', r.body.backups[0].name);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const { readTarGz } = await import('../server/src/lib/tar.js');
    const names = readTarGz(file).map((e) => e.name);
    assert.ok(names.includes('data/page.json'));
    assert.ok(names.includes('data/auth.json'));
    assert.ok(!names.some((n) => n.includes('sessions.json') || n.startsWith('data/backups')));
  });
});

// Last: it signs every other session out.
describe('two-step sign-in and devices', () => {
  test('full flow: setup, code login, replay refused, recovery codes, devices', async () => {
    const setup = await s.api('POST', '/api/auth/2fa/setup', { headers: ed });
    assert.equal(setup.status, 200);
    assert.match(setup.body.uri, /^otpauth:\/\/totp\//);
    const { secret } = setup.body;

    // Wrong password: 403 (not 401, which would sign the editor out).
    assert.equal((await s.api('POST', '/api/auth/2fa/enable', { headers: ed, json: { password: 'wrong-password', code: totpNow(secret) } })).status, 403);
    assert.equal((await s.api('POST', '/api/auth/2fa/enable', { headers: ed, json: { password: PASSWORD, code: '000000' } })).status, 400);
    const on = await s.api('POST', '/api/auth/2fa/enable', { headers: ed, json: { password: PASSWORD, code: totpNow(secret) } });
    assert.equal(on.status, 200);
    assert.equal(on.body.recoveryCodes.length, 10);
    assert.ok(on.body.twoFactor.enabled);
    const stored = fs.readFileSync(path.join(s.dataDir, 'twofactor.json'), 'utf8');
    for (const c of on.body.recoveryCodes) assert.ok(!stored.includes(c), 'recovery codes are stored hashed');

    // Password alone isn't enough any more.
    const noCode = await s.login();
    assert.equal(noCode.status, 401);
    assert.equal(noCode.body.code, 'code_required');
    assert.equal((await s.login({ password: 'wrong-password', code: totpNow(secret) })).status, 401);
    // The code used to turn it on can't be replayed.
    assert.equal((await s.login({ code: totpNow(secret) })).body.code, 'code_invalid');

    // A recovery code works once (any case, with or without dashes).
    const rc = on.body.recoveryCodes[0];
    const withRecovery = await s.login({ code: rc.toUpperCase().replace(/-/g, '') });
    assert.ok(withRecovery.Cookie, 'signed in with a recovery code');
    assert.equal((await s.login({ code: rc })).status, 401);

    // Devices: both sessions listed, the current one marked.
    const sec = (await s.api('GET', '/api/auth/security', { headers: withRecovery })).body;
    assert.equal(sec.sessions.length, 2);
    assert.equal(sec.sessions.filter((x) => x.current).length, 1);
    assert.equal(sec.twoFactor.recoveryLeft, 9);
    assert.ok(sec.signIns.some((e) => !e.ok && e.step === 'code'));
    assert.ok(sec.signIns.some((e) => e.ok && e.step === 'recovery code'));

    // Sign out one device by id, then all others.
    const other = sec.sessions.find((x) => !x.current);
    assert.equal((await s.api('DELETE', `/api/auth/sessions/${other.id}`, { headers: withRecovery })).status, 200);
    assert.equal((await s.api('GET', '/api/draft', { headers: ed })).status, 401, 'signed-out device is refused');
    assert.equal((await s.api('POST', '/api/auth/sessions/others', { headers: withRecovery })).body.signedOut, 0);

    // Turning it off needs the password and a code.
    assert.equal((await s.api('POST', '/api/auth/2fa/disable', { headers: withRecovery, json: { password: PASSWORD, code: '123456' } })).status, 400);
    const off = await s.api('POST', '/api/auth/2fa/disable', { headers: withRecovery, json: { password: PASSWORD, code: on.body.recoveryCodes[1] } });
    assert.equal(off.status, 200);
    assert.equal(off.body.twoFactor.enabled, false);
    assert.ok((await s.login()).Cookie, 'password alone works again');
  });
});
