/**
 * Version history: snapshots of the page in DATA_DIR/versions/.
 *
 * Three kinds of snapshot:
 *   published  every publish (the last 50 are kept)
 *   autosave   the draft, at most one every 10 minutes while editing
 *              (the last 30 are kept)
 *   restore    taken automatically just before a version is restored
 *              (counted with autosaves)
 *
 * Each snapshot is a small JSON file named after its time and kind, so the
 * folder is easy to inspect or back up. The editor lists them and can load
 * any of them back into the draft.
 */
import fs from 'node:fs';
import path from 'node:path';
import { dataPath } from '../config.js';
import { writeFileAtomicSync } from './files.js';

const DIR = dataPath('versions');
const KEEP = { published: 50, autosave: 30 };
const AUTOSAVE_EVERY_MS = 10 * 60 * 1000;
const ID = /^(\d{8}T\d{9}Z)-(published|autosave|restore)$/;

let lastAutosave = 0;

/** "2026-10-10T20:15:03.123Z" -> "20261010T201503123Z" (sortable, file-safe). */
const stamp = (iso) => iso.replace(/[-:.]/g, '');

function list() {
  let files;
  try {
    files = fs.readdirSync(DIR);
  } catch {
    return [];
  }
  return files
    .map((f) => f.replace(/\.json$/, ''))
    .filter((id) => ID.test(id))
    .sort()
    .reverse(); // newest first
}

/** Delete old snapshots beyond the limits. */
function prune() {
  const ids = list();
  const published = ids.filter((id) => id.endsWith('-published'));
  const others = ids.filter((id) => !id.endsWith('-published'));
  for (const id of [...published.slice(KEEP.published), ...others.slice(KEEP.autosave)]) {
    fs.rmSync(path.join(DIR, `${id}.json`), { force: true });
  }
}

/**
 * Store a snapshot. Autosaves are throttled (one per 10 minutes); publishes
 * and pre-restore snapshots always go in. Never throws: history must not
 * break saving.
 * @param {object} page
 * @param {'published' | 'autosave' | 'restore'} kind
 */
export function recordVersion(page, kind) {
  try {
    const now = Date.now();
    if (kind === 'autosave') {
      if (now - lastAutosave < AUTOSAVE_EVERY_MS) return;
      lastAutosave = now;
    }
    fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
    const id = `${stamp(new Date(now).toISOString())}-${kind}`;
    writeFileAtomicSync(path.join(DIR, `${id}.json`), JSON.stringify(page), 0o600);
    prune();
  } catch (err) {
    console.warn(`[versions] Could not save a ${kind} snapshot: ${err.message}`);
  }
}

/** Metadata for the history list, newest first. */
export function listVersions() {
  return list().map((id) => {
    const [, ts, kind] = id.match(ID);
    const iso = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}.${ts.slice(15, 18)}Z`;
    let tiles = null;
    let name = '';
    try {
      const page = JSON.parse(fs.readFileSync(path.join(DIR, `${id}.json`), 'utf8'));
      tiles = page.tiles?.length ?? null;
      name = page.profile?.name || '';
    } catch {
      /* unreadable: still listed, restore will fail with a clear error */
    }
    return { id, kind, createdAt: iso, tiles, name };
  });
}

/** A stored snapshot, or null. */
export function getVersion(id) {
  if (typeof id !== 'string' || !ID.test(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, `${id}.json`), 'utf8'));
  } catch {
    return null;
  }
}

/** Testing hook: let the next autosave through immediately. */
export const resetAutosaveThrottle = () => {
  lastAutosave = 0;
};
