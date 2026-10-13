/**
 * The secret editor URL.
 *
 * Instead of a guessable /admin, the editor lives at a random path such as
 * /_Q3v9kXo2LmA7rT1bZs8eWy4 (~144 bits of randomness, so it can't be found
 * by guessing or scanning). It is:
 *   - generated on first start and stored in DATA_DIR/admin-path (mode 600),
 *     or taken from the ADMIN_PATH environment variable,
 *   - never listed in robots.txt, sitemaps or links on the public page,
 *   - served with noindex/noai headers, `Referrer-Policy: no-referrer` (so
 *     the URL never leaks to other sites via the Referer header) and
 *     `Cache-Control: no-store`.
 *
 * The password is still required. The secret URL is an extra layer: logins
 * are only accepted from the editor path (routes/auth.js), so bots and
 * crawlers that don't know it can't even try passwords.
 *
 * Show or change it with `npm run admin-url` / `npm run admin-url -- --rotate`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { config, dataPath } from '../config.js';
import { writeFileAtomicSync } from './files.js';

const FILE = dataPath('admin-path');
const VALID = /^\/[A-Za-z0-9_-]{16,128}$/;

/** A fresh random path, e.g. "/_Q3v9kXo2LmA7rT1bZs8eWy4". */
export const generateAdminPath = () => `/_${crypto.randomBytes(18).toString('base64url')}`;

/** Save a new random path (used on first start and by --rotate). */
export function rotateAdminPath() {
  const next = generateAdminPath();
  fs.mkdirSync(config.dataDir, { recursive: true });
  writeFileAtomicSync(FILE, `${next}\n`, 0o600);
  cache = { value: next, readAt: Date.now() };
  return next;
}

let cache = { value: null, readAt: 0 };
let createdThisRun = false;

/** True if this process generated the editor path (first start). */
export const adminPathIsNew = () => {
  getAdminPath();
  return createdThisRun && !config.adminPath;
};

/**
 * The current editor path. Re-read from disk at most every 5 seconds, so
 * rotating it with the CLI takes effect without a restart.
 */
export function getAdminPath() {
  if (config.adminPath && VALID.test(config.adminPath)) return config.adminPath;
  if (cache.value && Date.now() - cache.readAt < 5000) return cache.value;
  let value = null;
  try {
    value = fs.readFileSync(FILE, 'utf8').trim();
  } catch (err) {
    // Only a missing file means "first start". Anything else (e.g. wrong
    // permissions) must not silently replace the owner's editor link.
    if (err.code !== 'ENOENT') {
      if (cache.value) return cache.value;
      throw new Error(`Can't read the editor link file ${FILE}: ${err.message}. Check its permissions (deploy/fix-permissions.sh).`);
    }
  }
  if (!value || !VALID.test(value)) {
    value = rotateAdminPath();
    createdThisRun = true;
  }
  cache = { value, readAt: Date.now() };
  return value;
}

/** Warn at boot if ADMIN_PATH is set but unusable. */
export function checkAdminPathConfig() {
  if (config.adminPath && !VALID.test(config.adminPath)) {
    console.warn('[admin] ADMIN_PATH must be 16–128 letters, digits, "-" or "_". Ignoring it and using a generated path.');
  }
}

/** True if the request is for the editor page (exact path, optional trailing slash). */
export const isAdminRequest = (req) => req.path.replace(/\/+$/, '') === getAdminPath();
