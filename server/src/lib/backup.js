/**
 * Backups of the data folder.
 *
 * A backup is one .tar.gz holding the whole data folder (page, drafts,
 * versions, uploads, statistics, inbox, password hash, keys, integrations),
 * except the backups themselves and the list of signed-in browsers. It
 * opens with any `tar`, and `npm run restore` puts it back.
 *
 *   - Nightly at BACKUP_TIME, plus a catch-up backup shortly after start
 *     when the last one is more than a day old (the server was off).
 *   - The newest BACKUP_KEEP are kept in BACKUP_DIR (default:
 *     DATA_DIR/backups), and in BACKUP_COPY_DIR if set (a NAS mount…).
 *   - Optionally uploaded to S3-compatible storage (AWS S3, Cloudflare R2,
 *     Backblaze B2, MinIO…). Old copies there are removed by the bucket's
 *     own lifecycle rule (see docs/data-and-backups.md).
 *
 * Backups contain secrets: they're written with mode 600.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { writeFileAtomicSync } from './files.js';
import { createTarGz, readTarGz } from './tar.js';

const NAME_RE = /^trellis-\d{4}-\d{2}-\d{2}-\d{6}(-[a-z-]+)?\.tar\.gz$/;
const MANIFEST = 'trellis-backup.json';

/** Never archived: the backups themselves, sessions, temp files. */
function skipper(dataDir, backupDir) {
  const insideRel = path.relative(dataDir, backupDir);
  const backupRel = insideRel && !insideRel.startsWith('..') && !path.isAbsolute(insideRel) ? insideRel.split(path.sep).join('/') : null;
  return (rel) =>
    (backupRel && (rel === backupRel || rel.startsWith(`${backupRel}/`))) ||
    rel === 'sessions.json' ||
    rel === MANIFEST ||
    /\.(tmp|partial)$/.test(rel) ||
    /\.restore-/.test(rel);
}

/** "640 KB" / "12.3 MB" */
export const formatSize = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

const pad = (n, w = 2) => String(n).padStart(w, '0');
const stamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

/** Backups in a folder, newest first: [{ name, file, size, at }]. */
export function listBackups(dir = config.backup.dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => NAME_RE.test(n))
    .map((name) => {
      const file = path.join(dir, name);
      const st = fs.statSync(file);
      return { name, file, size: st.size, at: st.mtime.toISOString() };
    })
    .sort((a, b) => (a.name < b.name ? 1 : -1));
}

/** Delete all but the newest `keep` backups in a folder. Returns the names removed. */
export function pruneBackups(dir = config.backup.dir, keep = config.backup.keep) {
  // Backups taken before a restore or an update are kept apart from the
  // nightly rotation only by name; they count towards `keep` like the rest.
  const removed = [];
  for (const old of listBackups(dir).slice(keep)) {
    fs.rmSync(old.file, { force: true });
    removed.push(old.name);
  }
  return removed;
}

/* --------------------------------- S3 --------------------------------- */

const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const encodePath = (p) => p.split('/').map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');

/**
 * AWS Signature Version 4 for one S3 request (no query string).
 * Exported for the tests (checked against AWS's published example).
 * @returns {Record<string, string>} headers to send, including Authorization
 */
export function signS3({ method, url, headers = {}, payloadHash, region, accessKey, secretKey, date = new Date() }) {
  const u = new URL(url);
  const amzDate = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const all = { ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])), host: u.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const names = Object.keys(all).sort();
  const canonical = [method, encodePath(decodeURIComponent(u.pathname)), '', ...names.map((n) => `${n}:${all[n]}`), '', names.join(';'), payloadHash].join('\n');
  const scope = `${day}/${region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, day), region), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', key).update(toSign).digest('hex');
  const { host: _host, ...send } = all;
  return { ...send, authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

/** Upload one backup to the configured S3 bucket (path-style URL). */
async function uploadToS3(file, s3) {
  const body = fs.readFileSync(file);
  const key = [s3.prefix, path.basename(file)].filter(Boolean).join('/');
  const url = `${s3.endpoint}/${encodeURIComponent(s3.bucket)}/${encodePath(key)}`;
  const headers = signS3({ method: 'PUT', url, headers: { 'content-type': 'application/gzip' }, payloadHash: sha256Hex(body), region: s3.region, accessKey: s3.accessKey, secretKey: s3.secretKey });
  const res = await fetch(url, { method: 'PUT', headers, body, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
    throw new Error(`S3 upload failed (${res.status}) ${text}`);
  }
  return key;
}

/* ------------------------------- Creating ------------------------------ */

const STATUS_FILE = () => path.join(config.backup.dir, 'status.json');

/** Last backup run: { at, ok, name?, size?, error?, copy?, s3? } or null. */
export function lastBackupStatus() {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE(), 'utf8'));
  } catch {
    return null;
  }
}

let running = null;

/**
 * Make a backup now (one at a time), copy it off-site if configured, prune
 * old ones, and record the result.
 * @param {{ dataDir?: string, dir?: string, reason?: string, offsite?: boolean }} [options]
 *   reason: added to the name for one-off backups ("before-restore"…)
 */
export function createBackup({ dataDir = config.dataDir, dir = config.backup.dir, reason = '', offsite = true } = {}) {
  if (running) return running;
  running = (async () => {
    const status = { at: new Date().toISOString(), ok: false };
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const name = `trellis-${stamp()}${reason ? `-${reason}` : ''}.tar.gz`;
      const file = path.join(dir, name);
      const manifest = JSON.stringify({ app: 'trellis', version: config.version, createdAt: status.at, reason: reason || 'scheduled' }, null, 2);
      const { files } = await createTarGz(dataDir, file, { skip: skipper(dataDir, dir), extra: [{ name: MANIFEST, data: manifest }] });
      Object.assign(status, { ok: true, name, size: fs.statSync(file).size, files });
      pruneBackups(dir);

      if (offsite && config.backup.copyDir) {
        try {
          fs.mkdirSync(config.backup.copyDir, { recursive: true });
          fs.copyFileSync(file, path.join(config.backup.copyDir, name));
          fs.chmodSync(path.join(config.backup.copyDir, name), 0o600);
          pruneBackups(config.backup.copyDir);
          status.copy = { ok: true };
        } catch (err) {
          status.copy = { ok: false, error: err.message };
          console.error(`[backup] Copy to ${config.backup.copyDir} failed: ${err.message}`);
        }
      }
      if (offsite && config.backup.s3) {
        try {
          status.s3 = { ok: true, key: await uploadToS3(file, config.backup.s3) };
        } catch (err) {
          status.s3 = { ok: false, error: err.message };
          console.error(`[backup] ${err.message}`);
        }
      }
      console.log(`[backup] Saved ${name} (${formatSize(status.size)}, ${files} files)`);
    } catch (err) {
      status.error = err.message;
      console.error(`[backup] Failed: ${err.message}`);
    }
    if (dir === config.backup.dir) {
      try {
        writeFileAtomicSync(STATUS_FILE(), JSON.stringify(status, null, 2), 0o600);
      } catch {
        // status is informative only
      }
    }
    return status;
  })().finally(() => {
    running = null;
  });
  return running;
}

/* ------------------------------ Scheduling ----------------------------- */

let timer = null;

/** Milliseconds until the next HH:MM (server local time). */
function msUntil(time, now = new Date()) {
  const [h, m] = time.split(':').map(Number);
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

/** Start nightly backups (no-op when BACKUP=off). */
export function scheduleBackups() {
  if (!config.backup.enabled || timer) return;
  const plan = () => {
    timer = setTimeout(async () => {
      await createBackup();
      plan();
    }, msUntil(config.backup.time));
    timer.unref();
  };
  plan();
  // Missed one (server was off at backup time, or first start)? Catch up soon.
  const last = listBackups()[0];
  if (!last || Date.now() - Date.parse(last.at) > 26 * 3600_000) {
    setTimeout(() => createBackup(), 60_000).unref();
  }
}

/* ------------------------------- Restoring ----------------------------- */

/**
 * Check a backup file and describe it: { version, createdAt, files, hasPage }.
 * Throws if it isn't a readable Trellis backup.
 */
export function inspectBackup(file) {
  const entries = readTarGz(file);
  const root = entries[0]?.name.split('/')[0];
  if (!root || entries.some((e) => e.name.split('/')[0] !== root)) throw new Error('Not a Trellis backup (expected one top-level folder)');
  const manifestEntry = entries.find((e) => e.name === `${root}/${MANIFEST}`);
  let manifest = {};
  try {
    manifest = manifestEntry ? JSON.parse(manifestEntry.data.toString('utf8')) : {};
  } catch {
    manifest = {};
  }
  const page = entries.find((e) => e.name === `${root}/page.json`);
  if (page) JSON.parse(page.data.toString('utf8')); // throws if damaged
  return { root, entries, version: manifest.version || null, createdAt: manifest.createdAt || null, files: entries.filter((e) => e.type === 'file' && e !== manifestEntry).length, hasPage: Boolean(page) };
}

/**
 * Replace the data folder's contents with a backup's. The server must be
 * stopped. The current data is backed up first ("before-restore"), and the
 * backups folder itself is left alone.
 * @returns {Promise<{ safety: string | null, files: number }>}
 */
export async function restoreBackup(file, { dataDir = config.dataDir, dir = config.backup.dir } = {}) {
  const info = inspectBackup(file);
  if (!info.hasPage) throw new Error('This backup has no page.json: refusing to restore it');

  let safety = null;
  if (fs.existsSync(path.join(dataDir, 'page.json'))) {
    const result = await createBackup({ dataDir, dir, reason: 'before-restore', offsite: false });
    if (!result.ok) throw new Error(`Couldn't back up the current data first: ${result.error}`);
    safety = result.name;
  }

  // Unpack next to the data folder, then swap the contents over.
  const staging = path.join(dataDir, `.restore-${process.pid}`);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { mode: 0o700 });
  const owner = fs.statSync(dataDir);
  const chown = (p) => {
    if (process.getuid?.() === 0) fs.chownSync(p, owner.uid, owner.gid);
  };
  try {
    for (const entry of info.entries) {
      const rel = entry.name.split('/').slice(1).join('/');
      if (!rel || rel === MANIFEST) continue;
      const target = path.join(staging, rel);
      if (!target.startsWith(staging + path.sep)) throw new Error(`Unsafe path in archive: ${entry.name}`);
      if (entry.type === 'dir') {
        fs.mkdirSync(target, { recursive: true, mode: 0o700 });
      } else {
        fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
        fs.writeFileSync(target, entry.data, { mode: entry.mode & 0o700 || 0o600 });
      }
    }

    const skip = skipper(dataDir, dir);
    for (const name of fs.readdirSync(dataDir)) {
      if (name === path.basename(staging) || skip(name)) continue;
      fs.rmSync(path.join(dataDir, name), { recursive: true, force: true });
    }
    for (const name of fs.readdirSync(staging)) fs.renameSync(path.join(staging, name), path.join(dataDir, name));
    // Sessions from before the restore no longer apply.
    fs.rmSync(path.join(dataDir, 'sessions.json'), { force: true });

    const fixOwner = (p) => {
      chown(p);
      if (fs.statSync(p).isDirectory()) for (const n of fs.readdirSync(p)) fixOwner(path.join(p, n));
    };
    for (const name of fs.readdirSync(dataDir)) if (!skip(name) && name !== path.basename(staging)) fixOwner(path.join(dataDir, name));
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  return { safety, files: info.files };
}
