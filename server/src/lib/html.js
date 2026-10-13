/**
 * HTML helpers: escaping, stripping remote HTML to plain text, and rendering
 * the SPA shell with the page data and SEO/OpenGraph tags baked in.
 *
 * Baking the data into index.html means the public page renders on the first
 * request with no extra API round-trip, and link previews (Slack, iMessage,
 * Facebook…) get proper titles and descriptions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { backdropOf, cssVars, gradientTone } from './appearance.js';
import { robotsDirectives } from './robots.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for safe use inside HTML text or attribute values. */
export const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Serialize JSON for an inline <script> without allowing tag break-out. */
export const inlineJson = (value) =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/**
 * Turn remote HTML (e.g. a Mastodon post) into plain text. The client renders
 * it as text, so even if something slips through it can't execute.
 */
export function htmlToText(html = '') {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' })[e])
    .trim();
}

/**
 * <link> tags for the configured favicon: the default icon, an emoji
 * (rendered as an inline SVG data URL) or an uploaded image.
 * @param {{ type: string, emoji: string, image: string } | undefined} favicon
 */
export function faviconTags(favicon) {
  if (favicon?.type === 'emoji' && favicon.emoji) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="50" font-size="84" text-anchor="middle" dominant-baseline="central">${escapeHtml(favicon.emoji)}</text></svg>`;
    return [`<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(svg)}">`];
  }
  if (favicon?.type === 'image' && favicon.image) {
    const href = escapeHtml(favicon.image);
    return [`<link rel="icon" href="${href}">`, `<link rel="apple-touch-icon" href="${href}">`];
  }
  return ['<link rel="icon" type="image/svg+xml" href="/favicon.svg">'];
}

/**
 * The site's name, set in Settings → Site name (stored as settings.pageTitle).
 * Used for the browser tab, bookmarks, link previews, the home-screen icon
 * label and the web app manifest. Falls back to the profile name.
 */
export const siteName = (page) => page.settings.pageTitle || page.profile.name || 'About me';

/**
 * Web app manifest: lets phones show the right name and icon when someone
 * adds the page to their home screen. Generated from the current settings.
 */
export function webManifest(page) {
  const name = siteName(page);
  const { favicon, accent, appearance } = page.settings;
  const icon =
    favicon?.type === 'image' && favicon.image
      ? { src: favicon.image, sizes: 'any', purpose: 'any' }
      : { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' };
  return {
    name,
    short_name: Array.from(name).slice(0, 12).join(''),
    description: page.settings.description || page.profile.bio.slice(0, 160),
    start_url: '/',
    scope: '/',
    display: 'browser',
    theme_color: accent,
    background_color: appearance?.colors?.bg || '#fafafa',
    icons: [icon],
  };
}

let shellTemplate = null;

let shellStamp = '';
let shellCheckedAt = 0;

/**
 * client/dist/index.html, re-read whenever it changes (checked at most every
 * two seconds). A rebuild gives the JS/CSS new file names, so a stale copy
 * would point at files that no longer exist and the page would load blank.
 */
function getShell() {
  const now = Date.now();
  if (shellTemplate && now - shellCheckedAt < 2000) return shellTemplate;
  shellCheckedAt = now;
  const file = path.join(config.clientDist, 'index.html');
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return shellTemplate || null;
  }
  const stamp = `${stat.mtimeMs}:${stat.size}`;
  if (shellTemplate && stamp === shellStamp) return shellTemplate;
  try {
    shellTemplate = fs.readFileSync(file, 'utf8');
    shellStamp = stamp;
  } catch {
    /* mid-rebuild: keep the previous copy */
  }
  return shellTemplate || null;
}

/**
 * Render index.html with head tags and the initial page data.
 * @param {import('./validate.js').Page} page
 * @param {{ url: string, nonce: string, isAdmin?: boolean, notFound?: boolean }} opts
 *   request URL (for og:url), CSP nonce, editor page?, 404 page?
 */
export function renderShell(page, { url, nonce, isAdmin = false, notFound = false }) {
  const shell = getShell();
  if (!shell) return null;

  const { profile, settings } = page;
  const name = siteName(page);
  const title = isAdmin ? `Editor · ${name}` : notFound ? `Page not found · ${name}` : name;
  const description = settings.description || profile.bio.slice(0, 160);
  // Link previews: the custom share image (1200 × 630), else the profile photo.
  const shareImage = settings.shareImage || '';
  const imageSrc = shareImage || profile.avatar;
  // Only the public page has link-preview tags (the editor and the 404 page
  // render without a page address, so there is nothing to resolve against).
  let image = '';
  if (!isAdmin && !notFound && imageSrc) {
    try {
      image = new URL(imageSrc, url).toString();
    } catch {
      image = '';
    }
  }

  // The editor is never indexed by anything, whatever the page settings.
  // The editor and 404 pages are never indexed, whatever the page settings.
  const robots = robotsDirectives(settings, { isAdmin: isAdmin || notFound });
  const a = settings.appearance;

  // Runs before first paint: theme, colours, font, card style, animation,
  // and whether text sits on a busy background (animated effect or photo).
  const prePaint = `(function(){var r=document.documentElement,t=${inlineJson(gradientTone(a) || settings.theme)};` +
    `r.dataset.theme=t==='auto'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;` +
    `r.dataset.cards=${inlineJson(a.cardStyle)};r.dataset.anim=${inlineJson(a.animation)};` +
    `r.dataset.buttonShape=${inlineJson(a.buttonShape || 'card')};r.dataset.buttonFill=${inlineJson(a.buttonFill || 'card')};` +
    `r.dataset.backdrop=${inlineJson(backdropOf(a))};r.dataset.avatar=${inlineJson(a.avatarEffect || 'auto')};r.dataset.icons=${inlineJson(a.iconStyle || 'brand')};r.dataset.avatarTone=${inlineJson(a.avatarTone || 'color')};` +
    `var v=${inlineJson(cssVars(settings))};for(var k in v)r.style.setProperty(k,v[k]);})();`;

  // The editor page gets no description/OpenGraph tags (nothing to share or
  // index) and a flag telling the app to load the editor.
  const share = isAdmin || notFound
    ? []
    : [
        `<meta name="description" content="${escapeHtml(description)}">`,
        `<meta property="og:type" content="profile">`,
        `<meta property="og:site_name" content="${escapeHtml(name)}">`,
        `<meta property="og:title" content="${escapeHtml(title)}">`,
        `<meta property="og:description" content="${escapeHtml(description)}">`,
        `<meta property="og:url" content="${escapeHtml(url)}">`,
        image && `<meta property="og:image" content="${escapeHtml(image)}">`,
        image && shareImage && `<meta property="og:image:width" content="1200">`,
        image && shareImage && `<meta property="og:image:height" content="630">`,
        image && `<meta property="og:image:alt" content="${escapeHtml(name)}">`,
        `<meta name="twitter:card" content="${shareImage ? 'summary_large_image' : 'summary'}">`,
      ];

  const head = [
    `<title>${escapeHtml(title)}</title>`,
    robots && `<meta name="robots" content="${robots}">`,
    ...share,
    ...faviconTags(settings.favicon),
    `<meta name="application-name" content="${escapeHtml(name)}">`,
    `<meta name="apple-mobile-web-app-title" content="${escapeHtml(name)}">`,
    `<link rel="manifest" href="/manifest.webmanifest">`,
    `<meta name="theme-color" content="${escapeHtml(settings.accent)}">`,
    `<script nonce="${nonce}">${prePaint}window.__TRELLIS_PAGE__=${inlineJson(page)};window.__TRELLIS_EDITOR__=${isAdmin};window.__TRELLIS_404__=${notFound}</script>`,
  ]
    .filter(Boolean)
    .join('\n    ');

  // Drop the static fallback <title> and favicon, inject ours.
  return shell
    .replace(/<title>[^<]*<\/title>/, '')
    .replace(/<link rel="icon"[^>]*>/, '')
    // A function replacement: the head contains user text, and a string
    // replacement would interpret $& / $' / $` patterns in it.
    .replace('<!--app-head-->', () => head);
}
