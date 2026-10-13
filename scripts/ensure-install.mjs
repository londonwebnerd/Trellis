#!/usr/bin/env node
/**
 * First step of `npm run build`: make sure the installed packages match
 * package-lock.json. After pulling changes that add a dependency, an old
 * node_modules would otherwise make the build (or the release zip) fail
 * halfway. If anything is missing or the lock file is newer than the last
 * install, this runs `npm install` once, then the build carries on.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = path.join(ROOT, 'package-lock.json');
const installed = path.join(ROOT, 'node_modules', '.package-lock.json');

function missingPackages() {
  const missing = [];
  for (const ws of ['.', 'server', 'client']) {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, ws, 'package.json'), 'utf8'));
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      const found = [path.join(ROOT, ws, 'node_modules', dep), path.join(ROOT, 'node_modules', dep)].some((d) => fs.existsSync(path.join(d, 'package.json')));
      if (!found) missing.push(dep);
    }
  }
  return missing;
}

const missing = missingPackages();
const stale = fs.existsSync(lock) && (!fs.existsSync(installed) || fs.statSync(lock).mtimeMs > fs.statSync(installed).mtimeMs + 1000);

if (missing.length || stale) {
  console.log(`[build] ${missing.length ? `Missing packages (${missing.join(', ')})` : 'package-lock.json changed since the last install'}: running npm install first…`);
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const res = spawnSync(npm, ['install', '--no-audit', '--no-fund'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0) {
    console.error('[build] npm install failed. Fix the error above and run npm run build again.');
    process.exit(res.status || 1);
  }
}
