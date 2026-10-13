/**
 * Two-step sign-in with an authenticator app (TOTP, RFC 6238): the same
 * 6-digit codes as Google Authenticator, 1Password, Authy, Bitwarden…
 *
 * DATA_DIR/twofactor.json (mode 600):
 *   { secret, enabledAt, lastStep, recovery: [{ hash, usedAt }] }
 *
 * - Codes are accepted for the current 30-second step and one either side
 *   (clock drift), and each step only once (a code can't be replayed).
 * - 10 single-use recovery codes are shown once when it's turned on; only
 *   their hashes are stored.
 * - Locked out? `npm run reset-2fa` on the server turns it off.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { dataPath } from '../config.js';
import { writeFileAtomicSync } from './files.js';

const FILE = dataPath('twofactor.json');
const STEP_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/* ------------------------------- Base32 -------------------------------- */

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/* -------------------------------- Codes -------------------------------- */

/** HOTP code for a counter (RFC 4226). */
export function hotp(secret, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const offset = mac[mac.length - 1] & 15;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

const stepAt = (ms = Date.now()) => Math.floor(ms / 1000 / STEP_SECONDS);

/** Current code (for tests and the CLI). */
export const totpNow = (secret, ms = Date.now()) => hotp(secret, stepAt(ms));

/**
 * The step a code matches (now ± 1 step), or null. Constant-time compare.
 * @param {string} secret base32
 * @param {string} code
 */
export function matchStep(secret, code, ms = Date.now()) {
  const given = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(given)) return null;
  const now = stepAt(ms);
  let found = null;
  for (const step of [now - 1, now, now + 1]) {
    const expected = hotp(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given)) && found === null) found = step;
  }
  return found;
}

/* ------------------------------- Storage -------------------------------- */

function read() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return data && typeof data.secret === 'string' ? data : null;
  } catch {
    return null;
  }
}

const write = (data) => writeFileAtomicSync(FILE, JSON.stringify(data, null, 2), 0o600);

/** Is two-step sign-in on? */
export const isTwoFactorEnabled = () => Boolean(read());

/** { enabled, enabledAt, recoveryLeft } for the editor (no secrets). */
export function twoFactorStatus() {
  const data = read();
  if (!data) return { enabled: false };
  return { enabled: true, enabledAt: data.enabledAt, recoveryLeft: data.recovery.filter((r) => !r.usedAt).length };
}

/** A new random secret (160 bits) and the otpauth:// address for QR codes. */
export function newSecret(label = 'Trellis', issuer = 'Trellis') {
  const secret = base32Encode(crypto.randomBytes(20));
  const uri = `otpauth://totp/${encodeURIComponent(`${issuer}:${label}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
  return { secret, uri };
}

const hashRecovery = (code) => crypto.createHash('sha256').update(String(code).toLowerCase().replace(/[^a-z0-9]/g, '')).digest('hex');

/** Ten recovery codes like "k7qm-2xpd-9hrt". */
function newRecoveryCodes() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => {
    const raw = Array.from(crypto.randomBytes(12), (b) => chars[b % chars.length]).join('');
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  });
}

/**
 * Turn two-step sign-in on with a secret the user has just added to their
 * app, after checking a code from it. Returns the recovery codes (shown once).
 */
export function enableTwoFactor(secret, code) {
  const step = matchStep(secret, code);
  if (step === null) return null;
  const codes = newRecoveryCodes();
  write({ secret, enabledAt: new Date().toISOString(), lastStep: step, recovery: codes.map((c) => ({ hash: hashRecovery(c), usedAt: null })) });
  return codes;
}

/** Turn it off (editor, after a code; or `npm run reset-2fa`). */
export function disableTwoFactor() {
  fs.rmSync(FILE, { force: true });
}

/** New recovery codes (the old ones stop working). */
export function regenerateRecoveryCodes() {
  const data = read();
  if (!data) return null;
  const codes = newRecoveryCodes();
  write({ ...data, recovery: codes.map((c) => ({ hash: hashRecovery(c), usedAt: null })) });
  return codes;
}

/**
 * Check a sign-in code: a 6-digit authenticator code (each step once) or an
 * unused recovery code (then used up).
 * @returns {'code' | 'recovery' | null}
 */
export function verifySecondFactor(input) {
  const data = read();
  if (!data) return null;
  const value = String(input || '').trim();
  if (/^\d{3}\s?\d{3}$/.test(value)) {
    const step = matchStep(data.secret, value);
    if (step === null || step <= (data.lastStep ?? -1)) return null;
    write({ ...data, lastStep: step });
    return 'code';
  }
  const hash = hashRecovery(value);
  const entry = data.recovery.find((r) => !r.usedAt && crypto.timingSafeEqual(Buffer.from(r.hash), Buffer.from(hash)));
  if (!entry) return null;
  entry.usedAt = new Date().toISOString();
  write(data);
  return 'recovery';
}
