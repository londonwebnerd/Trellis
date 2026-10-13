#!/usr/bin/env node
/**
 * Back up the data folder now (the server also does this every night).
 *
 *   npm run backup              # make a backup (and the off-site copies)
 *   npm run backup -- --list    # list the backups
 *
 * Run it as the user the server runs as, e.g. `sudo -u www-data npm run backup`.
 */
import { config } from '../src/config.js';
import { createBackup, formatSize as mb, listBackups } from '../src/lib/backup.js';

if (process.argv.includes('--list')) {
  const all = listBackups();
  if (!all.length) console.log(`No backups yet in ${config.backup.dir}`);
  for (const b of all) console.log(`${b.name}  ${mb(b.size).padStart(9)}  ${new Date(b.at).toLocaleString()}`);
  process.exit(0);
}

const status = await createBackup({ reason: 'manual' });
if (!status.ok) {
  console.error(`Backup failed: ${status.error}`);
  process.exit(1);
}
console.log(`Saved ${config.backup.dir}/${status.name} (${mb(status.size)}, ${status.files} files)`);
if (status.copy) console.log(status.copy.ok ? `Copied to ${config.backup.copyDir}` : `Copy to ${config.backup.copyDir} failed: ${status.copy.error}`);
if (status.s3) console.log(status.s3.ok ? `Uploaded to S3: ${status.s3.key}` : `S3 upload failed: ${status.s3.error}`);
process.exit(status.copy?.ok === false || status.s3?.ok === false ? 2 : 0);
