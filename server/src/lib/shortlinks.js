/**
 * Short links on your own domain: https://example.com/cv → anywhere.
 *
 * DATA_DIR/shortlinks.json: [{ slug, url, note, created, clicks, lastClick }]
 *
 * Changes apply straight away (they aren't part of the draft/publish cycle,
 * like the inbox). Redirects are 302s, so changing where a link points
 * takes effect immediately even for people who've used it before.
 */
import fs from 'node:fs';
import { dataPath } from '../config.js';
import { getAdminPath } from './adminPath.js';
import { onShutdown, writeFileAtomicSync } from './files.js';
import { ValidationError } from './validate.js';

const FILE = dataPath('shortlinks.json');
const MAX_LINKS = 500;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

/** Addresses the site itself uses (and some that look official). */
const RESERVED = new Set([
  'api', 'uploads', 'assets', 'index.html', 'robots.txt', 'manifest.webmanifest', 'favicon.ico', 'favicon.svg',
  'sitemap.xml', 'admin', 'login', 'logout', 'editor', 'edit', '.well-known', 'xrpc', 'health',
]);

/** @type {{ slug: string, url: string, note: string, created: string, clicks: number, lastClick: string | null }[]} */
let links = [];
try {
  const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (Array.isArray(parsed)) links = parsed.filter((l) => l && typeof l.slug === 'string' && typeof l.url === 'string');
} catch {
  /* none yet */
}

let saveTimer = null;
const saveNow = () => {
  clearTimeout(saveTimer);
  saveTimer = null;
  writeFileAtomicSync(FILE, JSON.stringify(links, null, 2), 0o600);
};
/** Click counts are saved a few seconds later, in one write. */
const saveSoon = () => {
  if (saveTimer) return;
  saveTimer = setTimeout(saveNow, 5000);
  saveTimer.unref?.();
};
onShutdown(() => saveTimer && saveNow());

/** Normalise a slug as typed ("/CV " → "cv"). */
export const normalizeSlug = (s) => String(s || '').trim().replace(/^\/+|\/+$/g, '').toLowerCase();

function cleanUrl(value) {
  let url = String(value || '').trim();
  if (!url) throw new ValidationError('Enter the address the short link should go to.');
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(url)) url = `https://${url}`;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError('That doesn’t look like a web address.');
  }
  if (!/^(https?:|mailto:|tel:)$/.test(parsed.protocol)) throw new ValidationError('Short links can point to http(s), mailto: and tel: addresses only.');
  if (url.length > 2000) throw new ValidationError('That address is too long.');
  return parsed.href;
}

function cleanSlug(value) {
  const slug = normalizeSlug(value);
  if (!SLUG_RE.test(slug)) throw new ValidationError('Use 1–64 letters, numbers, dashes, dots or underscores (e.g. “cv” or “github”).');
  const admin = getAdminPath().replace(/^\//, '').toLowerCase();
  if (RESERVED.has(slug) || slug === admin || slug.startsWith('assets') || /\.(js|css|map|png|jpe?g|webp|svg|ico|txt|xml|json)$/.test(slug)) {
    throw new ValidationError(`“${slug}” is used by the site itself. Pick another name.`);
  }
  return slug;
}

const view = (l) => ({ ...l });

/** All short links, A–Z. */
export const listShortLinks = () => [...links].sort((a, b) => a.slug.localeCompare(b.slug)).map(view);

/** The link for an address path segment, or null. */
export function findShortLink(slug) {
  const s = normalizeSlug(slug);
  return links.find((l) => l.slug === s) || null;
}

/** Add a link: { slug, url, note }. */
export function addShortLink(input) {
  const slug = cleanSlug(input?.slug);
  if (findShortLink(slug)) throw new ValidationError(`/${slug} already exists.`);
  if (links.length >= MAX_LINKS) throw new ValidationError(`You can have up to ${MAX_LINKS} short links.`);
  const link = { slug, url: cleanUrl(input?.url), note: String(input?.note || '').trim().slice(0, 200), created: new Date().toISOString(), clicks: 0, lastClick: null };
  links.push(link);
  saveNow();
  return view(link);
}

/** Change a link (slug, url or note). Renaming keeps its click count. */
export function updateShortLink(slug, input) {
  const link = findShortLink(slug);
  if (!link) return null;
  const nextSlug = input?.slug !== undefined ? cleanSlug(input.slug) : link.slug;
  if (nextSlug !== link.slug && findShortLink(nextSlug)) throw new ValidationError(`/${nextSlug} already exists.`);
  const next = {
    ...link,
    slug: nextSlug,
    url: input?.url !== undefined ? cleanUrl(input.url) : link.url,
    note: input?.note !== undefined ? String(input.note || '').trim().slice(0, 200) : link.note,
  };
  links = links.map((l) => (l === link ? next : l));
  saveNow();
  return view(next);
}

export function deleteShortLink(slug) {
  const before = links.length;
  links = links.filter((l) => l.slug !== normalizeSlug(slug));
  if (links.length === before) return false;
  saveNow();
  return true;
}

/** Count one visit to a link (not called for bots or the signed-in editor). */
export function countClick(link) {
  link.clicks += 1;
  link.lastClick = new Date().toISOString();
  saveSoon();
}

/** For tests: write pending counts now. */
export const flushShortLinks = () => saveTimer && saveNow();
