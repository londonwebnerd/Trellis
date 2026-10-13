/**
 * Shared JSDoc type definitions (no runtime code).
 * These mirror the server-side schema in server/src/lib/validate.js.
 *
 * @typedef {object} Tile
 * @property {string} id      unique id, e.g. "t_k3j9x0aa"
 * @property {string} type    key of TILE_TYPES in tileRegistry.js
 * @property {number} w       width in grid columns (1–4)
 * @property {number} h       height in rows (1–8; 2 = square, 1 = button bar)
 * @property {Record<string, any>} data  type-specific fields
 *
 * @typedef {object} Profile
 * @property {string} name
 * @property {string} bio
 * @property {string} location
 * @property {string} avatar  URL ("/uploads/…" or https)
 * @property {string} [avatarStyle]  DiceBear style id used when there is no photo (lib/avatars.js)
 * @property {string} [avatarSeed]   DiceBear seed; empty = the name
 *
 * @typedef {object} Settings
 * @property {'auto' | 'light' | 'dark'} theme
 * @property {string} accent       hex colour
 * @property {string} pageTitle    <title>, defaults to profile name
 * @property {string} description  meta description, defaults to bio
 * @property {boolean} noindex     hide from search engines
 * @property {boolean} blockAI     opt out of AI crawlers
 * @property {boolean} [showPoweredBy]  "Powered by Trellis" footer (default on)
 * @property {object} appearance   colours, background, cards, font, animation (lib/appearance.js)
 * @property {Preset[]} [customPresets]  designs saved with "My presets" in the Design panel
 *
 * @typedef {object} Preset
 * @property {string} key          unique id ("paper", "my-forest-k3x9", "site-studio")
 * @property {string} name
 * @property {'auto' | 'light' | 'dark'} theme
 * @property {string} accent
 * @property {object} appearance   full or partial appearance; missing fields use defaults
 *
 * @typedef {object} Page
 * @property {number} version
 * @property {string} [updatedAt]
 * @property {Profile} profile
 * @property {Settings} settings
 * @property {Tile[]} tiles
 */
export {};
