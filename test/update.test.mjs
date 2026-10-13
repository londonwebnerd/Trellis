/**
 * `npm run update`: swapping the code while keeping the site's data, .env
 * and own presets; version checks; rollback. (Restarting and the health
 * check need systemd, so this runs with --no-restart.)
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ROOT, tmpDir } from './helpers.mjs';

const SCRIPT = path.join(ROOT, 'server', 'scripts', 'update.js');

/** A pretend release folder: just enough to look like Trellis. */
function makeRelease(dir, version, { client = true } = {}) {
  const w = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  w('server/src/index.js', `// trellis ${version}\n`);
  w('server/package.json', JSON.stringify({ name: '@trellis/server', version }));
  w('package.json', JSON.stringify({ name: 'trellis', version }));
  w('presets/examples/sunset.json', '{}');
  w('deploy/fix-permissions.sh', '#!/bin/sh\n');
  if (client) w('client/dist/index.html', `<!doctype html><title>${version}</title>`);
}

async function zipRelease(version, options) {
  const { default: archiver } = await import('archiver');
  const stage = tmpDir();
  makeRelease(path.join(stage, `trellis-${version}`), version, options);
  const file = path.join(tmpDir(), `trellis-${version}.zip`);
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(file);
    const zip = archiver('zip');
    out.on('close', resolve);
    zip.on('error', reject);
    zip.pipe(out);
    zip.directory(path.join(stage, `trellis-${version}`), `trellis-${version}`);
    zip.finalize();
  });
  return file;
}

const run = (dir, ...args) => spawnSync(process.execPath, [SCRIPT, '--dir', dir, '--no-restart', '--yes', ...args], { encoding: 'utf8', env: { ...process.env, TRELLIS_ENV_FILE: '', DATA_DIR: '', BACKUP_DIR: '' } });
const versionOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'server', 'package.json'), 'utf8')).version;

test('update keeps data, .env and own presets; refuses older versions; rolls back', async () => {
  const base = tmpDir();
  const install = path.join(base, 'trellis');
  makeRelease(install, '1.0.0');
  fs.writeFileSync(path.join(install, '.env'), 'PORT=3999\n', { mode: 0o640 });
  fs.mkdirSync(path.join(install, 'server', 'data', 'uploads'), { recursive: true });
  fs.writeFileSync(path.join(install, 'server', 'data', 'page.json'), '{"profile":{"name":"Mine"},"tiles":[]}');
  fs.writeFileSync(path.join(install, 'server', 'data', 'uploads', 'me.webp'), 'img');
  fs.writeFileSync(path.join(install, 'presets', 'my-own.json'), '{"name":"Mine"}');

  // A newer release installs, keeping everything that belongs to the site.
  const r = run(install, await zipRelease('1.1.0'));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(versionOf(install), '1.1.0');
  assert.equal(fs.readFileSync(path.join(install, '.env'), 'utf8'), 'PORT=3999\n');
  assert.equal(fs.statSync(path.join(install, '.env')).mode & 0o777, 0o640);
  assert.match(fs.readFileSync(path.join(install, 'server', 'data', 'page.json'), 'utf8'), /Mine/);
  assert.ok(fs.existsSync(path.join(install, 'server', 'data', 'uploads', 'me.webp')));
  assert.ok(fs.existsSync(path.join(install, 'presets', 'my-own.json')));
  assert.equal(versionOf(`${install}.previous`), '1.0.0');
  assert.ok(!fs.existsSync(path.join(`${install}.previous`, 'server', 'data')), 'data moved, not copied');
  // …after backing up the data.
  const backups = fs.readdirSync(path.join(install, 'server', 'data', 'backups')).filter((n) => n.endsWith('.tar.gz'));
  assert.equal(backups.length, 1);
  assert.match(backups[0], /before-update/);

  // Same or older versions need --force.
  const older = run(install, await zipRelease('1.0.5'));
  assert.notEqual(older.status, 0);
  assert.match(older.stderr, /--force/);
  assert.equal(versionOf(install), '1.1.0');

  // Not a release: refused, nothing touched.
  const broken = run(install, await zipRelease('2.0.0', { client: false }));
  assert.notEqual(broken.status, 0);
  assert.equal(versionOf(install), '1.1.0');
  assert.ok(!fs.existsSync(`${install}.update-tmp`));

  // Rollback: back to 1.0.0 with the same data; 1.1.0 kept for going forward.
  const back = run(install, '--rollback');
  assert.equal(back.status, 0, back.stdout + back.stderr);
  assert.equal(versionOf(install), '1.0.0');
  assert.equal(versionOf(`${install}.previous`), '1.1.0');
  assert.ok(fs.existsSync(path.join(install, 'server', 'data', 'uploads', 'me.webp')));
  assert.equal(fs.readFileSync(path.join(install, '.env'), 'utf8'), 'PORT=3999\n');
});

test('update refuses a folder that isn’t a Trellis install', () => {
  const r = run(tmpDir(), '/nonexistent.zip');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /No Trellis install/);
});
