/**
 * Auth routes:
 *   GET  /api/auth/me                 -> { authenticated, passwordSet, twoFactor? }
 *   POST /api/auth/login              -> { password, path, code? } sets the session cookie
 *   POST /api/auth/logout             -> ends the session and clears the cookie
 *
 * Editor only (signed in):
 *   GET    /api/auth/security          two-step status, signed-in devices, recent sign-ins
 *   POST   /api/auth/2fa/setup         a new secret + otpauth:// address (not active yet)
 *   POST   /api/auth/2fa/enable        { password, code } -> { recoveryCodes } (shown once)
 *   POST   /api/auth/2fa/disable       { password, code }  (code or a recovery code)
 *   POST   /api/auth/2fa/recovery      { password } -> new { recoveryCodes }
 *   DELETE /api/auth/sessions/:id      sign out one device
 *   POST   /api/auth/sessions/others   sign out every other device
 *
 * `path` must be the secret editor path (the login form sends
 * location.pathname), so the password can't be guessed by anyone who doesn't
 * know the editor link. With two-step sign-in on, a correct password answers
 * `code_required`, and the form sends the password again with the code.
 */
import { Router } from 'express';
import { config } from '../config.js';
import { getAdminPath } from '../lib/adminPath.js';
import {
  COOKIE_NAME,
  clearFailedLogins,
  cookieOptions,
  createSessionToken,
  hasPassword,
  isAuthenticated,
  listSessions,
  logSignIn,
  loginRateLimit,
  publicSessionId,
  readCookie,
  recentSignIns,
  requireAuth,
  revokeOtherSessions,
  revokeSessionById,
  revokeSessionToken,
  verifyPassword,
} from '../lib/auth.js';
import { disableTwoFactor, enableTwoFactor, isTwoFactorEnabled, newSecret, regenerateRecoveryCodes, twoFactorStatus, verifySecondFactor } from '../lib/totp.js';

const router = Router();

/**
 * Wrong two-step codes, counted for the whole site (on top of the per-address
 * login limit), so someone who has the password can't spread guesses over
 * many addresses. 30 wrong codes in 15 minutes pause code checks for the rest
 * of that window; the owner's recovery codes and the server CLI still work.
 */
const codeFailures = { start: 0, count: 0 };
const CODE_WINDOW_MS = 15 * 60 * 1000;
const CODE_MAX_FAILURES = 30;
function codeChecksPaused() {
  if (Date.now() - codeFailures.start > CODE_WINDOW_MS) Object.assign(codeFailures, { start: Date.now(), count: 0 });
  return codeFailures.count >= CODE_MAX_FAILURES;
}

const noStore = (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};
router.use(noStore);

router.get('/me', (req, res) => {
  const authenticated = isAuthenticated(req);
  res.json({ authenticated, passwordSet: hasPassword(), ...(authenticated && { twoFactor: isTwoFactorEnabled() }) });
});

router.post('/login', loginRateLimit, async (req, res, next) => {
  try {
    if (!hasPassword()) {
      return res.status(503).json({ error: 'No password has been set for this site yet. Ask whoever runs the server to set one.' });
    }
    const path = typeof req.body?.path === 'string' ? req.body.path.replace(/\/+$/, '') : '';
    const pathOk = path === getAdminPath();
    // Always run the hash, so a wrong path and a wrong password take as long.
    const passwordOk = await verifyPassword(req.body?.password);
    // (The attempt was already counted by loginRateLimit.)
    if (!pathOk || !passwordOk) {
      if (pathOk) logSignIn(req, false, 'password');
      return res.status(401).json({ error: 'Wrong password' });
    }
    let method = 'password';
    if (isTwoFactorEnabled()) {
      const code = typeof req.body?.code === 'string' ? req.body.code : '';
      if (!code) return res.status(401).json({ error: 'Enter the 6-digit code from your authenticator app.', code: 'code_required' });
      const isAppCode = /^\d{3}\s?\d{3}$/.test(code.trim());
      if (isAppCode && codeChecksPaused()) {
        return res.status(429).json({ error: 'Too many wrong codes. Try again in 15 minutes, or use a recovery code.', code: 'rate_limited' });
      }
      const used = verifySecondFactor(code);
      if (!used) {
        codeFailures.count += 1;
        logSignIn(req, false, 'code');
        return res.status(401).json({ error: 'That code didn’t work. Codes change every 30 seconds; try the current one.', code: 'code_invalid' });
      }
      method = used === 'recovery' ? 'recovery code' : 'password + code';
    }
    clearFailedLogins(req.ip);
    logSignIn(req, true, method);
    res.cookie(COOKIE_NAME, createSessionToken({ ip: req.ip, ua: req.get('User-Agent'), method }), cookieOptions(req));
    res.json({ authenticated: true, ...(method === 'recovery code' && { recoveryLeft: twoFactorStatus().recoveryLeft }) });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  if (req.get('X-Requested-With') !== 'trellis') return res.status(403).json({ error: 'Missing CSRF header' });
  revokeSessionToken(readCookie(req, COOKIE_NAME));
  const { maxAge: _ignored, ...opts } = cookieOptions(req);
  res.clearCookie(COOKIE_NAME, opts);
  res.json({ authenticated: false });
});

/* ------------------------------ Security ------------------------------ */

const security = (req) => ({ twoFactor: twoFactorStatus(), sessions: listSessions(req), signIns: recentSignIns() });

router.get('/security', requireAuth, (req, res) => res.json(security(req)));

/** Secrets being set up, per session, until confirmed with a code (15 minutes). */
const pending = new Map();
const PENDING_MS = 15 * 60 * 1000;
const sessionKey = (req) => publicSessionId(readCookie(req, COOKIE_NAME) || '');

/** Changing two-step sign-in needs the password again (a stolen session alone can't). */
async function checkPassword(req, res) {
  if (await verifyPassword(req.body?.password)) {
    clearFailedLogins(req.ip);
    return true;
  }
  // 403, not 401: 401 means "signed out" to the editor.
  res.status(403).json({ error: 'Wrong password', code: 'password_invalid' });
  return false;
}

router.post('/2fa/setup', requireAuth, (req, res) => {
  if (isTwoFactorEnabled()) return res.status(409).json({ error: 'Two-step sign-in is already on.' });
  const host = config.publicUrl ? new URL(config.publicUrl).host : req.hostname || 'Trellis';
  const { secret, uri } = newSecret(host);
  for (const [k, v] of pending) if (Date.now() - v.at > PENDING_MS) pending.delete(k);
  pending.set(sessionKey(req), { secret, at: Date.now() });
  res.json({ secret, uri });
});

router.post('/2fa/enable', requireAuth, loginRateLimit, async (req, res) => {
  const entry = pending.get(sessionKey(req));
  if (!entry || Date.now() - entry.at > PENDING_MS) return res.status(400).json({ error: 'Setup timed out. Start again.', code: 'setup_expired' });
  if (!(await checkPassword(req, res))) return;
  const codes = enableTwoFactor(entry.secret, req.body?.code);
  if (!codes) return res.status(400).json({ error: 'That code didn’t match. Check the app shows “Trellis” and try the current code.', code: 'code_invalid' });
  pending.delete(sessionKey(req));
  logSignIn(req, true, 'turned on two-step sign-in');
  res.json({ recoveryCodes: codes, ...security(req) });
});

router.post('/2fa/disable', requireAuth, loginRateLimit, async (req, res) => {
  if (!isTwoFactorEnabled()) return res.json(security(req));
  if (!(await checkPassword(req, res))) return;
  if (!verifySecondFactor(req.body?.code)) return res.status(400).json({ error: 'That code didn’t work.', code: 'code_invalid' });
  disableTwoFactor();
  logSignIn(req, true, 'turned off two-step sign-in');
  res.json(security(req));
});

router.post('/2fa/recovery', requireAuth, loginRateLimit, async (req, res) => {
  if (!(await checkPassword(req, res))) return;
  const codes = regenerateRecoveryCodes();
  if (!codes) return res.status(400).json({ error: 'Two-step sign-in is off.' });
  res.json({ recoveryCodes: codes, ...security(req) });
});

router.delete('/sessions/:id', requireAuth, (req, res) => {
  if (!revokeSessionById(String(req.params.id))) return res.status(404).json({ error: 'That device is already signed out.' });
  res.json(security(req));
});

router.post('/sessions/others', requireAuth, (req, res) => {
  const count = revokeOtherSessions(req);
  res.json({ signedOut: count, ...security(req) });
});

export default router;
