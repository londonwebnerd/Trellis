#!/usr/bin/env node
/**
 * Restore a backup made by Trellis (or `npm run backup`).
 *
 *   sudo systemctl stop trellis
 *   sudo -u www-data npm run restore -- latest          # or a file name / path
 *   sudo systemctl start trellis
 *
 * The current data is backed up first (…-before-restore.tar.gz), so a
 * restore can itself be undone. Everyone has to sign in again afterwards.
 * Options: --yes (don't ask), --force (even if the server seems to be running).
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { config } from '../src/config.js';
import { inspectBackup, listBackups, restoreBackup } from '../src/lib/backup.js';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const target = args.find((a) => !a.startsWith('--'));

if (!target) {
  console.log('Usage: npm run restore -- <latest | backup file>\n\nBackups:');
  for (const b of listBackups().slice(0, 20)) console.log(`  ${b.name}`);
  process.exit(1);
}

let file = target === 'latest' ? listBackups().find((b) => !b.name.includes('before-restore'))?.file : target;
if (file && !fs.existsSync(file) && fs.existsSync(path.join(config.backup.dir, file))) file = path.join(config.backup.dir, file);
if (!file || !fs.existsSync(file)) {
  console.error(target === 'latest' ? `No backups found in ${config.backup.dir}` : `File not found: ${target}`);
  process.exit(1);
}

// A running server would keep the old page in memory and write it back.
if (!flag('--force')) {
  const running = await fetch(`http://127.0.0.1:${config.port}/api/health`, { signal: AbortSignal.timeout(1500) }).then(
    (r) => r.ok,
    () => false,
  );
  if (running) {
    console.error(`The server is running on port ${config.port}. Stop it first (e.g. sudo systemctl stop trellis), then run this again.`);
    process.exit(1);
  }
}

let info;
try {
  info = inspectBackup(file);
} catch (err) {
  console.error(`Can't use ${file}: ${err.message}`);
  process.exit(1);
}
console.log(`Backup:  ${file}`);
console.log(`Made:    ${info.createdAt ? new Date(info.createdAt).toLocaleString() : 'unknown'}${info.version ? ` (Trellis ${info.version})` : ''}, ${info.files} files`);
console.log(`Into:    ${config.dataDir} (its current contents are backed up first)`);

if (!flag('--yes')) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Restore it? [y/N] ');
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log('Nothing changed.');
    process.exit(0);
  }
}

try {
  const { safety, files } = await restoreBackup(file);
  console.log(`Restored ${files} files.${safety ? ` The previous data is in ${safety}.` : ''}`);
  console.log('Start the server again (e.g. sudo systemctl start trellis). Everyone needs to sign in again.');
} catch (err) {
  console.error(`Restore failed: ${err.message}`);
  process.exit(1);
}
