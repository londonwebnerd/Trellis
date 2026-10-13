/**
 * Tile sizing.
 *
 * Every tile has a width `w` (1–4 grid columns) and height `h` (1–8 rows).
 * A row is half a cell, so h=2 is a square-ish card, h=4 a tall card and
 * h=1 a slim, Linktree-style button bar. On phones the grid has 2 columns,
 * so widths 3–4 collapse to 2 (see styles/base.css).
 *
 * Tile components don't care about exact numbers: they get a `shape`
 * (bar | sm | wide | tall | lg) describing roughly how much room they have.
 */

export const MAX_W = 4;
export const MAX_H = 8;

/** Named presets shown in the size picker. */
export const SIZE_PRESETS = [
  { key: 'bar', label: 'Button', w: 4, h: 1 },
  { key: 'sm', label: 'Small', w: 1, h: 2 },
  { key: 'wide', label: 'Wide', w: 2, h: 2 },
  { key: 'tall', label: 'Tall', w: 1, h: 4 },
  { key: 'lg', label: 'Large', w: 2, h: 4 },
];

/** Pre-v2 pages used named sizes. */
const LEGACY = { sm: [1, 2], wide: [2, 2], tall: [1, 4], lg: [2, 4], full: [4, 1] };

/**
 * Rough shape of a tile, used by tile components to decide what to show.
 * @param {{ w: number, h: number }} tile
 * @returns {'bar' | 'sm' | 'wide' | 'tall' | 'lg'}
 */
export function shapeOf({ w, h }) {
  if (h <= 1) return 'bar';
  if (w === 1) return h <= 2 ? 'sm' : 'tall';
  return h <= 2 ? 'wide' : 'lg';
}

/** True for shapes with room for a preview below the header. */
export const isRoomy = (shape) => shape === 'tall' || shape === 'lg';

/** True for shapes with room for any preview at all. */
export const hasPreviewRoom = (shape) => shape === 'wide' || isRoomy(shape);

const clamp = (n, min, max) => Math.min(max, Math.max(min, Math.round(n)));

/**
 * Clamp a size to what a tile type allows (see `layout` in tileRegistry.js).
 * @param {{ minW?: number, maxW?: number, minH?: number, maxH?: number }} limits
 */
export function clampSize(limits = {}, w, h) {
  return {
    w: clamp(w, limits.minW ?? 1, limits.maxW ?? MAX_W),
    h: clamp(h, limits.minH ?? 1, limits.maxH ?? MAX_H),
  };
}

/**
 * Bring a tile from an older page/backup up to the w/h model, and keep its
 * size within what its type allows (an imported JSON file or an older page
 * may hold, say, a TikTok video one row tall).
 * @param {object} tile
 * @param {Record<string, { layout?: object }>} [types] tile registry (TILE_TYPES)
 */
export function normalizeTile(tile, types) {
  let t = tile;
  if (!Number.isInteger(t.w) || !Number.isInteger(t.h)) {
    const [w, h] = LEGACY[t.size] || LEGACY.sm;
    const { size: _legacy, ...rest } = t;
    t = { ...rest, w, h };
  }
  const limits = types?.[t.type]?.layout;
  if (!limits) return t;
  const c = clampSize(limits, t.w, t.h);
  return c.w === t.w && c.h === t.h ? t : { ...t, ...c };
}

/**
 * Normalise all tiles of a page.
 * @param {object} page
 * @param {Record<string, { layout?: object }>} [types] tile registry (TILE_TYPES)
 */
export const normalizePage = (page, types) => ({ ...page, tiles: page.tiles.map((t) => normalizeTile(t, types)) });
