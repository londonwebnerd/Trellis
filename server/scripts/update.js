#!/usr/bin/env node
/**
 * Update Trellis from a release zip, with an automatic rollback.
 *
 *   sudo npm run update -- /tmp/trellis-1.3.0.zip
 *   sudo npm run update -- --rollback            # back to the previous version
 *
 * What it does:
 *   1. Checks the zip (a Trellis release, newer than what's installed).
 *   2. Backs up the data folder (…-before-update.tar.gz).
 *   3. Stops the service, swaps the code, keeps your data, .env and your own
 *      presets, fixes permissions, starts the service again.
 *   4. Waits for the new version to answer its health check (and the page
 *      to load). If it doesn't within 45 s, puts the previous version back
 *      and starts that instead.
 * The previous version stays next to the install (/opt/trellis.previous)
 * until the next update, for --rollback.
 *
 * Options:
 *   --dir <path>         the install to update (default: the one this script is in)
 *   --service <name>     systemd service(s) to restart (default: trellis; repeatable)
 *   --health <url>       health check(s) (default: http://127.0.0.1:<PORT>/api/health)
 *   --no-restart         only swap the code (restart it yourself, e.g. Docker)
 *   --force              reinstall the same or an older version
 *   --yes                don't ask before starting
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const here = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------- Options ------------------------------- */

const argv = process.argv.slice(2);
const opts = { services: [], health: [], restart: true, force: false, yes: false, rollback: false, dir: null, zip: null };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--dir') opts.dir = argv[++i];
  else if (a === '--service') opts.services.push(argv[++i]);
  else if (a === '--health') opts.health.push(argv[++i]);
  else if (a === '--no-restart') opts.restart = false;
  else if (a === '--force') opts.force = true;
  else if (a === '--yes' || a === '-y') opts.yes = true;
  else if (a === '--rollback') opts.rollback = true;
  else if (a === '--help' || a === '-h') {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?/, '').replace(/^ \* ?/gm, ''));
    process.exit(0);
  } else if (!a.startsWith('--') && !opts.zip) opts.zip = a;
  else fail(`Unknown option: ${a}`);
}

const DIR = path.resolve(opts.dir || path.join(here, '..', '..'));
const PREVIOUS = `${DIR}.previous`;
const STAGING = `${DIR}.update-tmp`;

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}
const step = (message) => console.log(`→ ${message}`);
const ok = (message) => console.log(`✓ ${message}`);

/* ------------------------------- Helpers ------------------------------- */

const isInstall = (dir) => fs.existsSync(path.join(dir, 'server', 'src', 'index.js'));
const versionOf = (dir) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'server', 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
};
const cmpVersion = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};

/** Settings from an install's .env (only what this script needs). */
function envOf(dir) {
  let env = {};
  try {
    env = parseEnv(fs.readFileSync(path.join(dir, '.env'), 'utf8'));
  } catch {
    /* no .env */
  }
  const pick = (k) => process.env[k] ?? env[k];
  const dataDir = path.resolve(dir, pick('DATA_DIR') || path.join('server', 'data'));
  return {
    dataDir,
    backupDir: path.resolve(pick('BACKUP_DIR') || path.join(dataDir, 'backups')),
    port: Number(pick('PORT')) || 3001,
    host: pick('HOST') || '127.0.0.1',
  };
}

const inside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
};

const hasSystemd = () => spawnSync('systemctl', ['--version'], { stdio: 'ignore' }).status === 0;
const serviceExists = (name) => {
  const r = spawnSync('systemctl', ['show', '-p', 'LoadState', '--value', name], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() === 'loaded';
};
function systemctl(action, services) {
  for (const s of services) {
    const r = spawnSync('systemctl', [action, s], { stdio: 'inherit' });
    if (r.status !== 0) return false;
  }
  return true;
}

/** Wait until every health URL answers ok (and, if given, with `version`). */
async function waitHealthy(urls, version, seconds = 45) {
  const deadline = Date.now() + seconds * 1000;
  let last = '';
  while (Date.now() < deadline) {
    let all = true;
    for (const url of urls) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.ok) throw new Error(`health check answered ${res.status}`);
        if (version && body.version && body.version !== version) throw new Error(`still running ${body.version}`);
        // The page itself must render too (catches a broken client build).
        const page = await fetch(new URL('/', url), { headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0 (Trellis update check) Chrome/130' }, signal: AbortSignal.timeout(5000) });
        if (page.status !== 200) throw new Error(`the page answered ${page.status}`);
      } catch (err) {
        all = false;
        last = `${url}: ${err.cause?.code || err.message}`;
      }
    }
    if (all) return { ok: true };
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { ok: false, error: last };
}

/** Owner (user name) of a path, for fix-permissions.sh. */
function ownerName(p) {
  try {
    return execFileSync('id', ['-nu', String(fs.statSync(p).uid)], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/** Move what belongs to the site (not the code) from one install to another. */
function carryOver(from, to, env) {
  const moved = [];
  if (fs.existsSync(path.join(from, '.env'))) {
    fs.copyFileSync(path.join(from, '.env'), path.join(to, '.env'));
    fs.chmodSync(path.join(to, '.env'), fs.statSync(path.join(from, '.env')).mode & 0o777);
    moved.push('.env');
  }
  // The data folder, when it lives inside the install (the default).
  const rel = path.relative(DIR, env.dataDir);
  if (inside(env.dataDir, DIR)) {
    const src = path.join(from, rel);
    const dst = path.join(to, rel);
    if (fs.existsSync(src)) {
      fs.rmSync(dst, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.renameSync(src, dst);
      moved.push(rel);
    }
  }
  // Presets you added yourself (files the release doesn't have).
  const presets = path.join(from, 'presets');
  if (fs.existsSync(presets)) {
    for (const name of fs.readdirSync(presets)) {
      const dst = path.join(to, 'presets', name);
      if (!fs.existsSync(dst)) {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.cpSync(path.join(presets, name), dst, { recursive: true });
        moved.push(`presets/${name}`);
      }
    }
  }
  return moved;
}

function fixPermissions(dir, env) {
  if (process.getuid?.() !== 0) return;
  const script = path.join(dir, 'deploy', 'fix-permissions.sh');
  const user = ownerName(env.dataDir);
  if (!fs.existsSync(script) || !user || user === 'root' || !inside(env.dataDir, dir)) {
    // Data elsewhere (multi-site): just make the code root-owned and readable.
    spawnSync('chown', ['-R', 'root:root', dir], { stdio: 'inherit' });
    return;
  }
  spawnSync('sh', [script, dir, user], { stdio: 'inherit' });
}

/** Swap `DIR` and `PREVIOUS` back (data and .env follow). */
function swapBack(env) {
  const failed = `${DIR}.failed`;
  fs.rmSync(failed, { recursive: true, force: true });
  carryOver(DIR, PREVIOUS, env);
  fs.renameSync(DIR, failed);
  fs.renameSync(PREVIOUS, DIR);
  return failed;
}

/* --------------------------------- Main -------------------------------- */

async function main() {
  if (!isInstall(DIR)) fail(`No Trellis install in ${DIR} (use --dir).`);
  const env = envOf(DIR);
  const current = versionOf(DIR);

  let services = opts.services.length ? opts.services : ['trellis'];
  let restart = opts.restart;
  if (restart && !hasSystemd()) {
    console.log('(systemd not found: the code is swapped, but you need to restart the server yourself.)');
    restart = false;
  }
  if (restart) {
    const missing = services.filter((s) => !serviceExists(s));
    if (missing.length && !opts.services.length) {
      console.log(`(No "${missing.join(', ')}" service: restart the server yourself afterwards, or pass --service.)`);
      restart = false;
    } else if (missing.length) fail(`No such service: ${missing.join(', ')}`);
  }
  const healthUrls = opts.health.length ? opts.health : [`http://${env.host === '0.0.0.0' ? '127.0.0.1' : env.host}:${env.port}/api/health`];

  // Writable? (The code is normally owned by root.)
  try {
    fs.accessSync(path.dirname(DIR), fs.constants.W_OK);
    fs.accessSync(DIR, fs.constants.W_OK);
  } catch {
    fail(`Can't write to ${DIR}. Run it with sudo: sudo npm run update -- …`);
  }

  /* ----------------------------- Rollback ----------------------------- */
  if (opts.rollback) {
    if (!isInstall(PREVIOUS)) fail(`There's no previous version in ${PREVIOUS}.`);
    console.log(`Roll back ${DIR} from ${current} to ${versionOf(PREVIOUS)}?`);
    if (!(await confirm())) return;
    if (restart) systemctl('stop', services);
    const failed = swapBack(env);
    fs.rmSync(PREVIOUS, { recursive: true, force: true });
    fs.renameSync(failed, PREVIOUS); // so you can go forward again
    fixPermissions(DIR, env);
    if (restart) {
      systemctl('start', services);
      const health = await waitHealthy(healthUrls, versionOf(DIR));
      if (!health.ok) fail(`Rolled back, but the server isn't answering: ${health.error}. Check: journalctl -u ${services[0]} -n 50`);
    }
    ok(`Back on ${versionOf(DIR)}. (${versionOf(PREVIOUS)} is kept in ${PREVIOUS}.)`);
    return;
  }

  /* ------------------------------ Update ------------------------------ */
  if (!opts.zip) fail('Usage: sudo npm run update -- /path/to/trellis-x.y.z.zip   (or --rollback)');
  const zip = path.resolve(process.env.INIT_CWD || process.cwd(), opts.zip);
  if (!fs.existsSync(zip)) fail(`File not found: ${zip}`);

  step(`Checking ${path.basename(zip)}`);
  const { extractZip } = await import(path.join(here, '..', 'src', 'lib', 'zip.js'));
  fs.rmSync(STAGING, { recursive: true, force: true });
  try {
    extractZip(zip, STAGING);
  } catch (err) {
    fs.rmSync(STAGING, { recursive: true, force: true });
    fail(`Couldn't read the zip: ${err.message}`);
  }
  const tops = fs.readdirSync(STAGING);
  const release = tops.length === 1 ? path.join(STAGING, tops[0]) : STAGING;
  const cleanup = () => fs.rmSync(STAGING, { recursive: true, force: true });
  if (!isInstall(release) || !fs.existsSync(path.join(release, 'client', 'dist', 'index.html'))) {
    cleanup();
    fail('That zip isn\'t a Trellis release (build one with `npm run build`).');
  }
  const next = versionOf(release);
  if (!opts.force && current && cmpVersion(next, current) <= 0) {
    cleanup();
    fail(`${path.basename(zip)} is version ${next}; ${current} is installed. Use --force to install it anyway.`);
  }
  ok(`Trellis ${next} (installed: ${current || 'unknown'})`);
  console.log(`  install: ${DIR}\n  data:    ${env.dataDir}${restart ? `\n  service: ${services.join(', ')}` : ''}`);
  if (!(await confirm('Update now?'))) return cleanup();

  // 1. Backup.
  if (fs.existsSync(path.join(env.dataDir, 'page.json'))) {
    step('Backing up the data folder');
    // lib/backup.js reads its settings when it's loaded: point it at this
    // install's data, then put the environment back as it was (services
    // started from here mustn't inherit it).
    const saved = { DATA_DIR: process.env.DATA_DIR, BACKUP_DIR: process.env.BACKUP_DIR, TRELLIS_ENV_FILE: process.env.TRELLIS_ENV_FILE };
    Object.assign(process.env, { DATA_DIR: env.dataDir, BACKUP_DIR: env.backupDir, TRELLIS_ENV_FILE: 'none' });
    const { createBackup } = await import(path.join(here, '..', 'src', 'lib', 'backup.js'));
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    const result = await createBackup({ dataDir: env.dataDir, dir: env.backupDir, reason: 'before-update', offsite: false });
    if (!result.ok) {
      cleanup();
      fail(`Backup failed, nothing changed: ${result.error}`);
    }
    if (process.getuid?.() === 0) {
      const st = fs.statSync(env.dataDir);
      for (const p of [env.backupDir, path.join(env.backupDir, result.name), path.join(env.backupDir, 'status.json')]) {
        if (fs.existsSync(p)) fs.chownSync(p, st.uid, st.gid);
      }
    }
    ok(`Backup: ${path.join(env.backupDir, result.name)}`);
  }

  // 2. Swap.
  if (restart) {
    step(`Stopping ${services.join(', ')}`);
    systemctl('stop', services);
  }
  step('Installing the new version');
  fs.rmSync(PREVIOUS, { recursive: true, force: true });
  fs.renameSync(DIR, PREVIOUS);
  fs.renameSync(release, DIR);
  cleanup();
  const kept = carryOver(PREVIOUS, DIR, env);
  ok(`Kept: ${kept.join(', ') || 'nothing needed'}`);
  fixPermissions(DIR, env);

  if (!restart) {
    ok(`Installed ${next}. Restart the server now. If anything's wrong: sudo npm run update -- --rollback`);
    return;
  }

  // 3. Start and check.
  step(`Starting ${services.join(', ')}`);
  systemctl('start', services);
  step('Waiting for the health check');
  const health = await waitHealthy(healthUrls, next);
  if (health.ok) {
    ok(`Trellis ${next} is running. The previous version is in ${PREVIOUS} (sudo npm run update -- --rollback to go back).`);
    return;
  }

  // 4. Roll back.
  console.error(`\n✗ ${next} didn't start properly: ${health.error}`);
  console.error(`  Logs: journalctl -u ${services[0]} -n 50`);
  step(`Rolling back to ${current}`);
  systemctl('stop', services);
  const failed = swapBack(env);
  fixPermissions(DIR, env);
  systemctl('start', services);
  const back = await waitHealthy(healthUrls, current);
  if (!back.ok) fail(`Rolled back to ${current}, but it isn't answering either: ${back.error}`);
  console.error(`✓ Rolled back: ${current} is running again. The failed version is in ${failed}.`);
  process.exit(1);
}

async function confirm(question = 'Continue?') {
  if (opts.yes || !process.stdin.isTTY) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [Y/n] `);
  rl.close();
  if (/^n/i.test(answer.trim())) {
    console.log('Nothing changed.');
    return false;
  }
  return true;
}

main().catch((err) => fail(err.stack || err.message));
