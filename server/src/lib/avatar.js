/**
 * Default avatars, generated with DiceBear (https://www.dicebear.com).
 *
 * When a page has no profile photo we draw a friendly illustrated avatar
 * instead of plain initials. The avatar is fully deterministic: the same
 * style + seed always gives the same picture, so URLs can be cached for a
 * long time and nothing is stored on disk.
 *
 * Only styles whose artwork licence allows commercial use WITHOUT
 * attribution are offered (CC0, MIT or "free for personal and commercial
 * use"), so client pages never need a credits line. The licence is also
 * embedded in each SVG's <metadata> by DiceBear itself.
 *
 * Keep STYLE_IDS in sync with client/src/lib/avatars.js.
 */
import { createAvatar } from '@dicebear/core';
import * as avataaars from '@dicebear/avataaars';
import * as bottts from '@dicebear/bottts';
import * as glass from '@dicebear/glass';
import * as lorelei from '@dicebear/lorelei';
import * as notionists from '@dicebear/notionists';
import * as openPeeps from '@dicebear/open-peeps';
import * as pixelArt from '@dicebear/pixel-art';
import * as shapes from '@dicebear/shapes';
import * as thumbs from '@dicebear/thumbs';

/** Soft pastel backdrops for the character styles (picked per seed). */
const PASTELS = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', 'c7f0d8', 'fde68a'];

/** id -> { style, options } */
const STYLES = {
  notionists: { style: notionists, options: { backgroundColor: PASTELS } },
  lorelei: { style: lorelei, options: { backgroundColor: PASTELS } },
  'open-peeps': { style: openPeeps, options: { backgroundColor: PASTELS } },
  avataaars: { style: avataaars, options: { backgroundColor: PASTELS } },
  thumbs: { style: thumbs, options: {} },
  bottts: { style: bottts, options: { backgroundColor: PASTELS } },
  'pixel-art': { style: pixelArt, options: { backgroundColor: PASTELS } },
  shapes: { style: shapes, options: {} },
  glass: { style: glass, options: {} },
};

/** All DiceBear style ids, plus 'initials' (no DiceBear: plain letters). */
export const AVATAR_STYLES = [...Object.keys(STYLES), 'initials'];
export const DEFAULT_AVATAR_STYLE = 'notionists';

/** Small in-memory cache: a page normally only ever asks for one avatar. */
const cache = new Map();
const CACHE_MAX = 200;

/**
 * Render an avatar as an SVG string, or null for an unknown style.
 * @param {string} styleId
 * @param {string} seed
 */
export function renderAvatar(styleId, seed) {
  const def = STYLES[styleId];
  if (!def) return null;
  const key = `${styleId}\u0000${seed}`;
  let svg = cache.get(key);
  if (!svg) {
    svg = createAvatar(def.style, { seed, size: 256, radius: 0, ...def.options }).toString();
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, svg);
  }
  return svg;
}
