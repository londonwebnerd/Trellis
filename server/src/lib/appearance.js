/**
 * Server-side half of the appearance settings: turns the saved colours,
 * font and radius into CSS custom properties that are applied *before* the
 * first paint (see renderShell in html.js), so visitors never see a flash of
 * the default theme.
 *
 * Keep FONT_STACKS in sync with client/src/lib/appearance.js.
 * All colours were validated as #rrggbb in validate.js.
 */

export const FONT_STACKS = {
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, 'Helvetica Neue', Arial, sans-serif",
  serif: "'Iowan Old Style', 'Charter', 'Palatino Linotype', Georgia, ui-serif, serif",
  mono: "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace",
  rounded: "ui-rounded, 'SF Pro Rounded', 'Nunito', 'Varela Round', system-ui, sans-serif",
  // Self-hosted web fonts (@fontsource-variable/*, imported in client/src/main.jsx).
  inter: "'Inter Variable', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  grotesk: "'Space Grotesk Variable', 'Space Grotesk', -apple-system, 'Segoe UI', Roboto, sans-serif",
  outfit: "'Outfit Variable', Outfit, -apple-system, 'Segoe UI', Roboto, sans-serif",
  playfair: "'Playfair Display Variable', 'Playfair Display', Georgia, ui-serif, serif",
};

/** Black or white text, whichever reads better on the accent colour. */
export function onAccent(hex = '') {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (!Number.isFinite(n)) return '#fff';
  // WCAG relative luminance: pick whichever of white / near-black has the
  // higher contrast ratio against the accent.
  const lin = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  const DARK = 0.0056; // #111
  return 1.05 / (L + 0.05) >= (L + 0.05) / (DARK + 0.05) ? '#fff' : '#111';
}

/**
 * The accent, darkened (light cards) or lightened (dark cards) just enough
 * to read as link text on a card (WCAG 4.5:1, with headroom). A yellow or white accent would
 * otherwise vanish on white. Keep in sync with client/src/lib/appearance.js.
 * @param {string} accent #rrggbb
 * @param {string} card #rrggbb card colour the link sits on
 * @returns {string} #rrggbb
 */
export function readableLink(accent, card) {
  const hex = (h) => (/^#[0-9a-f]{6}$/i.test(h || '') ? h : null);
  const a = hex(accent);
  const c = hex(card);
  if (!a || !c) return accent;
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lin = (v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (x, y) => (Math.max(lum(x), lum(y)) + 0.05) / (Math.min(lum(x), lum(y)) + 0.05);
  const bg = rgb(c);
  const target = lum(bg) > 0.18 ? [0, 0, 0] : [255, 255, 255];
  const base = rgb(a);
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const m = base.map((v, i) => Math.round(v + (target[i] - v) * t));
    // 5.5 rather than 4.5: Flat and Glass cards are a little darker or
    // lighter than the card colour itself, so leave headroom.
    if (ratio(m, bg) >= 5.5) return `#${m.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  return target[0] ? '#ffffff' : '#000000';
}

/**
 * CSS custom properties for a page's settings.
 * @param {import('./validate.js').Settings} settings
 * @returns {Record<string, string>}
 */
export function cssVars(settings) {
  const a = settings.appearance;
  const vars = {
    '--accent': settings.accent,
    '--on-accent': onAccent(settings.accent),
    '--radius': `${a.radius}px`,
    '--font': FONT_STACKS[a.font],
    // 0 = frosted, 1 = crystal clear (Glass and Crystal cards only).
    '--clarity': String(a.glassClarity / 100),
  };
  if (a.colors.bg) vars['--bg'] = a.colors.bg;
  if (a.colors.card) vars['--card'] = a.colors.card;
  if (a.colors.text) vars['--text'] = a.colors.text;
  if (a.colors.muted) vars['--muted'] = a.colors.muted;
  // Link colour in text cards, per theme (base.css picks one). Card colours
  // are the theme defaults from client/src/lib/appearance.js (THEME_DEFAULTS).
  vars['--link-light'] = readableLink(settings.accent, a.colors.card || '#ffffff');
  vars['--link-dark'] = readableLink(settings.accent, a.colors.card || '#18181b');
  return vars;
}

/**
 * "busy" when text sits on an animated effect or a photo (base.css then
 * gives text a halo in the background colour so it stays readable), else
 * "plain". Keep in sync with client/src/lib/appearance.js.
 */
export function backdropOf(appearance = {}) {
  const bg = appearance.background || {};
  return (bg.effect && bg.effect !== 'none') || bg.type === 'image' ? 'busy' : 'plain';
}

/**
 * The theme a gradient background forces: "light" for a clearly light
 * gradient, "dark" for a clearly dark one, otherwise null (follow the Mode
 * setting). A dark-mode page on a pale gradient would put white text on a
 * near-white background, so the background wins. Keep in sync with
 * client/src/lib/appearance.js.
 * @param {object} appearance
 * @returns {'light' | 'dark' | null}
 */
export function gradientTone(appearance = {}) {
  const bg = appearance.background || {};
  if (bg.type !== 'gradient') return null;
  const lum = (hex) => {
    if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return null;
    const n = parseInt(hex.slice(1), 16);
    const lin = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  const a = lum(bg.color1);
  const b = lum(bg.color2);
  if (a === null || b === null) return null;
  if (a >= 0.35 && b >= 0.35) return 'light';
  if (a <= 0.07 && b <= 0.07) return 'dark';
  return null;
}
