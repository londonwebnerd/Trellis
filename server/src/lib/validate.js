/**
 * Page document validation.
 *
 * The client is trusted only as far as the session cookie goes, so every save
 * is re-validated here: unknown tile types and fields are dropped, strings are
 * length-limited, and URLs are restricted to safe schemes. The output of
 * `sanitizePage()` is what gets stored and rendered.
 *
 * When you add a new tile type in the client (client/src/lib/tileRegistry.js),
 * add its fields to TILE_SCHEMAS below as well.
 *
 * @typedef {{ id: string, type: string, w: number, h: number, data: Record<string, unknown> }} Tile
 * @typedef {{ name: string, bio: string, location: string, avatar: string, avatarStyle: string, avatarSeed: string }} Profile
 * @typedef {{ theme: 'auto'|'light'|'dark', accent: string, pageTitle: string, description: string, noindex: boolean, blockAI: boolean, appearance: object }} Settings
 * @typedef {{ version: number, updatedAt?: string, profile: Profile, settings: Settings, tiles: Tile[] }} Page
 */

import { AVATAR_STYLES, DEFAULT_AVATAR_STYLE } from './avatar.js';

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

/** Grid limits: width in columns, height in half-cell rows (2 = a square). */
export const MAX_W = 4;
export const MAX_H = 8;

/** Pre-v2 pages stored a named size; map it to width/height. */
const LEGACY_SIZES = { sm: [1, 2], wide: [2, 2], tall: [1, 4], lg: [2, 4], full: [4, 1] };

const MAX_TILES = 200;

/* ------------------------------------------------------------------ */
/* Field coercers: each takes an unknown value and returns a safe one. */
/* ------------------------------------------------------------------ */

const str = (max) => (v) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const bool = (v) => v === true;
const oneOf = (values, fallback) => (v) => (values.includes(v) ? v : fallback);

/** Social handles: strip a leading "@" and anything that isn't handle-ish. */
const handle = (v) =>
  str(120)(v)
    .replace(/^@/, '')
    .replace(/[^\w.@:-]/g, '');

/**
 * Accept absolute http(s) URLs, or local upload paths ("/uploads/...").
 * Anything else (javascript:, data:, etc.) becomes an empty string.
 */
export function safeUrl(v) {
  const s = str(2048)(v);
  if (!s) return '';
  if (/^\/uploads\/[\w.-]+$/.test(s)) return s;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : '';
  } catch {
    return '';
  }
}

/**
 * URL for an *asset* (image, avatar, background, favicon): only local uploads
 * or https. http:// is upgraded to https:// so the page never loads mixed
 * (insecure) content when served over HTTPS.
 */
export function safeAssetUrl(v) {
  const s = safeUrl(v);
  if (!s || s.startsWith('/uploads/')) return s;
  return s.startsWith('http://') ? `https://${s.slice(7)}` : s;
}

/** Like safeUrl, but also allows mailto: and tel: (for link lists). */
export function safeLinkUrl(v) {
  const s = str(2048)(v);
  if (/^mailto:[^\s<>"]+@[^\s<>"]+$/i.test(s) || /^tel:\+?[\d\s().-]{3,30}$/i.test(s)) return s;
  return safeUrl(s);
}

const intIn = (min, max, fallback) => (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/* ------------------------------------------------------------------ */
/* Rich text                                                           */
/* ------------------------------------------------------------------ */

const RICH_TAGS = new Set(['p', 'br', 'strong', 'em', 'u', 's', 'a', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'code']);
const TAG_ALIASES = { b: 'strong', i: 'em', strike: 's', del: 's', h1: 'h3', h2: 'h3', h5: 'h4', h6: 'h4', div: 'p' };

/**
 * Allowlist sanitiser for rich-text HTML. Keeps only RICH_TAGS, drops every
 * attribute except a safe `href` on links, and removes <script>/<style>
 * blocks entirely. This is defence in depth: the client also renders rich
 * text through its own allowlist (client/src/lib/richText.js) and never
 * injects raw HTML.
 */
export function sanitizeRichHtml(v) {
  let html = str(20000)(v);
  html = html.replace(/<(script|style|iframe|object|template)[\s\S]*?<\/\1\s*>/gi, '');
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi, (match, rawTag, attrs) => {
    const closing = match.startsWith('</');
    const tag = TAG_ALIASES[rawTag.toLowerCase()] || rawTag.toLowerCase();
    if (!RICH_TAGS.has(tag)) return '';
    if (closing) return tag === 'br' ? '' : `</${tag}>`;
    if (tag === 'a') {
      const href = attrs.match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const url = href ? safeLinkUrl((href[2] ?? href[3] ?? href[4] ?? '').replace(/&amp;/g, '&')) : '';
      return url ? `<a href="${url.replace(/"/g, '&quot;')}">` : '<a>';
    }
    return `<${tag}>`;
  });
  // Any "<" left over that doesn't start one of the exact tags emitted above
  // (e.g. an unterminated "<p onclick=…") isn't markup: escape it.
  return html.replace(/<(?!(?:\/?(?:p|br|strong|em|u|s|a|h3|h4|ul|ol|li|blockquote|code)>|a href="[^"<>]*">))/g, '&lt;');
}

/** Link list entries: [{ label, url }] */
const linkList = (max) => (v) =>
  Array.isArray(v)
    ? v
        .slice(0, max)
        .map((l) => ({ label: str(80)(l?.label), url: safeLinkUrl(l?.url) }))
        .filter((l) => l.url)
    : [];

const email = (v) => {
  const s = str(254)(v).replace(/^mailto:/i, '');
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(s) ? s : '';
};

const urlList = (max) => (v) => (Array.isArray(v) ? v.slice(0, max).map(safeUrl).filter(Boolean) : []);

/** An ISO date-time string (anything Date.parse understands), normalised, or ''. */
const isoDate = (v) => {
  const s = str(40)(v);
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
};

/** A number within [min, max], or null. */
const numIn = (min, max) => (v) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/** A local uploaded file ("/uploads/<name>"), or ''. */
const uploadPath = (v) => {
  const s = str(200)(v);
  return /^\/uploads\/[\w.-]+$/.test(s) ? s : '';
};

/** A list of objects, each cleaned by `item`; falsy results are dropped. */
const listOf = (max, item) => (v) => (Array.isArray(v) ? v.slice(0, max).map((x) => (x && typeof x === 'object' ? item(x) : null)).filter(Boolean) : []);

const hexColor = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '#0a84ff');

/** Optional colour: a #rrggbb hex, or '' meaning "use the theme default". */
const optionalHex = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : '');

/**
 * Favicon: the default icon, an emoji, or an uploaded/linked image.
 * Emoji are limited to a few characters and never contain markup.
 */
export function sanitizeFavicon(raw) {
  const f = raw && typeof raw === 'object' ? raw : {};
  const emoji = Array.from(typeof f.emoji === 'string' ? f.emoji.replace(/[<>&"'\s]/g, '') : '')
    .slice(0, 4)
    .join('');
  return {
    type: oneOf(['default', 'emoji', 'image'], 'default')(f.type),
    emoji: emoji || '👋',
    image: safeAssetUrl(f.image),
  };
}

/**
 * Appearance settings (colours, background, cards, font, animation).
 * Mirrors DEFAULT_APPEARANCE in client/src/lib/appearance.js. Every colour is
 * validated as hex so it's safe to inline into CSS on the server.
 */
export function sanitizeAppearance(raw) {
  const a = raw && typeof raw === 'object' ? raw : {};
  const c = a.colors && typeof a.colors === 'object' ? a.colors : {};
  const b = a.background && typeof a.background === 'object' ? a.background : {};
  return {
    preset: str(40)(a.preset) || 'default',
    colors: {
      bg: optionalHex(c.bg),
      card: optionalHex(c.card),
      text: optionalHex(c.text),
      muted: optionalHex(c.muted),
    },
    background: {
      type: oneOf(['none', 'gradient', 'image'], 'none')(b.type),
      color1: optionalHex(b.color1) || '#a1c4fd',
      color2: optionalHex(b.color2) || '#c2e9fb',
      angle: intIn(0, 360, 135)(b.angle ?? 135),
      image: safeAssetUrl(b.image),
      dim: intIn(0, 80, 0)(b.dim ?? 0),
      blur: intIn(0, 30, 0)(b.blur ?? 0),
      pattern: oneOf(['none', 'dots', 'grid'], 'none')(b.pattern),
      /** Animated background effect (components/PageBackground.jsx). */
      effect: oneOf(['none', 'aurora', 'flow', 'orbs', 'waves', 'stars', 'fireflies', 'snow', 'ripples', 'grid'], 'none')(b.effect),
      speed: oneOf(['slow', 'normal', 'fast'], 'normal')(b.speed),
    },
    cardStyle: oneOf(['solid', 'glass', 'crystal', 'outline', 'flat', 'hairline'], 'solid')(a.cardStyle),
    /** Glass/Crystal only: 0 = frosted, 100 = crystal clear. */
    glassClarity: intIn(0, 100, 50)(a.glassClarity ?? 50),
    radius: intIn(0, 36, 24)(a.radius ?? 24),
    font: oneOf(['system', 'serif', 'mono', 'rounded', 'inter', 'grotesk', 'outfit', 'playfair'], 'system')(a.font),
    animation: oneOf(['none', 'subtle', 'lively'], 'subtle')(a.animation),
    /** Link buttons (cards 1 row tall): shape and fill, Linktree-style. */
    buttonShape: oneOf(['card', 'pill', 'square'], 'card')(a.buttonShape),
    buttonFill: oneOf(['card', 'solid', 'outline', 'soft'], 'card')(a.buttonFill),
    /** Profile photo animation ('auto': only generated avatars sway). */
    avatarEffect: oneOf(AVATAR_EFFECTS, 'auto')(a.avatarEffect),
    /** Platform logo colours on the page ('brand': each network's own). */
    iconStyle: oneOf(ICON_STYLES, 'brand')(a.iconStyle),
    /** 'mono': the profile picture in black and white. */
    avatarTone: oneOf(['color', 'mono'], 'color')(a.avatarTone),
  };
}

/** Keep in sync with client/src/lib/appearance.js (AVATAR_EFFECTS). */
/** Keep in sync with client/src/lib/appearance.js (ICON_STYLES). */
export const ICON_STYLES = ['brand', 'tinted', 'accent', 'mono', 'soft', 'outline'];

export const AVATAR_EFFECTS = ['auto', 'none', 'float', 'breathe', 'glow', 'pulse', 'ring', 'wobble', 'spin', 'glitch'];

/**
 * A design preset: a name plus theme, accent and appearance. Used for the
 * presets people save in the editor (settings.customPresets) and for preset
 * files (*.json in the server's presets folder, or imported in the editor).
 * See docs/customising.md for the file format.
 *
 * @param {unknown} raw
 * @param {string} [keyPrefix] prefix for the generated key
 * @returns {{ key: string, name: string, theme: string, accent: string, appearance: object } | null}
 */
export function sanitizePreset(raw, keyPrefix = 'my') {
  if (!raw || typeof raw !== 'object') return null;
  const name = str(40)(raw.name);
  if (!name) return null;
  const rawKey = typeof raw.key === 'string' ? raw.key.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) : '';
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'preset';
  const appearance = sanitizeAppearance(raw.appearance);
  return {
    key: rawKey.startsWith(`${keyPrefix}-`) ? rawKey : `${keyPrefix}-${rawKey || slug}`,
    name,
    theme: oneOf(['auto', 'light', 'dark'], 'auto')(raw.theme),
    accent: hexColor(raw.accent),
    appearance: { ...appearance, preset: undefined },
  };
}

/** Saved presets: at most 24, unique keys. */
function sanitizeCustomPresets(v) {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  return v
    .slice(0, 24)
    .map((p) => sanitizePreset(p, 'my'))
    .filter((p) => p && !seen.has(p.key) && seen.add(p.key));
}

/* ------------------------------------------------------------------ */
/* Tile schemas: type -> { field: coercer }                            */
/* ------------------------------------------------------------------ */

const title = str(80);
const subtitle = str(140);

const buttonLabel = str(40);

export const TILE_SCHEMAS = {
  /** `thumb`: optional custom thumbnail image instead of the brand icon. */
  link: { url: safeUrl, title, subtitle, thumb: safeAssetUrl },
  heading: { text: str(80) },
  text: { html: sanitizeRichHtml, text: str(1000) }, // `text` = legacy plain text
  linklist: { title: str(80), links: linkList(30) },
  image: { src: safeAssetUrl, url: safeUrl, caption: str(140) },
  email: { email, subject: str(150), title, subtitle },
  vimeo: { url: safeUrl, title },
  spotify: { url: safeUrl },
  applemusic: { url: safeUrl },
  github: { username: handle, showRepos: bool, title },
  blog: { url: safeUrl, showLatest: bool, title, subtitle },
  notion: { url: safeUrl, title, subtitle, showEmbed: bool },
  whatsapp: { phone: (v) => str(24)(v).replace(/[^\d]/g, '').slice(0, 15), message: str(300), title, subtitle },
  youtube: { url: safeUrl, title },
  instagram: { username: handle, mode: oneOf(['profile', 'posts', 'feed'], 'profile'), posts: urlList(4), title, showHeader: (v) => v !== false },
  x: { username: handle, postUrl: safeUrl, title },
  bluesky: { handle, showLatest: bool, title },
  mastodon: { handle, showLatest: bool, title },
  facebook: { url: safeUrl, showTimeline: bool, title },
  linkedin: { url: safeUrl, postUrl: safeUrl, title, subtitle },

  /* Embeds (all shown behind a click-to-load placeholder when the page asks for consent). */
  tiktok: { url: safeUrl, title },
  /** Channel name; a pasted twitch.tv link is reduced to the name. */
  twitch: {
    channel: (v) => {
      const s = str(200)(v).trim();
      const m = s.match(/twitch\.tv\/([A-Za-z0-9_]{3,25})/i);
      return (m ? m[1] : s.replace(/^@/, '').replace(/\W/g, '')).slice(0, 25).toLowerCase();
    },
    title,
  },
  soundcloud: { url: safeUrl, title },
  /** Bandcamp needs the numeric id from its "Embed" code: we keep only "album=123" / "track=123". */
  bandcamp: {
    url: safeUrl,
    embedId: (v) => {
      const m = str(4000)(v).match(/\b(album|track)=(\d{1,15})\b/);
      return m ? `${m[1]}=${m[2]}` : '';
    },
    title,
  },
  pinterest: { url: safeUrl, title },
  booking: { url: safeUrl, title, subtitle, showEmbed: (v) => v !== false },
  map: {
    address: str(200),
    lat: numIn(-90, 90),
    lon: numIn(-180, 180),
    zoom: intIn(3, 18, 14),
    title,
    showEmbed: (v) => v !== false,
  },

  /* Content */
  gallery: {
    title,
    mode: oneOf(['carousel', 'grid'], 'carousel'),
    images: listOf(20, (i) => {
      const src = safeAssetUrl(i.src);
      return src ? { src, caption: str(140)(i.caption), url: safeUrl(i.url) } : null;
    }),
  },
  countdown: { title, date: isoDate, endText: str(140), url: safeUrl, buttonLabel },
  file: { src: uploadPath, fileName: str(120), size: intIn(0, 50 * 1024 * 1024, 0), title, subtitle },

  /* Forms and contact */
  contact: { title, subtitle, buttonLabel, success: str(140), askPhone: bool },
  newsletter: { title, subtitle, buttonLabel, success: str(140), placeholder: str(60) },
  vcard: {
    name: str(80),
    org: str(80),
    role: str(80),
    phone: (v) => str(30)(v).replace(/[^\d+\s().-]/g, ''),
    email,
    url: safeUrl,
    address: str(200),
    note: str(200),
    title,
    subtitle,
  },

  /* Payments (links out to the payment provider: Trellis never handles money). */
  tipjar: {
    title,
    subtitle,
    amounts: listOf(6, (a) => {
      const url = safeUrl(a.url);
      return url ? { label: str(20)(a.label), url } : null;
    }),
  },
  product: { title, subtitle: str(240), price: str(24), image: safeAssetUrl, url: safeUrl, buttonLabel, badge: str(20) },
};

/** Card animations ("spotlight") and per-card colours. */
const TILE_ANIMATIONS = ['none', 'pulse', 'wiggle', 'shine', 'bounce', 'glow'];

/**
 * Settings every card can have, next to its type-specific `data`:
 *   visibility  hidden, or shown only between two dates
 *   lock        sensitive-content warning, age gate, or unlock code
 *   style       its own colours and a spotlight animation
 */
function sanitizeTileExtras(raw) {
  const out = {};
  const v = raw.visibility && typeof raw.visibility === 'object' ? raw.visibility : null;
  if (v) {
    const visibility = { hidden: bool(v.hidden), showFrom: isoDate(v.showFrom), showUntil: isoDate(v.showUntil) };
    if (visibility.hidden || visibility.showFrom || visibility.showUntil) out.visibility = visibility;
  }
  const l = raw.lock && typeof raw.lock === 'object' ? raw.lock : null;
  if (l) {
    const type = oneOf(['none', 'sensitive', 'age', 'code'], 'none')(l.type);
    if (type === 'sensitive') out.lock = { type };
    if (type === 'age') out.lock = { type, age: intIn(13, 99, 18)(l.age ?? 18) };
    if (type === 'code') {
      const code = str(64)(l.code);
      if (code) out.lock = { type, code, hint: str(80)(l.hint) };
    }
  }
  const st = raw.style && typeof raw.style === 'object' ? raw.style : null;
  if (st) {
    const style = {
      bg: optionalHex(st.bg),
      text: optionalHex(st.text),
      animation: oneOf(TILE_ANIMATIONS, 'none')(st.animation),
    };
    if (style.bg || style.text || style.animation !== 'none') out.style = style;
  }
  return out;
}

/** Validate a single tile; returns null if it should be dropped. */
function sanitizeTile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  // Object.hasOwn: "__proto__", "constructor"… must not count as tile types.
  const schema = typeof raw.type === 'string' && Object.hasOwn(TILE_SCHEMAS, raw.type) ? TILE_SCHEMAS[raw.type] : null;
  if (!schema) return null;

  const id = typeof raw.id === 'string' && /^[\w-]{1,40}$/.test(raw.id) ? raw.id : null;
  if (!id) return null;

  const data = {};
  const input = raw.data && typeof raw.data === 'object' ? raw.data : {};
  for (const [field, coerce] of Object.entries(schema)) data[field] = coerce(input[field]);

  // Width/height, migrating the old named sizes. Headings span the full row.
  const [legacyW, legacyH] = (typeof raw.size === 'string' && Object.hasOwn(LEGACY_SIZES, raw.size) && LEGACY_SIZES[raw.size]) || [1, 2];
  let w = intIn(1, MAX_W, legacyW)(raw.w ?? legacyW);
  let h = intIn(1, MAX_H, legacyH)(raw.h ?? legacyH);
  if (raw.type === 'heading') {
    w = MAX_W;
    h = Math.min(h, 2);
  }

  return { id, type: raw.type, w, h, data, ...sanitizeTileExtras(raw) };
}

/**
 * Validate and normalise a whole page document.
 * @param {unknown} raw
 * @returns {Page}
 */
export function sanitizePage(raw) {
  if (!raw || typeof raw !== 'object') throw new ValidationError('Page must be an object');
  if (!Array.isArray(raw.tiles)) throw new ValidationError('Page.tiles must be an array');
  if (raw.tiles.length > MAX_TILES) throw new ValidationError(`Too many tiles (max ${MAX_TILES})`);

  const p = raw.profile || {};
  const s = raw.settings || {};

  const seen = new Set();
  const tiles = raw.tiles.map(sanitizeTile).filter((t) => {
    if (!t || seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  return {
    version: 2,
    profile: {
      name: str(80)(p.name),
      bio: str(600)(p.bio),
      location: str(80)(p.location),
      avatar: safeAssetUrl(p.avatar),
      /** Fallback avatar when there is no photo (see lib/avatar.js). */
      avatarStyle: oneOf(AVATAR_STYLES, DEFAULT_AVATAR_STYLE)(p.avatarStyle),
      /** DiceBear seed; empty = use the name. */
      avatarSeed: str(64)(p.avatarSeed),
      /** Row of social icons under the bio (Linktree-style). */
      socials: listOf(16, (x) => {
        const url = safeLinkUrl(x.url);
        return url ? { url } : null;
      })(p.socials),
    },
    settings: {
      theme: oneOf(['auto', 'light', 'dark'], 'auto')(s.theme),
      accent: hexColor(s.accent),
      pageTitle: str(80)(s.pageTitle),
      description: str(200)(s.description),
      /** Ask search engines not to index the page. */
      noindex: s.noindex === true,
      /** Opt out of AI crawlers (robots.txt + headers + 403 for known bots). */
      blockAI: s.blockAI === true,
      /** With noindex on: still let chat apps/social networks fetch link previews. */
      allowPreviews: s.allowPreviews === true,
      /** "Powered by Trellis" footer link; on unless switched off. */
      showPoweredBy: s.showPoweredBy !== false,
      appearance: sanitizeAppearance(s.appearance),
      favicon: sanitizeFavicon(s.favicon),
      /** Presets saved in the editor's Design panel ("My presets"). */
      customPresets: sanitizeCustomPresets(s.customPresets),
      /** Image for link previews (og:image); empty = the profile photo. */
      shareImage: safeAssetUrl(s.shareImage),
      /** Where the social icons row goes. */
      socialsPosition: oneOf(['top', 'bottom'], 'top')(s.socialsPosition),
      /** Share button (copy link, QR code) in the corner of the page. */
      shareButton: s.shareButton !== false,
      /** Cookie-free visitor statistics. */
      analytics: s.analytics !== false,
      /** Add utm_source/utm_medium to outgoing links. */
      utmTags: s.utmTags === true,
      /** Embedded players wait for a click before loading (privacy/GDPR). */
      embedConsent: s.embedConsent !== false,
    },
    tiles,
  };
}
