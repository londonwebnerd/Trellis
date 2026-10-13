/**
 * Server presets: design presets installed as files, so whoever runs the
 * server can offer "house" designs to every page without touching the code.
 *
 * Every `*.json` file directly in the presets folder (config.presetsDir,
 * `presets/` by default, or PRESETS_DIR) is one preset in the format that
 * the editor's "Export" button produces (see docs/customising.md). Files are
 * validated with the same rules as saved pages; invalid ones are skipped with
 * a warning. The folder is re-read when it changes, so adding a preset needs
 * no restart.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { sanitizePreset } from './validate.js';

const MAX_FILES = 50;
const MAX_BYTES = 64 * 1024;

let cache = { stamp: '', presets: [] };

/** Cheap change detector: file names + sizes + mtimes. */
function folderStamp(files) {
  return files
    .map((f) => {
      const st = fs.statSync(path.join(config.presetsDir, f));
      return `${f}:${st.size}:${st.mtimeMs}`;
    })
    .join('|');
}

/** @returns {ReturnType<typeof sanitizePreset>[]} */
export function loadServerPresets() {
  let files;
  try {
    files = fs
      .readdirSync(config.presetsDir)
      .filter((f) => f.endsWith('.json') && !f.startsWith('.'))
      .sort()
      .slice(0, MAX_FILES);
  } catch {
    return []; // no presets folder: that's fine
  }

  const stamp = folderStamp(files);
  if (stamp === cache.stamp) return cache.presets;

  const presets = [];
  const seen = new Set();
  for (const file of files) {
    const full = path.join(config.presetsDir, file);
    try {
      if (fs.statSync(full).size > MAX_BYTES) throw new Error('file is larger than 64 KB');
      const raw = JSON.parse(fs.readFileSync(full, 'utf8'));
      const preset = sanitizePreset({ ...raw, key: raw.key || path.basename(file, '.json') }, 'site');
      if (!preset) throw new Error('missing "name"');
      if (seen.has(preset.key)) throw new Error(`duplicate key "${preset.key}"`);
      seen.add(preset.key);
      presets.push(preset);
    } catch (err) {
      console.warn(`[presets] Skipping ${file}: ${err.message}`);
    }
  }
  cache = { stamp, presets };
  return presets;
}
