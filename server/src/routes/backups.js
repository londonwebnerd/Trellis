/**
 * Backups, for the editor's Settings (backups themselves are made by
 * lib/backup.js: nightly, or with `npm run backup`).
 *
 *   GET  /api/backups   status: last run, the stored backups, settings
 *   POST /api/backups   back up now
 *
 * Backups can't be downloaded or restored from the browser: they hold the
 * password hash and keys, and restoring needs the server stopped. That's
 * done on the server with `npm run restore`.
 */
import { Router } from 'express';
import { config } from '../config.js';
import { requireAuth } from '../lib/auth.js';
import { createBackup, lastBackupStatus, listBackups } from '../lib/backup.js';
import { rateLimit } from '../lib/rateLimit.js';

const router = Router();

const describe = () => ({
  enabled: config.backup.enabled,
  time: config.backup.time,
  keep: config.backup.keep,
  copyDir: Boolean(config.backup.copyDir),
  s3: Boolean(config.backup.s3),
  last: lastBackupStatus(),
  backups: listBackups().map(({ name, size, at }) => ({ name, size, at })),
});

router.get('/', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store').json(describe());
});

router.post('/', requireAuth, rateLimit({ max: 6, windowMs: 60 * 60_000 }), async (req, res) => {
  const status = await createBackup({ reason: 'manual' });
  res.set('Cache-Control', 'no-store').status(status.ok ? 200 : 500).json({ ...describe(), error: status.ok ? undefined : status.error });
});

export default router;
