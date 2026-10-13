/**
 * Page storage: the published page, the editor's draft, and what visitors get.
 *
 * Files in DATA_DIR:
 *   page.json   the published page: what visitors see
 *   draft.json  the editor's working copy, only while it has unpublished
 *               changes (autosave writes here; "Publish" copies it to
 *               page.json and removes it; "Discard" just removes it)
 *   versions/   history snapshots (see versions.js)
 *
 * The page is a single small JSON document, so a flat file is the lightest
 * possible "database": no native modules, easy to back up and edit by hand.
 * Both documents are kept in memory and written atomically (temp file +
 * rename), one write at a time.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { dataPath } from '../config.js';
import { createDefaultPage } from './defaultPage.js';
import { writeFileAtomicSync } from './files.js';
import { sanitizePage } from './validate.js';
import { recordVersion } from './versions.js';

const PAGE_FILE = dataPath('page.json');
const DRAFT_FILE = dataPath('draft.json');

/** @type {import('./validate.js').Page | null} */
let page = null;
/** @type {import('./validate.js').Page | null} null = no unpublished changes */
let draft = null;

/** Serialises writes so two quick saves can't interleave. */
let writeQueue = Promise.resolve();

/** Listeners notified after every publish (used to bust HTML caches). */
const listeners = new Set();

/** Ensure the data directory (and uploads sub-folder) exists. */
export function ensureDataDir() {
  fs.mkdirSync(dataPath('uploads'), { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Load the page (and any draft) from disk, creating a starter page on first
 * run. Called once at boot. Re-validating on load also migrates pages saved
 * by older versions.
 */
export function loadPage() {
  ensureDataDir();
  if (fs.existsSync(PAGE_FILE)) {
    const stored = readJson(PAGE_FILE);
    page = { ...sanitizePage(stored), updatedAt: stored.updatedAt };
  } else {
    page = { ...sanitizePage(createDefaultPage()), updatedAt: new Date().toISOString() };
    writeFileAtomicSync(PAGE_FILE, JSON.stringify(page, null, 2), 0o600);
    console.log(`[store] Created starter page at ${PAGE_FILE}`);
  }
  if (fs.existsSync(DRAFT_FILE)) {
    try {
      const stored = readJson(DRAFT_FILE);
      draft = { ...sanitizePage(stored), updatedAt: stored.updatedAt };
    } catch (err) {
      console.warn(`[store] Ignoring unreadable draft.json: ${err.message}`);
    }
  }
  return page;
}

/** The published page (all tiles, including hidden/scheduled/locked ones). */
export function getPage() {
  return page;
}

/** The editor's working copy: the draft if there is one, else the published page. */
export function getDraft() {
  return draft || page;
}

/**
 * The working copy's revision: its save time. Every save, publish and
 * discard gives it a new one, so an editor tab can tell whether someone
 * (another tab, another device) saved since it last looked.
 */
export const draftRevision = () => getDraft().updatedAt || '';

/** A save time that's always later than the current revision. */
function nextStamp() {
  const prev = Date.parse(draftRevision()) || 0;
  return new Date(Math.max(Date.now(), prev + 1)).toISOString();
}

/** Comparable form of a page (ignores timestamps). */
const comparable = (p) => JSON.stringify({ ...p, updatedAt: undefined });

/** True when the draft differs from what's published. */
export function hasUnpublishedChanges() {
  return Boolean(draft) && comparable(draft) !== comparable(page);
}

async function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  // 0600: the page holds hidden, scheduled and code-locked cards.
  await fsp.writeFile(tmp, data, { mode: 0o600 });
  await fsp.chmod(tmp, 0o600);
  await fsp.rename(tmp, file);
}

/** Thrown when a write was based on an older revision (see draftRevision). */
export class ConflictError extends Error {
  constructor() {
    super('This page was changed in another tab or on another device.');
    this.code = 'conflict';
  }
}

/** Inside the write queue, so two saves at the same instant can't both pass. */
const checkBase = (base) => {
  if (base !== undefined && base !== draftRevision()) throw new ConflictError();
};

/** Queue a write; failures reject for the caller but don't stop the queue. */
function enqueue(task) {
  const job = writeQueue.then(task);
  writeQueue = job.catch((err) => console.error('[store] Write failed:', err.message));
  return job;
}

/**
 * Save the editor's working copy (autosave). Doesn't change what visitors see.
 * @param {import('./validate.js').Page} next already validated
 * @param {{ base?: string }} [options] base: the revision the editor last saw
 *   (throws ConflictError if the draft changed since)
 */
export function saveDraft(next, { base } = {}) {
  return enqueue(async () => {
    checkBase(base);
    const candidate = { ...next, updatedAt: nextStamp() };
    await writeAtomic(DRAFT_FILE, JSON.stringify(candidate, null, 2));
    draft = candidate;
    recordVersion(candidate, 'autosave');
    return candidate;
  });
}

/**
 * Publish: the draft (or `next`, if given) becomes the live page.
 * @param {import('./validate.js').Page} [next] already validated
 * @param {{ base?: string }} [options] see saveDraft
 */
export function publish(next, { base } = {}) {
  return enqueue(async () => {
    checkBase(base);
    const candidate = { ...(next || getDraft()), updatedAt: nextStamp() };
    await writeAtomic(PAGE_FILE, JSON.stringify(candidate, null, 2));
    // Only now does the new version go live: if the write fails, visitors
    // keep seeing the page that is actually on disk.
    page = candidate;
    draft = null;
    await fsp.rm(DRAFT_FILE, { force: true });
    recordVersion(candidate, 'published');
    listeners.forEach((fn) => fn(page));
    return candidate;
  });
}

/** Throw away unpublished changes. */
export function discardDraft({ base } = {}) {
  return enqueue(async () => {
    checkBase(base);
    draft = null;
    await fsp.rm(DRAFT_FILE, { force: true });
  }).then(() => page);
}

/**
 * Backwards-compatible "save and publish in one go" (PUT /api/page, used by
 * scripts and older editors).
 */
export const savePage = (next) => publish(next);

/** Subscribe to publishes. Returns an unsubscribe function. */
export function onPageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* --------------------------- What visitors get -------------------------- */

/**
 * Is a tile visible to visitors right now? Hidden tiles never are; scheduled
 * ones only between `showFrom` and `showUntil` (ISO dates, either optional).
 * @param {import('./validate.js').Tile} tile
 * @param {number} [now]
 */
export function isTileLive(tile, now = Date.now()) {
  const v = tile.visibility || {};
  if (v.hidden) return false;
  if (v.showFrom && Date.parse(v.showFrom) > now) return false;
  if (v.showUntil && Date.parse(v.showUntil) <= now) return false;
  return true;
}

/**
 * The published page as sent to visitors: hidden and out-of-schedule tiles
 * removed, and the secrets of code-locked tiles stripped (their address is
 * only revealed by POST /api/unlock/:id with the right code).
 */
export function getPublicPage(now = Date.now()) {
  return {
    ...page,
    tiles: page.tiles.filter((t) => isTileLive(t, now)).map(publicTile),
  };
}

/**
 * Remove secrets from a tile before it's sent to a visitor. A code-locked
 * card only keeps its title and subtitle; everything else (links, files,
 * addresses…) comes from POST /api/unlock/:id once the code is right.
 */
function publicTile(tile) {
  const lock = tile.lock;
  if (!lock || lock.type !== 'code') return tile;
  const data = {};
  for (const key of ['title', 'subtitle']) if (typeof tile.data[key] === 'string') data[key] = tile.data[key];
  return { ...tile, data, lock: { type: 'code', hint: lock.hint || '' } };
}

/** Find a live tile on the published page (for feeds, unlock, forms…). */
export function findLiveTile(id) {
  const tile = page.tiles.find((t) => t.id === id);
  return tile && isTileLive(tile) ? tile : null;
}
