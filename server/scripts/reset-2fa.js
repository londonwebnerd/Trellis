#!/usr/bin/env node
/**
 * Turn off two-step sign-in (lost phone, no recovery codes left).
 *
 *   sudo -u www-data npm run reset-2fa
 *
 * Signs out every device too. Sign in with the password, then turn it on
 * again in Settings → Security.
 */
import { revokeAllSessions } from '../src/lib/auth.js';
import { disableTwoFactor, isTwoFactorEnabled } from '../src/lib/totp.js';

if (!isTwoFactorEnabled()) {
  console.log('Two-step sign-in is already off.');
} else {
  disableTwoFactor();
  revokeAllSessions();
  console.log('Two-step sign-in is off, and every device has been signed out.');
  console.log('Sign in with your password, then turn it on again in Settings → Security.');
}
