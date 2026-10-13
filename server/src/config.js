/**
 * Central runtime configuration.
 *
 * Everything is read from environment variables, optionally loaded from the
 * project-level `.env` file (see loadEnvFile below), so the same build can
 * run in dev and production unchanged.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path of the `server/` folder. */
export const SERVER_ROOT = path.resolve(here, '..');

/** Absolute path of the project root (one level above `server/`). */
export const PROJECT_ROOT = path.resolve(SERVER_ROOT, '..');

/**
 * Load `.env` from the project root, if there is one. Variables already set
 * in the real environment (systemd, Docker, the shell) win over the file.
 * Done here rather than with Node's --env-file flags: those crash
 * `node --watch` when the file doesn't exist, and this works the same for
 * the server, the CLI scripts and every way of starting them.
 * Set TRELLIS_ENV_FILE to use another file, or to "none" to skip it.
 */
function loadEnvFile() {
  const setting = process.env.TRELLIS_ENV_FILE;
  if (setting === 'none') return;
  const file = setting ? path.resolve(setting) : path.join(PROJECT_ROOT, '.env');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT' || setting) console.warn(`[config] Could not read ${file}: ${err.message}`);
    return;
  }
  for (const [key, value] of Object.entries(parseEnv(text))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvFile();

/** Validate PUBLIC_URL: an http(s) origin without path, or null. */
function parsePublicUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) throw new Error('must start with https://');
    return url.origin;
  } catch (err) {
    console.warn(`[config] Ignoring PUBLIC_URL "${value}": ${err.message}`);
    return null;
  }
}

/** Installed version (server/package.json). */
const readVersion = () => {
  try {
    return JSON.parse(fs.readFileSync(path.join(SERVER_ROOT, 'package.json'), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
};

export const config = Object.freeze({
  version: readVersion(),
  port: Number(process.env.PORT) || 3001,
  host: process.env.HOST || '127.0.0.1',
  isProduction: process.env.NODE_ENV === 'production',

  /** Folder for page.json, auth.json, secret.key and uploads/. */
  dataDir: path.resolve(process.env.DATA_DIR || path.join(SERVER_ROOT, 'data')),

  /**
   * Folder of design preset files (*.json) offered in every editor that runs
   * from this install. Share one folder between several sites with PRESETS_DIR.
   */
  presetsDir: path.resolve(process.env.PRESETS_DIR || path.join(PROJECT_ROOT, 'presets')),

  /** Built React app (output of `npm run build`). */
  clientDist: path.join(PROJECT_ROOT, 'client', 'dist'),

  /** Express "trust proxy" setting; needed behind nginx for secure cookies. */
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY : false,

  sessionSecret: process.env.SESSION_SECRET || null,
  bootstrapPassword: process.env.ADMIN_PASSWORD || null,
  instagramToken: process.env.INSTAGRAM_ACCESS_TOKEN || null,

  /**
   * Optional public address of the site, e.g. https://alice.example.com.
   * When set, redirects and link-preview URLs always use it instead of the
   * Host header sent by the browser.
   */
  publicUrl: parsePublicUrl(process.env.PUBLIC_URL),

  /**
   * Request header holding the visitor's country code, if your proxy adds one
   * (nginx geoip2 module, Cloudflare's CF-IPCountry…). Without it, statistics
   * show browser languages instead of countries.
   */
  geoHeader: (process.env.GEO_HEADER || 'CF-IPCountry').trim(),
  /** Email notifications for contact-form messages (lib/notify.js). */
  smtpUrl: (process.env.SMTP_URL || '').trim(),
  smtpFrom: (process.env.SMTP_FROM || '').trim(),
  notifyEmail: (process.env.NOTIFY_EMAIL || '').trim(),

  /** Optional fixed editor path; otherwise a random one is generated (see lib/adminPath.js). */
  adminPath: process.env.ADMIN_PATH ? `/${process.env.ADMIN_PATH.replace(/^\/+/, '')}` : null,

  /**
   * HTTPS-only mode (default in production): http requests are redirected,
   * HSTS is sent, cookies are Secure-only, and the CSP upgrades any stray
   * http:// asset. Needs TRUST_PROXY behind nginx. Disable with FORCE_HTTPS=0.
   * Never applies to localhost, so local development keeps working over http.
   */
  forceHttps: process.env.NODE_ENV === 'production' && process.env.FORCE_HTTPS !== '0',

  /** Session lifetime: 30 days. */
  sessionMaxAgeMs: 30 * 24 * 60 * 60 * 1000,

  /** Max upload size for images (bytes). */
  maxUploadBytes: 5 * 1024 * 1024,

  /**
   * Automatic backups (lib/backup.js): a .tar.gz of the data folder every
   * night at BACKUP_TIME (server's local time), keeping the newest
   * BACKUP_KEEP. BACKUP=off turns them off. Optional off-site copies: a
   * folder (a mounted NAS…) and/or any S3-compatible storage.
   */
  backup: {
    enabled: !/^(off|0|false|no)$/i.test(process.env.BACKUP || ''),
    dir: path.resolve(process.env.BACKUP_DIR || path.join(path.resolve(process.env.DATA_DIR || path.join(SERVER_ROOT, 'data')), 'backups')),
    keep: Math.max(1, Math.min(365, Number(process.env.BACKUP_KEEP) || 14)),
    time: /^([01]?\d|2[0-3]):[0-5]\d$/.test(process.env.BACKUP_TIME || '') ? process.env.BACKUP_TIME : '03:30',
    copyDir: process.env.BACKUP_COPY_DIR ? path.resolve(process.env.BACKUP_COPY_DIR) : null,
    s3: process.env.BACKUP_S3_BUCKET
      ? {
          endpoint: (process.env.BACKUP_S3_ENDPOINT || 'https://s3.amazonaws.com').replace(/\/+$/, ''),
          bucket: process.env.BACKUP_S3_BUCKET,
          prefix: (process.env.BACKUP_S3_PREFIX || '').replace(/^\/+|\/+$/g, ''),
          region: process.env.BACKUP_S3_REGION || 'us-east-1',
          accessKey: process.env.BACKUP_S3_ACCESS_KEY || '',
          secretKey: process.env.BACKUP_S3_SECRET_KEY || '',
        }
      : null,
  },
});

/** Convenience helpers for files inside the data directory. */
export const dataPath = (...parts) => path.join(config.dataDir, ...parts);
