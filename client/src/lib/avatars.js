/**
 * Default (no-photo) avatar styles, drawn by DiceBear on the server
 * (server/src/lib/avatar.js, GET /api/avatar.svg). Keep the ids in sync.
 *
 * All of these are licensed CC0 / MIT / "free for commercial use", so no
 * attribution is needed on client pages.
 */
export const AVATAR_STYLES = [
  { id: 'notionists', label: 'Sketch' },
  { id: 'lorelei', label: 'Lorelei' },
  { id: 'open-peeps', label: 'Peeps' },
  { id: 'avataaars', label: 'Cartoon' },
  { id: 'thumbs', label: 'Thumbs' },
  { id: 'bottts', label: 'Robots' },
  { id: 'pixel-art', label: 'Pixel' },
  { id: 'shapes', label: 'Shapes' },
  { id: 'glass', label: 'Glass' },
  { id: 'initials', label: 'Letters' },
];

export const DEFAULT_AVATAR_STYLE = 'notionists';

/** The seed actually used: the custom one, else the name, else a constant. */
export const avatarSeed = (profile) => profile.avatarSeed || profile.name || 'trellis';

/**
 * URL of the generated avatar, or '' when the style is plain initials.
 * @param {{ avatarStyle?: string, avatarSeed?: string, name?: string }} profile
 * @param {string} [style] override (used by the editor's style picker)
 */
export function avatarUrl(profile, style = profile.avatarStyle || DEFAULT_AVATAR_STYLE) {
  if (style === 'initials') return '';
  const params = new URLSearchParams({ style, seed: avatarSeed(profile) });
  return `/api/avatar.svg?${params}`;
}

/** A short random seed for the "shuffle" button. */
export const randomSeed = () => Math.random().toString(36).slice(2, 10);
