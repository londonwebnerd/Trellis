/**
 * Single-admin authentication with zero dependencies.
 *
 * - The password is stored as a scrypt hash in DATA_DIR/auth.json
 *   (set it with `npm run set-password`).
 * - A successful login creates a server-side session (DATA_DIR/sessions.json)
 *   and sets an HttpOnly, SameSite=Strict cookie holding a signed token:
 *   base64url(JSON { sid, exp }) + "." + HMAC-SHA256 signature.
 *   Logging out deletes that session; changing the password deletes them all,
 *   so a stolen or forgotten cookie stops working.
 * - Logging in requires the secret editor path as well as the password, so
 *   bots that don't know the path can't even try passwords.
 * - Mutating requests must also send the `X-Requested-With: trellis` header,
 *   which a cross-site form can't set: a cheap extra CSRF guard on top of
 *   SameSite cookies.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import { promisify } from 'node:util';
import { config, dataPath } from '../config.js';
import { writeFileAtomicSync } from './files.js';

const AUTH_FILE = dataPath('auth.json');
const SECRET_FILE = dataPath('secret.key');
const SESSIONS_FILE = dataPath('sessions.json');
export const COOKIE_NAME = 'trellis_session';
export const MIN_PASSWORD_LENGTH = 8;

const scrypt = promisify(crypto.scrypt);

/* ----------------------------- Passwords ----------------------------- */

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

/** Hash a password with a random salt. */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_PARAMS.keylen, SCRYPT_PARAMS);
  return { algo: 'scrypt', salt: salt.toString('base64'), hash: hash.toString('base64'), ...SCRYPT_PARAMS };
}

/**
 * Persist a new admin password hash and sign out every existing session
 * (works from the CLI too: the server re-reads the sessions file).
 */
export function setPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  writeFileAtomicSync(AUTH_FILE, JSON.stringify(hashPassword(password), null, 2), 0o600);
  revokeAllSessions();
}

/** True once an admin password exists. */
export function hasPassword() {
  return fs.existsSync(AUTH_FILE);
}

/**
 * On boot: if no password file exists but ADMIN_PASSWORD is set, hash it once
 * so the plaintext never needs to stay in the environment.
 */
export function bootstrapPassword() {
  if (!hasPassword() && config.bootstrapPassword) {
    try {
      setPassword(config.bootstrapPassword);
      console.log('[auth] Admin password initialised from ADMIN_PASSWORD. You can now remove it from .env.');
    } catch (err) {
      console.error(`[auth] ADMIN_PASSWORD ignored: ${err.message}`);
    }
  }
  if (!hasPassword()) {
    console.warn('[auth] No admin password set. Run `npm run set-password` to enable the editor.');
  }
}

/** Constant-time password check against the stored hash (non-blocking). */
export async function verifyPassword(password) {
  if (!hasPassword() || typeof password !== 'string' || password.length > 1024) return false;
  const stored = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  const { N, r, p, keylen } = stored;
  const expected = Buffer.from(stored.hash, 'base64');
  const actual = await scrypt(password, Buffer.from(stored.salt, 'base64'), keylen, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/* --------------------------- Signing secret -------------------------- */

let secret = null;

/** Session-signing secret: env var, else a generated, persisted key. */
function getSecret() {
  if (secret) return secret;
  if (config.sessionSecret) {
    secret = config.sessionSecret;
  } else if (fs.existsSync(SECRET_FILE)) {
    secret = fs.readFileSync(SECRET_FILE, 'utf8').trim();
  } else {
    secret = crypto.randomBytes(48).toString('base64url');
    writeFileAtomicSync(SECRET_FILE, secret, 0o600);
  }
  return secret;
}

const sign = (value) => crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');

/* ------------------------- Server-side sessions ----------------------- */

const MAX_SESSIONS = 20;

/**
 * sessions.json is cached and re-read when another process (the CLI) changes
 * it. Every write is an atomic rename, which gives the file a new inode, so
 * inode + size + mtime spots a change even on filesystems with coarse
 * timestamps.
 */
let sessionCache = { stamp: null, sessions: {} };

const stampOf = (st) => `${st.ino}:${st.size}:${st.mtimeMs}`;

function readSessions() {
  let stamp;
  try {
    stamp = stampOf(fs.statSync(SESSIONS_FILE));
  } catch {
    sessionCache = { stamp: 'missing', sessions: {} };
    return sessionCache.sessions;
  }
  if (stamp !== sessionCache.stamp) {
    try {
      const parsed = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
      sessionCache = { stamp, sessions: parsed && typeof parsed === 'object' ? parsed : {} };
    } catch {
      sessionCache = { stamp, sessions: {} };
    }
  }
  return sessionCache.sessions;
}

function writeSessions(sessions) {
  writeFileAtomicSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 0o600);
  sessionCache = { stamp: stampOf(fs.statSync(SESSIONS_FILE)), sessions };
}

/** Short public id for a session (the real id stays secret). */
export const publicSessionId = (sid) => crypto.createHash('sha256').update(sid).digest('base64url').slice(0, 12);

/**
 * Create a session and return its signed cookie token.
 * @param {{ ip?: string, ua?: string, method?: string }} [info] shown in the editor's list of signed-in devices
 */
export function createSessionToken(info = {}) {
  const now = Date.now();
  const sid = crypto.randomBytes(18).toString('base64url');
  const exp = now + config.sessionMaxAgeMs;
  // Keep only live sessions, newest first, at most MAX_SESSIONS.
  const live = Object.entries(readSessions())
    .filter(([, s]) => s && s.exp > now)
    .sort((a, b) => b[1].created - a[1].created)
    .slice(0, MAX_SESSIONS - 1);
  const meta = { ip: String(info.ip || '').slice(0, 64), ua: String(info.ua || '').slice(0, 300), method: info.method || 'password' };
  writeSessions(Object.fromEntries([[sid, { created: now, exp, lastSeen: now, ...meta }], ...live]));
  const payload = Buffer.from(JSON.stringify({ sid, exp })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/** The session id in a token if it is correctly signed, unexpired and still active. */
function sessionIdFrom(token) {
  if (typeof token !== 'string' || token.length > 512) return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const signature = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(payload));
  if (signature.length !== expected.length || !crypto.timingSafeEqual(signature, expected)) return null;
  try {
    const { sid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof sid !== 'string' || typeof exp !== 'number' || exp <= Date.now()) return null;
    const session = readSessions()[sid];
    return session && session.exp > Date.now() ? sid : null;
  } catch {
    return null;
  }
}

/** Return true if the token belongs to an active session. */
export const verifySessionToken = (token) => sessionIdFrom(token) !== null;

/** How often "last active" is written (at most), to keep disk writes rare. */
const TOUCH_MS = 5 * 60 * 1000;

/** Note that a session was just used (throttled). */
function touchSession(sid, req) {
  const sessions = readSessions();
  const session = sessions[sid];
  if (!session || Date.now() - (session.lastSeen || 0) < TOUCH_MS) return;
  writeSessions({ ...sessions, [sid]: { ...session, lastSeen: Date.now(), lastIp: String(req.ip || '').slice(0, 64) } });
}

/** End the session a token belongs to (logout). */
export function revokeSessionToken(token) {
  const sid = sessionIdFrom(token);
  if (!sid) return;
  const { [sid]: _removed, ...rest } = readSessions();
  writeSessions(rest);
}

/** Sign out everywhere. */
export function revokeAllSessions() {
  writeSessions({});
}

/**
 * Signed-in devices for the editor, newest first. `current` marks the one
 * making the request. Ids are public ids (see publicSessionId).
 */
export function listSessions(req) {
  const current = sessionIdFrom(readCookie(req, COOKIE_NAME));
  const now = Date.now();
  return Object.entries(readSessions())
    .filter(([, s]) => s && s.exp > now)
    .sort((a, b) => (b[1].lastSeen || b[1].created) - (a[1].lastSeen || a[1].created))
    .map(([sid, s]) => ({
      id: publicSessionId(sid),
      current: sid === current,
      created: new Date(s.created).toISOString(),
      lastSeen: new Date(s.lastSeen || s.created).toISOString(),
      expires: new Date(s.exp).toISOString(),
      ip: s.lastIp || s.ip || '',
      ua: s.ua || '',
      method: s.method || 'password',
    }));
}

/** Sign out one device by its public id. Returns false if there's no such session. */
export function revokeSessionById(publicId) {
  const sessions = readSessions();
  const sid = Object.keys(sessions).find((k) => publicSessionId(k) === publicId);
  if (!sid) return false;
  const { [sid]: _removed, ...rest } = sessions;
  writeSessions(rest);
  return true;
}

/** Sign out every device except the one making the request. Returns how many. */
export function revokeOtherSessions(req) {
  const current = sessionIdFrom(readCookie(req, COOKIE_NAME));
  const sessions = readSessions();
  const keep = current && sessions[current] ? { [current]: sessions[current] } : {};
  writeSessions(keep);
  return Object.keys(sessions).length - Object.keys(keep).length;
}

/* ---------------------------- Sign-in history --------------------------- */

const SIGNINS_FILE = dataPath('signins.json');
const SIGNINS_KEPT = 30;

/** Recent sign-in attempts, newest first: [{ at, ip, ua, ok, step }]. */
export function recentSignIns() {
  try {
    const list = JSON.parse(fs.readFileSync(SIGNINS_FILE, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Remember a sign-in attempt that reached the password check from the real
 * editor page. `step`: 'password' (wrong password), 'code' (wrong code),
 * or the method that succeeded.
 */
export function logSignIn(req, ok, step) {
  const entry = { at: new Date().toISOString(), ip: String(req.ip || '').slice(0, 64), ua: String(req.get('User-Agent') || '').slice(0, 300), ok, step };
  try {
    writeFileAtomicSync(SIGNINS_FILE, JSON.stringify([entry, ...recentSignIns()].slice(0, SIGNINS_KEPT), null, 2), 0o600);
  } catch (err) {
    console.warn(`[auth] Could not record sign-in: ${err.message}`);
  }
}

/** Minimal cookie parser (avoids pulling in cookie-parser). Never throws. */
export function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k !== name) continue;
    try {
      return decodeURIComponent(v.join('='));
    } catch {
      return null;
    }
  }
  return null;
}

/** Cookie options shared by login and logout. */
export function cookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    // Secure-only in HTTPS mode (except on localhost); otherwise whenever the
    // request itself is HTTPS (requires TRUST_PROXY behind nginx).
    secure: req.secure || (config.forceHttps && !/^(localhost|127\.0\.0\.1)$/.test(req.hostname || '')),
    path: '/',
    maxAge: config.sessionMaxAgeMs,
  };
}

export function isAuthenticated(req) {
  const sid = sessionIdFrom(readCookie(req, COOKIE_NAME));
  if (!sid) return false;
  touchSession(sid, req);
  return true;
}

/* ----------------------------- Middleware ---------------------------- */

/** Reject the request unless the admin is logged in (and sent the CSRF header). */
export function requireAuth(req, res, next) {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Not logged in' });
  if (req.get('X-Requested-With') !== 'trellis') return res.status(403).json({ error: 'Missing CSRF header' });
  next();
}

/* ---------------------------- Rate limiting --------------------------- */

/**
 * In-memory login limiter. Every attempt is counted *before* the password is
 * checked (so a burst of parallel requests can't slip through), and a
 * successful login clears the count. Limits per 15 minutes:
 *   - 10 attempts per IPv4 address or IPv6 /64 (one home or VPS),
 *   - 30 attempts per IPv6 /48 (so rotating through /64s doesn't help).
 * The table is capped; expired entries go first, then the oldest.
 */
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED = 20_000;
const LIMITS = { host: 10, net: 30 };

/** Expand an IPv6 address to its 8 hextets (lowercase), or null. */
function expandIPv6(ip) {
  if (!net.isIPv6(ip)) return null;
  let addr = ip.toLowerCase().split('%')[0];
  // Embedded IPv4 tail (e.g. ::ffff:1.2.3.4 or 64:ff9b::1.2.3.4) -> two hextets.
  const v4 = addr.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    addr = addr.slice(0, v4.index) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = addr.split('::');
  const left = head ? head.split(':') : [];
  const right = tail !== undefined && tail ? tail.split(':') : [];
  const fill = tail === undefined ? [] : Array(8 - left.length - right.length).fill('0');
  return [...left, ...fill, ...right].map((h) => h.padStart(4, '0'));
}

/**
 * Rate-limit keys for an IP: [per-host key, per-network key or null].
 * IPv4 (and IPv4-mapped IPv6) by address; IPv6 by /64 and /48.
 */
export function clientKeys(ip = '') {
  const plain = ip.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
  const groups = expandIPv6(plain);
  if (!groups) return [plain, null];
  return [`${groups.slice(0, 4).join(':')}::/64`, `${groups.slice(0, 3).join(':')}::/48`];
}

/** Single key (per host or /64), used by other limiters. */
export const clientKey = (ip) => clientKeys(ip)[0];

function prune(now) {
  for (const [key, entry] of attempts) if (now - entry.first > WINDOW_MS) attempts.delete(key);
  while (attempts.size > MAX_TRACKED) attempts.delete(attempts.keys().next().value);
}

const live = (key, now) => {
  const entry = attempts.get(key);
  if (entry && now - entry.first > WINDOW_MS) {
    attempts.delete(key);
    return null;
  }
  return entry || null;
};

/**
 * Express middleware: refuse when over the limit, otherwise count this
 * attempt right away (before the slow password check).
 */
export function loginRateLimit(req, res, next) {
  const now = Date.now();
  const [hostKey, netKey] = clientKeys(req.ip);
  const host = live(hostKey, now);
  const network = netKey && live(netKey, now);
  const blocked = (host && host.count >= LIMITS.host && host) || (network && network.count >= LIMITS.net && network);
  if (blocked) {
    res.set('Retry-After', String(Math.max(1, Math.ceil((blocked.first + WINDOW_MS - now) / 1000))));
    return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  }
  for (const key of [hostKey, netKey]) {
    if (!key) continue;
    const entry = live(key, now) || { count: 0, first: now };
    entry.count += 1;
    attempts.set(key, entry);
  }
  if (attempts.size > MAX_TRACKED) prune(now);
  next();
}

/** A successful login clears this client's own counter (not its network's). */
export function clearFailedLogins(ip) {
  attempts.delete(clientKeys(ip)[0]);
}
