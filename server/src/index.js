/**
 * Trellis server entry point.
 *
 * One small Express process that:
 *   - serves the JSON API under /api,
 *   - serves uploaded images under /uploads,
 *   - in production, serves the built React app and renders its HTML shell
 *     with the page data + SEO tags inlined.
 *
 * In development the React app is served by Vite (port 5173), which proxies
 * /api and /uploads to this server (see client/vite.config.js).
 */
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config, dataPath } from './config.js';
import { adminPathIsNew, checkAdminPathConfig, getAdminPath, isAdminRequest } from './lib/adminPath.js';
import { bootstrapPassword, isAuthenticated, requireAuth } from './lib/auth.js';
import { recordEvent } from './lib/analytics.js';
import { scheduleBackups } from './lib/backup.js';
import { countClick, findShortLink } from './lib/shortlinks.js';
import { initIntegrations } from './lib/integrations.js';
import { AVATAR_STYLES, renderAvatar } from './lib/avatar.js';
import { renderShell, webManifest } from './lib/html.js';
import { loadServerPresets } from './lib/presets.js';
import { hasUnknownParams } from './lib/params.js';
import { blockReason, isBot, NOINDEX_ALL, robotsDirectives, robotsTxt } from './lib/robots.js';
import { getPage, getPublicPage, loadPage } from './lib/store.js';
import { sanitizePreset, ValidationError } from './lib/validate.js';
import authRoutes from './routes/auth.js';
import backupRoutes from './routes/backups.js';
import shortlinkRoutes from './routes/shortlinks.js';
import feedRoutes from './routes/feeds.js';
import integrationRoutes from './routes/integrations.js';
import draftRoutes from './routes/draft.js';
import pageRoutes from './routes/page.js';
import statsRoutes from './routes/stats.js';
import visitorRoutes from './routes/visitor.js';
import uploadRoutes from './routes/uploads.js';

loadPage();
bootstrapPassword();
checkAdminPathConfig();
initIntegrations();
scheduleBackups();

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', config.trustProxy);

// Baseline headers on *every* response, including redirects, robots.txt,
// the manifest and bot refusals. Normal pages get a full CSP further down.
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  });
  next();
});

/**
 * Third-party origins that embeds are allowed to load in iframes.
 * Add to this list if you add a new embed type.
 */
const FRAME_SOURCES = [
  'https://open.spotify.com',
  'https://embed.music.apple.com',
  'https://www.instagram.com',
  'https://platform.twitter.com',
  'https://www.facebook.com',
  'https://www.youtube-nocookie.com',
  'https://player.vimeo.com',
  'https://www.linkedin.com',
  'https://*.notion.site',
  'https://www.tiktok.com',
  'https://player.twitch.tv',
  'https://w.soundcloud.com',
  'https://bandcamp.com',
  'https://assets.pinterest.com',
  'https://cal.com',
  'https://calendly.com',
  'https://www.openstreetmap.org',
];

/* ------------------------------- HTTPS ------------------------------- */

/** Local development (localhost) is always allowed over plain http. */
const isLocalHost = (req) => /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(req.hostname || '');
const httpsOnly = (req) => config.forceHttps && !isLocalHost(req);

/** A Host header that is a plain hostname (with optional port), or null. */
const cleanHost = (req) => {
  const host = req.get('host') || '';
  return /^(\[[0-9a-f:.]+\]|[a-z0-9.-]{1,253})(:\d{1,5})?$/i.test(host) ? host : null;
};

/**
 * The site's public origin: PUBLIC_URL when configured, otherwise derived
 * from the request (behind nginx, the Host header nginx forwarded).
 */
const publicOrigin = (req) => config.publicUrl || `${httpsOnly(req) ? 'https' : req.protocol}://${cleanHost(req) || 'localhost'}`;

if (process.env.NODE_ENV === 'production' && !config.publicUrl) {
  console.warn('[server] PUBLIC_URL is not set: share previews and canonical links use the address each request asks for. Set PUBLIC_URL=https://your-domain in .env.');
}

if (config.forceHttps && !config.trustProxy) {
  console.warn('[https] FORCE_HTTPS is on but TRUST_PROXY is not set: requests can\'t be recognised as HTTPS behind a proxy, so the http→https redirect is disabled. Set TRUST_PROXY=1.');
}

app.use((req, res, next) => {
  if (!httpsOnly(req)) return next();
  // Behind nginx with TRUST_PROXY, req.secure reflects X-Forwarded-Proto.
  if (!req.secure && config.trustProxy) {
    const host = config.publicUrl ? new URL(config.publicUrl).host : cleanHost(req);
    if (!host) return res.status(400).type('text').send('Bad request\n');
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  }
  // Browsers remember to use HTTPS for a year. Not includeSubDomains, so
  // other services on subdomains of your domain aren't affected.
  res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
});

/**
 * Short links: example.com/cv → wherever it points (lib/shortlinks.js).
 * Before the crawler rules on purpose: a redirect reveals nothing but its
 * target, and link previews (WhatsApp, Slack…) of a short link should show
 * the target's preview. Bots and the signed-in editor aren't counted.
 */
app.get(/^\/([^/]{1,64})\/?$/, (req, res, next) => {
  let slug;
  try {
    slug = decodeURIComponent(req.params[0]);
  } catch {
    return next();
  }
  const link = findShortLink(slug);
  if (!link || isAdminRequest(req)) return next();
  const ua = req.get('User-Agent') || '';
  if (!isBot(ua, req.headers) && !isAuthenticated(req)) {
    countClick(link);
    if (getPage().settings?.analytics !== false) recordEvent(req, { type: 'link', slug: link.slug, referrer: req.get('Referer') || '' });
  }
  res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': NOINDEX_ALL }).redirect(302, link.url);
});

/**
 * Search-engine / AI crawler controls (see lib/robots.js):
 *  - /robots.txt is generated from the page settings,
 *  - known AI crawlers get a 403 when "block AI" is on,
 *  - every response carries an X-Robots-Tag matching the settings
 *    (the editor and API are always noindex).
 */
app.get('/robots.txt', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300').type('text/plain').send(robotsTxt(getPage().settings));
});

app.use((req, res, next) => {
  const { settings } = getPage();
  const isEditor = isAdminRequest(req);
  // The editor is never served to bots, whatever the page settings.
  const reason = req.path === '/api/health' ? null : blockReason(req.get('User-Agent'), isEditor ? { noindex: true, blockAI: true } : settings, req.headers);
  if (reason) {
    return res
      .status(403)
      .set({ 'X-Robots-Tag': NOINDEX_ALL, 'Cache-Control': 'no-store' })
      .type('text/plain')
      .send(reason === 'ai' ? 'AI crawlers are not permitted on this site.\n' : 'Automated access is not permitted on this site.\n');
  }
  const directives = isEditor || req.path.startsWith('/api') ? NOINDEX_ALL : robotsDirectives(settings);
  if (directives) res.set('X-Robots-Tag', directives);
  next();
});

// Web app manifest (name + icon for "Add to Home Screen"), after the bot
// blocker so hidden sites don't hand it to crawlers either.
app.get('/manifest.webmanifest', (req, res) => {
  res.set('Cache-Control', 'no-cache').type('application/manifest+json').send(JSON.stringify(webManifest(getPage())));
});

/** Security headers (a hand-rolled subset of what `helmet` does). */
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': [
      "default-src 'self'",
      `script-src 'self' 'nonce-${res.locals.nonce}'`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "connect-src 'self'",
      `frame-src ${FRAME_SOURCES.join(' ')}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      // Any http:// sub-resource is fetched over https instead (production).
      httpsOnly(req) && 'upgrade-insecure-requests',
    ]
      .filter(Boolean)
      .join('; '),
  });
  next();
});

/* --------------------------------- API -------------------------------- */

app.use('/api', express.json({ limit: '512kb' }));
app.use('/api/auth', authRoutes);
app.use('/api/page', pageRoutes);
app.use('/api', draftRoutes);
app.use('/api', statsRoutes);
app.use('/api', visitorRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/feeds', feedRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/shortlinks', shortlinkRoutes);
// Health check (monitoring, `npm run update`). The version is only told to
// the server itself (not through the proxy), so it isn't public: the
// request must come from this machine, be addressed to a loopback name, and
// carry no proxy headers (a same-host proxy that forwards the public Host or
// adds any forwarding header gets no version).
const LOOPBACK_IP = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/;
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const PROXY_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'forwarded', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip'];
app.get('/api/health', (req, res) => {
  const local = LOOPBACK_IP.test(req.socket.remoteAddress || '')
    && LOOPBACK_HOST.test(req.headers.host || '')
    && !PROXY_HEADERS.some((h) => req.headers[h]);
  res.set('Cache-Control', 'no-store').json({ ok: true, ...(local && { version: config.version }) });
});
// Design presets installed as files on the server (lib/presets.js). Editor only.
app.get('/api/presets', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store').json({ presets: loadServerPresets() });
});
// Clean an imported preset file with the same rules as saved pages.
app.post('/api/presets/validate', requireAuth, (req, res) => {
  const preset = sanitizePreset(req.body, 'my');
  if (!preset) return res.status(400).json({ error: 'That file isn’t a Trellis preset (it needs a "name" and an "appearance").' });
  res.json(preset);
});
// Default DiceBear avatar (shown when there is no profile photo). Pure
// function of ?style & ?seed, so it is safe to cache publicly for a day.
app.get('/api/avatar.svg', (req, res) => {
  const style = typeof req.query.style === 'string' ? req.query.style : '';
  const seed = typeof req.query.seed === 'string' ? req.query.seed.slice(0, 64) : '';
  const svg = AVATAR_STYLES.includes(style) ? renderAvatar(style, seed) : null;
  if (!svg) return res.status(404).json({ error: 'Unknown avatar style' });
  res
    .set({
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
      // Opened directly, the SVG may not run anything or load anything.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
    })
    .send(svg);
});
// Lets the dev server (Vite) ask whether the current path is the editor.
// The path itself is the secret, so this reveals nothing new.
app.get('/api/editor-check', (req, res) => {
  res.set('Cache-Control', 'no-store').json({ editor: typeof req.query.path === 'string' && req.query.path.replace(/\/+$/, '') === getAdminPath() });
});
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

/* ------------------------------- Static ------------------------------- */

app.use(
  '/uploads',
  express.static(dataPath('uploads'), {
    maxAge: '30d',
    immutable: true,
    index: false,
    // PDFs download instead of opening inside the site, and can never run
    // anything with the site's permissions if a browser does open them.
    setHeaders: (res, file) => {
      if (file.endsWith('.pdf')) res.set({ 'Content-Disposition': 'attachment', 'Content-Security-Policy': "sandbox; default-src 'none'" });
    },
  }),
);

const hasClientBuild = fs.existsSync(path.join(config.clientDist, 'index.html'));

if (hasClientBuild) {
  // The raw template isn't a page of its own.
  app.get('/index.html', (req, res) => res.redirect(301, '/'));

  // Vite fingerprints everything in /assets, so it can be cached forever.
  app.use('/assets', express.static(path.join(config.clientDist, 'assets'), { maxAge: '1y', immutable: true }));
  app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));

  // The public page. Unknown query parameters are a 404 (see lib/params.js).
  app.get('/', (req, res, next) => {
    if (hasUnknownParams(req.query)) return next();
    // The canonical address: no query string (tracking parameters etc.).
    const url = `${publicOrigin(req)}/`;
    const html = renderShell(getPublicPage(), { url, nonce: res.locals.nonce });
    res.set('Cache-Control', 'no-cache').type('html').send(html);
  });

  // The editor, at its secret path (see lib/adminPath.js). Same HTML shell,
  // flagged as the editor, and locked down so the URL can't leak.
  app.get(/.*/, (req, res, next) => {
    if (!isAdminRequest(req)) return next();
    // Only the public version is inlined: the editor loads the draft after signing in.
    const html = renderShell(getPublicPage(), { url: '', nonce: res.locals.nonce, isAdmin: true });
    res
      .set({
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': res.get('Content-Security-Policy').replace("frame-ancestors 'self'", "frame-ancestors 'none'"),
        'X-Frame-Options': 'DENY',
      })
      .type('html')
      .send(html);
  });
} else {
  app.get('/', (req, res) =>
    res.type('text').send('Client not built yet. Run `npm run build`, or use `npm run dev` and open http://localhost:5173'),
  );
}

/* -------------------------------- 404 -------------------------------- */

// Everything else (unknown paths, unknown query parameters, the old /admin)
// is a 404. Browsers get a friendly page in the site's own design; images,
// scripts and API clients get a plain-text 404. Never indexed, never cached.
app.use((req, res) => {
  res.status(404).set({ 'X-Robots-Tag': NOINDEX_ALL, 'Cache-Control': 'no-store' });
  // Missing files (anything with an extension, like /assets/x.js or an
  // image) get a plain 404; page-like addresses get the designed 404 page.
  const isFile = /\.[a-z0-9]{1,8}$/i.test(req.path) && !/\.html?$/i.test(req.path);
  const wantsHtml = (req.method === 'GET' || req.method === 'HEAD') && !isFile && req.accepts(['html', 'json', 'text']) === 'html';
  const html = wantsHtml && hasClientBuild && renderShell(getPublicPage(), { url: '', nonce: res.locals.nonce, notFound: true });
  if (html) return res.type('html').send(html);
  res.type('text').send('Not found\n');
});

/* ------------------------------- Errors ------------------------------- */

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ValidationError || err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: err.message });
  }
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'File is too large' });
  // Other client errors raised by Express/body-parser (bad encoding, etc.):
  // pass the status through, without logging a stack trace.
  const status = Number(err.status || err.statusCode);
  if (status >= 400 && status < 500) return res.status(status).json({ error: err.expose ? err.message : 'Bad request' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, config.host, () => {
  console.log(`[server] Listening on http://${config.host}:${config.port}`);
  console.log(`[server] Data directory: ${config.dataDir}`);
  // The editor link itself is only printed when it was just created, so it
  // doesn't end up in the logs on every restart. `npm run admin-url` shows it.
  if (adminPathIsNew()) console.log(`[server] New editor link (keep private): http://${config.host}:${config.port}${getAdminPath()}`);
  else console.log('[server] Editor link: run `npm run admin-url` to see it.');
  if (!hasClientBuild) console.log('[server] No client build found — API only.');
});
