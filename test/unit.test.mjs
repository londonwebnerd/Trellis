/**
 * Unit tests for the self-contained helpers: archives, two-step codes,
 * S3 request signing.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { tmpDir } from './helpers.mjs';

// The server modules read DATA_DIR when they're loaded.
process.env.DATA_DIR = tmpDir();
process.env.TRELLIS_ENV_FILE = 'none';
const { createTarGz, readTarGz } = await import('../server/src/lib/tar.js');
const { readZip, extractZip } = await import('../server/src/lib/zip.js');
const totp = await import('../server/src/lib/totp.js');
const { signS3 } = await import('../server/src/lib/backup.js');

test('tar.gz: round trip, long names, binary data, skip rules', async () => {
  const src = tmpDir();
  fs.mkdirSync(path.join(src, 'uploads', 'nested'), { recursive: true });
  fs.mkdirSync(path.join(src, 'backups'));
  const bin = crypto.randomBytes(70_000);
  const longName = `${'x'.repeat(150)}.webp`;
  fs.writeFileSync(path.join(src, 'page.json'), '{"a":1}');
  fs.writeFileSync(path.join(src, 'uploads', longName), bin);
  fs.writeFileSync(path.join(src, 'uploads', 'nested', 'émoji ☕.txt'), 'hi');
  fs.writeFileSync(path.join(src, 'backups', 'old.tar.gz'), 'skip me');
  const out = path.join(tmpDir(), 'b.tar.gz');
  const { files } = await createTarGz(src, out, { skip: (rel) => rel.startsWith('backups'), extra: [{ name: 'manifest.json', data: '{}' }] });
  assert.equal(files, 3);
  const entries = readTarGz(out);
  const byName = Object.fromEntries(entries.map((e) => [e.name, e]));
  assert.ok(byName['data/manifest.json']);
  assert.equal(byName['data/page.json'].data.toString(), '{"a":1}');
  assert.ok(byName[`data/uploads/${longName}`].data.equals(bin));
  assert.equal(byName['data/uploads/nested/émoji ☕.txt'].data.toString(), 'hi');
  assert.ok(!entries.some((e) => e.name.includes('backups')));

  // Readable by the system's tar too (where there is one).
  if (spawnSync('tar', ['--version']).status === 0) {
    const listing = execFileSync('tar', ['-tzf', out], { encoding: 'utf8' });
    assert.match(listing, new RegExp(longName));
  }
});

test('tar.gz: refuses unsafe paths', async () => {
  const dir = tmpDir();
  // Hand-made archive containing "../evil" (ustar header + checksum).
  const head = Buffer.alloc(512);
  head.write('data/../evil', 0);
  head.write('0000600\0', 100);
  head.write('00000000001\0', 124);
  head.write('        ', 148);
  head.write('0', 156);
  head.write('ustar\0', 257);
  let sum = 0;
  for (const b of head) sum += b;
  head.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  const body = Buffer.concat([head, Buffer.from('x'), Buffer.alloc(511), Buffer.alloc(1024)]);
  const file = path.join(dir, 'evil.tar.gz');
  fs.writeFileSync(file, (await import('node:zlib')).gzipSync(body));
  assert.throws(() => readTarGz(file), /Unsafe path/);
});

test('zip: reads what archiver writes', async () => {
  const { default: archiver } = await import('archiver');
  const src = tmpDir();
  fs.mkdirSync(path.join(src, 'a', 'b'), { recursive: true });
  fs.writeFileSync(path.join(src, 'a', 'b', 'c.txt'), 'hello');
  fs.writeFileSync(path.join(src, 'run.sh'), '#!/bin/sh\n', { mode: 0o755 });
  const big = crypto.randomBytes(200_000);
  fs.writeFileSync(path.join(src, 'big.bin'), big);
  const file = path.join(tmpDir(), 'x.zip');
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(file);
    const zip = archiver('zip', { zlib: { level: 9 } });
    out.on('close', resolve);
    zip.on('error', reject);
    zip.pipe(out);
    zip.directory(src, 'release-1.0.0');
    zip.finalize();
  });
  const dest = tmpDir();
  assert.equal(extractZip(file, dest), 3);
  assert.equal(fs.readFileSync(path.join(dest, 'release-1.0.0', 'a', 'b', 'c.txt'), 'utf8'), 'hello');
  assert.ok(fs.readFileSync(path.join(dest, 'release-1.0.0', 'big.bin')).equals(big));
  assert.equal(fs.statSync(path.join(dest, 'release-1.0.0', 'run.sh')).mode & 0o111, 0o111);
  assert.ok(readZip(file).some((e) => e.dir));
});

test('totp: RFC 6238 / RFC 4226 test vectors', () => {
  const secret = totp.base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.deepEqual([0, 1, 2].map((c) => totp.hotp(secret, c)), ['755224', '287082', '359152']);
  assert.equal(totp.totpNow(secret, 59_000), '287082');
  assert.equal(totp.totpNow(secret, 1_111_111_109_000), '081804');
  assert.equal(totp.totpNow(secret, 2_000_000_000_000), '279037');
  assert.ok(totp.base32Decode(secret).equals(Buffer.from('12345678901234567890')));
});

test('totp: accepts ±1 step, nothing older or malformed', () => {
  const { secret } = totp.newSecret('example.com');
  const now = Date.now();
  assert.notEqual(totp.matchStep(secret, totp.totpNow(secret, now - 30_000), now), null);
  assert.notEqual(totp.matchStep(secret, totp.totpNow(secret, now + 30_000), now), null);
  assert.equal(totp.matchStep(secret, totp.totpNow(secret, now - 120_000), now), null);
  assert.equal(totp.matchStep(secret, 'abcdef', now), null);
  assert.equal(totp.matchStep(secret, '12345', now), null);
});

test('S3 signature matches AWS’s published example', () => {
  // https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html (GET Object)
  const headers = signS3({
    method: 'GET',
    url: 'https://examplebucket.s3.amazonaws.com/test.txt',
    headers: { range: 'bytes=0-9' },
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    region: 'us-east-1',
    accessKey: 'AKIAIOSFODNN7EXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    date: new Date('2013-05-24T00:00:00Z'),
  });
  assert.equal(
    headers.authorization,
    'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
  );
});

test('pill colours: text on "Follow" pills is readable for any brand colour', async () => {
  const { pillColors } = await import('../client/src/lib/appearance.js');
  const lin = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  const lum = (h) => {
    const n = parseInt(h.slice(1), 16);
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  const expand = (h) => (h.length === 4 ? `#${[...h.slice(1)].map((c) => c + c).join('')}` : h);
  const ratio = (a, b) => {
    const [x, y] = [lum(expand(a)), lum(expand(b))].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  // A sweep of hues and lightnesses, plus real brand colours that used to fail.
  const colours = ['#ff0000', '#1da1f2', '#25d366', '#ff4500', '#e4405f', '#ffcc00', '#00b2ff', '#9146ff', '#ffffff', '#000000'];
  for (let h = 0; h < 360; h += 15) {
    for (const l of [0.3, 0.5, 0.7, 0.85]) {
      const a = Math.min(l, 1 - l);
      const f = (n) => {
        const k = (n + h / 30) % 12;
        return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
      };
      colours.push(`#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`);
    }
  }
  for (const c of colours) {
    const { bg, fg } = pillColors(c);
    assert.ok(ratio(bg, fg) >= 4.5, `${c} → ${bg}/${fg}: ${ratio(bg, fg).toFixed(2)}`);
  }
  assert.deepEqual(pillColors('var(--accent)'), { bg: 'var(--accent)', fg: '#fff' });
});

test('gradient backgrounds decide light or dark text; client and server agree', async () => {
  const client = await import('../client/src/lib/appearance.js');
  const server = await import('../server/src/lib/appearance.js');
  const g = (color1, color2) => ({ background: { type: 'gradient', color1, color2 } });
  for (const [a, expected] of [
    [g('#a1c4fd', '#c2e9fb'), 'light'], // the starting gradient: light even in dark mode
    [g('#07070c', '#1b1840'), 'dark'],
    [g('#ff0080', '#7928ca'), null], // mid-tones follow the Mode setting
    [{ background: { type: 'none' } }, null],
    [{ background: { type: 'image', color1: '#ffffff', color2: '#ffffff' } }, null],
  ]) {
    assert.equal(client.gradientTone(a), expected);
    assert.equal(server.gradientTone(a), expected);
  }
  // No built-in preset changes: each gradient matches its preset's mode.
  for (const p of client.PRESETS) {
    const tone = client.gradientTone(p.appearance);
    if (tone) assert.equal(tone, p.theme, p.key);
  }
});

test('links in text cards are readable for any accent, in light and dark', async () => {
  const client = await import('../client/src/lib/appearance.js');
  const server = await import('../server/src/lib/appearance.js');
  const lin = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  const lum = (h) => {
    const n = parseInt(h.slice(1), 16);
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  const ratio = (x, y) => (Math.max(lum(x), lum(y)) + 0.05) / (Math.min(lum(x), lum(y)) + 0.05);
  for (const accent of ['#ffd60a', '#ffffff', '#000000', '#0a84ff', '#22c55e', '#ff2d55', '#5eead4', '#ff9500']) {
    for (const card of ['#ffffff', '#18181b', '#fdf6e3', '#1e3a8a']) {
      const link = client.readableLink(accent, card);
      assert.equal(server.readableLink(accent, card), link);
      assert.ok(ratio(link, card) >= 4.5, `${accent} on ${card} → ${link}: ${ratio(link, card).toFixed(2)}`);
    }
  }
});

test('bot detection: real browsers (in-app browsers too) are never mistaken for bots', async () => {
  const { isBot, blockReason } = await import('../server/src/lib/robots.js');
  const browsers = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0',
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; Cubot KingKong 9) AppleWebKit/537.36 Chrome/138 Mobile Safari/537.36',
    'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138 Mobile Safari/537.36 Instagram 350.0.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/500.0]',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 OPR/120.0.0.0',
  ];
  for (const ua of browsers) assert.equal(isBot(ua, { 'sec-ch-ua': '"Chromium";v="138", "Google Chrome";v="138"' }), false, ua);
  // Search engines aren't AI: "Block AI" alone leaves them alone.
  assert.equal(blockReason('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', { blockAI: true }), null);
  assert.equal(blockReason('Applebot/0.1', { blockAI: true }), null);
});
