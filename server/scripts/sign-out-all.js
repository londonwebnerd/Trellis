#!/usr/bin/env node
/**
 * Sign out every device that's signed in to the editor.
 *
 *   sudo -u www-data npm run sign-out-all
 */
import { revokeAllSessions } from '../src/lib/auth.js';

revokeAllSessions();
console.log('Every device has been signed out of the editor.');
