/**
 * Custom design presets: turning the current design into a preset, and
 * preset files (.json) for sharing designs between pages and servers.
 *
 * A preset file looks like this (every appearance field is optional and
 * falls back to the defaults; see docs/customising.md):
 *
 *   {
 *     "trellisPreset": 1,
 *     "name": "Forest",
 *     "theme": "dark",
 *     "accent": "#4ade80",
 *     "appearance": { "cardStyle": "glass", "font": "outfit", ... }
 *   }
 *
 * Imported files are cleaned by the server (POST /api/presets/validate, the
 * same sanitizePreset() used for saved pages) *before* the editor renders
 * them, so a malformed or hostile file can't break the editor.
 */
import { api } from '../api/client.js';
import { withAppearanceDefaults } from './appearance.js';

export const PRESET_FILE_VERSION = 1;
export const MAX_CUSTOM_PRESETS = 24;
const MAX_FILE_BYTES = 64 * 1024;

const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24) || 'preset';

/** A new unique key for a saved preset ("my-forest-k3x9"). */
export const newPresetKey = (name) => `my-${slug(name)}-${Math.random().toString(36).slice(2, 6)}`;

/** Appearance without the bookkeeping field `preset`. */
function cleanAppearance(appearance) {
  const { preset: _ignored, ...rest } = withAppearanceDefaults(appearance);
  return rest;
}

/**
 * Snapshot the page's current design as a preset.
 * @param {import('./types.js').Settings} settings
 * @param {string} name
 */
export function presetFromSettings(settings, name) {
  return {
    key: newPresetKey(name),
    name: name.trim().slice(0, 40),
    theme: settings.theme,
    accent: settings.accent,
    appearance: cleanAppearance(settings.appearance),
  };
}

/**
 * Preset file contents. Uploaded background photos (/uploads/…) only exist on
 * this server, so they are left out; https image URLs are kept.
 */
export function toPresetFile(preset) {
  const appearance = cleanAppearance(preset.appearance);
  if (appearance.background.image.startsWith('/uploads/')) {
    appearance.background = { ...appearance.background, image: '', type: appearance.background.type === 'image' ? 'none' : appearance.background.type };
  }
  return `${JSON.stringify({ trellisPreset: PRESET_FILE_VERSION, name: preset.name, theme: preset.theme, accent: preset.accent, appearance }, null, 2)}\n`;
}

/** Offer a preset as a .json download. */
export function downloadPresetFile(preset) {
  const blob = new Blob([toPresetFile(preset)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trellis-preset-${slug(preset.name)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Read a preset file chosen by the user and have the server clean it.
 * Throws an Error with a readable message if it isn't a preset.
 * @param {File} file
 */
export async function readPresetFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error('That file is too large to be a preset.');
  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error('That file isn’t valid JSON.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw.appearance || typeof raw.appearance !== 'object') {
    throw new Error('That file isn’t a Trellis preset (no "appearance").');
  }
  const name = (typeof raw.name === 'string' && raw.name.trim()) || file.name.replace(/\.json$/i, '');
  const clean = await api.validatePreset({ ...raw, name: name.slice(0, 40), key: undefined });
  return { ...clean, key: newPresetKey(clean.name) };
}
