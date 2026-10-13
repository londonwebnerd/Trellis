/**
 * Privacy-friendly statistics: page views and card clicks, counted on this
 * server. No cookies, no local storage, no fingerprinting scripts, no third
 * parties, and no IP addresses are stored.
 *
 * What is kept, per day (DATA_DIR/analytics.json):
 *   v   page views          u   unique visitors (see below)
 *   c   card clicks         tiles  clicks per card id
 *   ref referring sites (host names only)
 *   cty countries (only if the proxy sends a country header, see GEO_HEADER)
 *   lang  browser languages ("en", "fr"…), a rough stand-in for countries
 *   dev device type, br browser, os operating system (from the User-Agent)
 *   utm utm_source / utm_medium / utm_campaign of links that brought visitors
 *
 * Unique visitors are counted like Plausible/Fathom do it: a hash of a
 * random salt + IP + User-Agent, kept in memory for the current day only.
 * The salt is replaced every day and never written anywhere, so yesterday's
 * hashes can't be linked to today's or turned back into an IP.
 *
 * Not counted: bots and scripts, the signed-in editor, and visitors whose
 * browser sends "Do Not Track" or "Global Privacy Control".
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { config, dataPath } from '../config.js';
import { onShutdown, writeFileAtomicSync } from './files.js';

const FILE = dataPath('analytics.json');
const KEEP_DAYS = 400;
const MAX_KEYS = 200; // per map per day, so a flood of fake referrers can't bloat the file
const FLUSH_MS = 15_000;

/** @type {{ days: Record<string, any> }} */
let store = { days: {} };
let dirty = false;
// Today's random key, and when each (hashed) visitor last viewed the page or
// clicked a card. Kept in memory only and thrown away at midnight.
let salt = { day: '', value: '', seen: new Map(), clicks: new Map() };
const VIEW_GAP_MS = 30 * 60_000; // reloads within 30 minutes are one view
const CLICK_GAP_MS = 5 * 60_000; // repeat clicks on one card within 5 minutes are one click
const MAX_TRACKED = 200_000;

try {
  store = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (!store || typeof store.days !== 'object') store = { days: {} };
} catch {
  /* first run */
}

const today = () => new Date().toISOString().slice(0, 10);

function bucket(day) {
  store.days[day] ||= { v: 0, u: 0, c: 0, tiles: {}, ref: {}, cty: {}, lang: {}, dev: {}, br: {}, os: {}, utm: { source: {}, medium: {}, campaign: {} } };
  return store.days[day];
}

/** Count `key` in a map, refusing new keys once the map is full. */
function bump(map, key, by = 1) {
  if (!key) return;
  const k = String(key).slice(0, 120);
  if (!(k in map) && Object.keys(map).length >= MAX_KEYS) return;
  map[k] = (map[k] || 0) + by;
}

/* ------------------------------- Parsing ------------------------------- */

/** Device, browser and OS from a User-Agent (coarse on purpose). */
export function parseUserAgent(ua = '') {
  const dev = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua) ? 'Tablet' : /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua) ? 'Mobile' : 'Desktop';
  const br = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /Firefox\/|FxiOS/.test(ua)
          ? 'Firefox'
          : /Chrome\/|CriOS/.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Other';
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /CrOS/.test(ua)
            ? 'ChromeOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Other';
  return { dev, br, os };
}

/** Host name of a referrer URL, minus "www.", or '' (also '' for this site). */
export function referrerHost(ref, ownHost) {
  try {
    const host = new URL(ref).hostname.replace(/^www\./, '').toLowerCase();
    if (!host || host === (ownHost || '').replace(/^www\./, '').toLowerCase()) return '';
    return host;
  } catch {
    return '';
  }
}

/** Main language from Accept-Language ("en-GB,en;q=0.9" -> "en"). */
const language = (header = '') => (header.split(',')[0] || '').trim().split('-')[0].toLowerCase().replace(/[^a-z]/g, '').slice(0, 3);

/** Country code from a proxy header (nginx geoip2, Cloudflare…), if configured/present. */
function country(req) {
  const value = req.get(config.geoHeader) || '';
  return /^[A-Z]{2}$/i.test(value) && !/^(XX|T1|A1|A2|O1)$/i.test(value) ? value.toUpperCase() : '';
}

/** Whether this visitor asked not to be tracked. */
const optedOut = (req) => req.get('DNT') === '1' || req.get('Sec-GPC') === '1';

/* ------------------------------- Counting ------------------------------ */

/** Today's anonymous visitor hash: IP and browser with a daily random key. */
function visitorHash(req) {
  const day = today();
  if (salt.day !== day) salt = { day, value: crypto.randomBytes(16).toString('hex'), seen: new Map(), clicks: new Map() };
  return crypto.createHash('sha256').update(`${salt.value}|${req.ip}|${req.get('User-Agent') || ''}`).digest('base64url').slice(0, 16);
}

/**
 * Whether a view counts, and whether it's a new visitor today. A script
 * reloading the page all day only adds one view every 30 minutes.
 * @returns {{ count: boolean, isNew: boolean }}
 */
function checkView(req) {
  const hash = visitorHash(req);
  const now = Date.now();
  const last = salt.seen.get(hash);
  if (last === undefined) {
    // Bounded memory under a flood of fake addresses: past the cap, views
    // still count but everyone is a returning visitor until tomorrow.
    if (salt.seen.size >= MAX_TRACKED) return { count: true, isNew: false };
    salt.seen.set(hash, now);
    return { count: true, isNew: true };
  }
  if (now - last < VIEW_GAP_MS) return { count: false, isNew: false };
  salt.seen.set(hash, now);
  return { count: true, isNew: false };
}

/** Whether a click on this card counts (once per visitor every 5 minutes). */
function checkClick(req, tile) {
  const key = `${visitorHash(req)}|${tile}`;
  const now = Date.now();
  const last = salt.clicks.get(key);
  if (last !== undefined && now - last < CLICK_GAP_MS) return false;
  if (last === undefined && salt.clicks.size >= MAX_TRACKED) return true;
  salt.clicks.set(key, now);
  return true;
}

/**
 * Record a page view or a click.
 * @param {import('express').Request} req
 * @param {{ type: 'view' | 'click' | 'link', tile?: string, slug?: string, referrer?: string, utm?: Record<string,string> }} event
 */
export function recordEvent(req, event) {
  if (optedOut(req)) return false;
  const day = bucket(today());
  if (event.type === 'view') {
    const { count, isNew } = checkView(req);
    if (!count) return false;
    day.v += 1;
    if (isNew) day.u += 1;
    bump(day.ref, referrerHost(event.referrer, req.hostname));
    bump(day.cty, country(req));
    bump(day.lang, language(req.get('Accept-Language')));
    const { dev, br, os } = parseUserAgent(req.get('User-Agent'));
    bump(day.dev, dev);
    bump(day.br, br);
    bump(day.os, os);
    for (const k of ['source', 'medium', 'campaign']) bump(day.utm[k], typeof event.utm?.[k] === 'string' ? event.utm[k].toLowerCase().trim() : '');
  } else if (event.type === 'click' && event.tile) {
    if (!checkClick(req, event.tile)) return false;
    day.c += 1;
    bump(day.tiles, event.tile);
  } else if (event.type === 'link' && event.slug) {
    // A visit to a short link (example.com/cv).
    day.links ||= {};
    bump(day.links, event.slug);
    bump(day.ref, referrerHost(event.referrer, req.hostname));
  } else {
    return false;
  }
  dirty = true;
  return true;
}

/* ------------------------------- Reading ------------------------------- */

const add = (into, from) => {
  for (const [k, n] of Object.entries(from || {})) into[k] = (into[k] || 0) + n;
};
const top = (map, n = 12) =>
  Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));

/**
 * Totals and breakdowns for the last `days` days (today included).
 * @param {number} days
 */
export function summary(days) {
  const daily = [];
  const totals = { views: 0, visitors: 0, clicks: 0 };
  const maps = { tiles: {}, links: {}, ref: {}, cty: {}, lang: {}, dev: {}, br: {}, os: {}, source: {}, medium: {}, campaign: {} };
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    const d = store.days[date];
    daily.push({ date, views: d?.v || 0, visitors: d?.u || 0, clicks: d?.c || 0 });
    if (!d) continue;
    totals.views += d.v;
    totals.visitors += d.u;
    totals.clicks += d.c;
    for (const key of ['tiles', 'links', 'ref', 'cty', 'lang', 'dev', 'br', 'os']) add(maps[key], d[key]);
    for (const key of ['source', 'medium', 'campaign']) add(maps[key], d.utm?.[key]);
  }
  return {
    days,
    totals,
    daily,
    tiles: top(maps.tiles, 200),
    shortLinks: top(maps.links, 200),
    referrers: top(maps.ref),
    countries: top(maps.cty),
    languages: top(maps.lang),
    devices: top(maps.dev),
    browsers: top(maps.br),
    os: top(maps.os),
    utm: { source: top(maps.source), medium: top(maps.medium), campaign: top(maps.campaign) },
    geo: Object.keys(maps.cty).length > 0,
  };
}

/** Delete every statistic. */
export function resetStats() {
  store = { days: {} };
  dirty = true;
  flush();
}

/* ------------------------------- Saving -------------------------------- */

function flush() {
  if (!dirty) return;
  dirty = false;
  // Drop days past the retention period.
  const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  for (const day of Object.keys(store.days)) if (day < cutoff) delete store.days[day];
  try {
    writeFileAtomicSync(FILE, JSON.stringify(store), 0o600);
  } catch (err) {
    dirty = true;
    console.warn(`[analytics] Could not save statistics: ${err.message}`);
  }
}

setInterval(flush, FLUSH_MS).unref();
onShutdown(flush);
