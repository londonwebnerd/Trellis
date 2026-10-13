#!/usr/bin/env node
/**
 * Package a production release: `npm run build` runs this after building the
 * client. It produces
 *
 *   release/trellis-<version>.zip         upload this to your server
 *   release/trellis-<version>.zip.sha256  checksum (sha256sum -c)
 *
 * The zip contains one folder, trellis-<version>/, that runs with nothing but
 * Node.js 22.9+ installed: no `npm install`, no build step on the server.
 *
 *   trellis-<version>/
 *     package.json          start / set-password / admin-url scripts
 *     server/               the Express app (src, scripts, package.json)
 *     client/dist/          the built React app
 *     node_modules/         production dependencies only, copied from this checkout
 *     presets/              server design presets (README + examples)
 *     deploy/  docs/  README.md  .env.example  VERSION
 *
 * Never included: server/data (pages, passwords, uploads), .env files,
 * dev dependencies, client sources.
 *
 * Options:  --no-zip   only build the release/trellis-<version>/ folder
 */
import archiver from 'archiver';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootPkg = readJson(path.join(ROOT, 'package.json'));
const serverPkg = readJson(path.join(ROOT, 'server', 'package.json'));
const version = rootPkg.version;
const name = `trellis-${version}`;
const RELEASE = path.join(ROOT, 'release');
const STAGE = path.join(RELEASE, name);
const ZIP = path.join(RELEASE, `${name}.zip`);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function log(msg) {
  console.log(`[release] ${msg}`);
}

/** Copy a file or folder, skipping junk. */
function copy(rel, { from = ROOT, to = rel } = {}) {
  const src = path.join(from, rel);
  if (!fs.existsSync(src)) throw new Error(`Missing ${rel}`);
  fs.cpSync(src, path.join(STAGE, to), {
    recursive: true,
    filter: (p) => !/(^|[\\/])(\.DS_Store|Thumbs\.db|\.git|\.cache|\.vite)$/.test(p),
  });
}

/**
 * Find the folder of an installed package the way Node does: look in
 * node_modules next to `fromDir`, then walk up towards the repo root.
 */
function findPackage(dep, fromDir) {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', dep);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    if (dir === ROOT) return null;
    dir = path.dirname(dir);
  }
}

/**
 * Every package the server needs at runtime (its dependencies and theirs),
 * as absolute paths. Optional dependencies that aren't installed are skipped.
 */
function productionPackages() {
  const found = new Set();
  const visit = (deps, fromDir, optional = {}) => {
    for (const dep of Object.keys(deps)) {
      const dir = findPackage(dep, fromDir);
      if (!dir) {
        if (dep in optional) continue;
        throw new Error(`Dependency "${dep}" is not installed (needed from ${path.relative(ROOT, fromDir) || '.'}). Run npm install first.`);
      }
      const real = fs.realpathSync(dir);
      if (found.has(real)) continue;
      found.add(real);
      const pkg = readJson(path.join(dir, 'package.json'));
      visit({ ...pkg.dependencies, ...pkg.optionalDependencies }, real, pkg.optionalDependencies || {});
    }
  };
  visit(serverPkg.dependencies || {}, path.join(ROOT, 'server'));
  return [...found];
}

/** Zip the staged folder (and write a .sha256 next to it). */
function zip(file) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(file);
    const archive = archiver('zip', { zlib: { level: 9 } });
    out.on('close', resolve);
    archive.on('warning', reject);
    archive.on('error', reject);
    archive.pipe(out);
    // Store ordinary permissions whatever they are on this machine: files
    // that were private to the builder (600) made the server unable to read
    // its own code. Executables keep their x bit.
    archive.directory(STAGE, name, (entry) => {
      const exec = entry.stats && entry.stats.mode & 0o111;
      return { ...entry, mode: entry.stats?.isDirectory() ? 0o755 : exec ? 0o755 : 0o644 };
    });
    archive.finalize();
  });
}

async function main() {
  const dist = path.join(ROOT, 'client', 'dist', 'index.html');
  if (!fs.existsSync(dist)) throw new Error('client/dist is missing: run `npm run build` (not this script directly).');

  // Check the dependencies before touching anything, so a failed build
  // never removes the previous release.
  const pkgs = productionPackages();

  fs.rmSync(STAGE, { recursive: true, force: true });
  fs.mkdirSync(STAGE, { recursive: true });

  log(`Staging ${path.relative(ROOT, STAGE)}/`);
  for (const rel of ['server/src', 'server/scripts', 'server/package.json', 'client/dist', 'deploy', 'docs', 'presets', 'README.md', '.env.example']) copy(rel);
  for (const optional of ['LICENSE', 'CHANGELOG.md']) if (fs.existsSync(path.join(ROOT, optional))) copy(optional);

  // Runtime dependencies, keeping their place in the node_modules tree so
  // Node resolves exactly the versions that were tested here.
  for (const dir of pkgs) copy(path.relative(ROOT, dir));
  log(`Copied ${pkgs.length} production packages`);

  // Minimal root package.json: no workspaces, no dev tooling.
  const releasePkg = {
    name: 'trellis',
    version,
    private: true,
    description: rootPkg.description,
    type: 'module',
    engines: rootPkg.engines,
    scripts: {
      start: 'node server/src/index.js',
      'set-password': 'node server/scripts/set-password.js',
      'admin-url': 'node server/scripts/admin-url.js',
      backup: 'node server/scripts/backup.js',
      restore: 'node server/scripts/restore.js',
      update: 'node server/scripts/update.js',
      'reset-2fa': 'node server/scripts/reset-2fa.js',
      'sign-out-all': 'node server/scripts/sign-out-all.js',
    },
  };
  fs.writeFileSync(path.join(STAGE, 'package.json'), `${JSON.stringify(releasePkg, null, 2)}\n`);
  fs.writeFileSync(path.join(STAGE, 'VERSION'), `${version}\n`);

  if (process.argv.includes('--no-zip')) return log(`Done (folder only): ${path.relative(ROOT, STAGE)}/`);

  // Written under a temporary name and renamed at the end: the zip is
  // either complete or not there at all.
  const partial = `${ZIP}.partial`;
  fs.rmSync(partial, { force: true });
  await zip(partial);
  fs.renameSync(partial, ZIP);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(ZIP)).digest('hex');
  fs.writeFileSync(`${ZIP}.sha256`, `${hash}  ${name}.zip\n`);
  const mb = (fs.statSync(ZIP).size / 1024 / 1024).toFixed(1);
  log(`Created release/${name}.zip (${mb} MB)`);
  log(`  ${ZIP}`);
  log(`sha256 ${hash}`);
  log('Upload it to your server and follow docs/deployment.md (steps 1-2, or "Updating").');
}

main().catch((err) => {
  console.error(`[release] ${err.message}`);
  process.exit(1);
});
