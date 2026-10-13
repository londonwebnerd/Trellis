#!/usr/bin/env node
/**
 * Show (or change) the secret editor URL.
 *
 *   npm run admin-url                 # print the current editor path
 *   npm run admin-url -- --rotate     # generate a new one (old URL stops working)
 *
 * A running server picks up a rotated path within a few seconds, no restart
 * needed. If ADMIN_PATH is set in .env, that value is used instead.
 */
import { getAdminPath, rotateAdminPath } from '../src/lib/adminPath.js';
import { config } from '../src/config.js';

const rotate = process.argv.includes('--rotate');

if (config.adminPath && getAdminPath() === config.adminPath) {
  console.log(`Editor path (from ADMIN_PATH in .env): ${config.adminPath}`);
  if (rotate) console.log('Remove ADMIN_PATH from .env to use a generated path that can be rotated.');
  process.exit(0);
}

const path = rotate ? rotateAdminPath() : getAdminPath();
console.log(rotate ? 'New editor path generated (the old one no longer works):' : 'Your secret editor path:');
console.log(`\n  https://<your-domain>${path}\n`);
console.log('Bookmark it and keep it private. Locally: http://localhost:3001' + path);
