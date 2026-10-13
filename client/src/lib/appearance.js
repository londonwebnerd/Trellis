/**
 * Appearance: colours, background, card style, font and animation.
 *
 * Stored in `page.settings.appearance` (validated by sanitizeAppearance in
 * server/src/lib/validate.js) and applied as CSS custom properties and
 * data attributes on <html> (see hooks/useTheme.js). The server applies the
 * same variables before first paint (server/src/lib/appearance.js), so keep
 * FONT_STACKS in sync with it.
 *
 * Colours left empty ('') follow the light/dark theme defaults in base.css.
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

/** Theme palette defaults from base.css (shown in colour pickers when unset). */
export const THEME_DEFAULTS = {
  light: { bg: '#fafafa', card: '#ffffff', text: '#111113', muted: '#6c6c71' },
  dark: { bg: '#0b0b0c', card: '#18181b', text: '#f5f5f7', muted: '#9a9aa0' },
};

export const DEFAULT_APPEARANCE = {
  preset: 'default',
  colors: { bg: '', card: '', text: '', muted: '' },
  background: { type: 'none', color1: '#a1c4fd', color2: '#c2e9fb', angle: 135, image: '', dim: 0, blur: 0, pattern: 'none', effect: 'none', speed: 'normal' },
  cardStyle: 'solid',
  glassClarity: 50,
  radius: 24,
  font: 'system',
  animation: 'subtle',
  buttonShape: 'card',
  buttonFill: 'card',
  avatarEffect: 'auto',
  iconStyle: 'brand',
  avatarTone: 'color',
};

/**
 * Colours for the platform logos on the page (tiles.css, "Icon colours").
 * Keep in sync with server/src/lib/validate.js.
 */
export const ICON_STYLES = [
  { value: 'brand', label: 'Brand', help: 'Each network’s own colours.' },
  { value: 'tinted', label: 'Tinted', help: 'The network’s colour on a soft tint of it: lighter and calmer.' },
  { value: 'accent', label: 'Accent', help: 'All in your accent colour.' },
  { value: 'mono', label: 'Mono', help: 'Solid, in your text colour: black on light pages, white on dark ones.' },
  { value: 'soft', label: 'Soft', help: 'Text-coloured logos on a light grey square, Notion-style.' },
  { value: 'outline', label: 'Outline', help: 'Text-coloured logos in a thin outline.' },
];

/**
 * Profile photo animations (base.css, "Avatar animations"). Keep in sync
 * with server/src/lib/validate.js.
 */
export const AVATAR_EFFECTS = [
  { value: 'auto', label: 'Auto', help: 'Generated avatars sway gently; photos stay still.' },
  { value: 'none', label: 'None', help: 'No movement.' },
  { value: 'float', label: 'Float', help: 'Bobs up and down slowly.' },
  { value: 'breathe', label: 'Breathe', help: 'Grows and shrinks a touch, like breathing.' },
  { value: 'glow', label: 'Glow', help: 'A soft glow in your accent colour that brightens and fades.' },
  { value: 'pulse', label: 'Pulse', help: 'Rings ripple outwards, like a “live” badge.' },
  { value: 'ring', label: 'Ring', help: 'A ring in your accent colour circles the photo.' },
  { value: 'wobble', label: 'Wobble', help: 'Tilts its head now and then, and bounces when touched.' },
  { value: 'spin', label: 'Spin', help: 'Does a full turn when hovered or tapped.' },
  { value: 'glitch', label: 'Glitch', help: 'Every few seconds, a short digital glitch. Great with Terminal and Neon Grid.' },
];

/** Fill in any missing appearance fields (older pages, partial imports). */
export function withAppearanceDefaults(appearance = {}) {
  return {
    ...DEFAULT_APPEARANCE,
    ...appearance,
    colors: { ...DEFAULT_APPEARANCE.colors, ...appearance.colors },
    background: { ...DEFAULT_APPEARANCE.background, ...appearance.background },
  };
}

/**
 * Minimalist presets. Applying one copies its values into the page settings,
 * so everything stays editable afterwards. `theme` and `accent` are page
 * settings; the rest is appearance.
 */
export const PRESETS = [
  {
    key: 'default',
    name: 'Default',
    theme: 'auto',
    accent: '#0a84ff',
    appearance: {},
  },
  {
    key: 'paper',
    name: 'Paper',
    theme: 'light',
    accent: '#c2410c',
    appearance: {
      colors: { bg: '#f5f1ea', card: '#fffdf8', text: '#2b2621', muted: '#736a62' },
      cardStyle: 'outline',
      radius: 14,
      font: 'serif',
      animation: 'subtle',
    },
  },
  {
    key: 'mono',
    name: 'Mono',
    // Notion-style minimalism: white page, near-black text, hairline cards,
    // black pill buttons, monochrome icons and a black-and-white drawn avatar.
    theme: 'light',
    accent: '#111111',
    appearance: {
      colors: { bg: '#ffffff', card: '#ffffff', text: '#191919', muted: '#6f6e69' },
      cardStyle: 'hairline',
      radius: 10,
      font: 'inter',
      animation: 'subtle',
      buttonShape: 'pill',
      buttonFill: 'solid',
      iconStyle: 'mono',
      avatarEffect: 'none',
      avatarTone: 'mono',
    },
    // Applied only when there's no uploaded photo: the drawn "Sketch" style.
    profile: { avatarStyle: 'notionists' },
  },
  {
    // Inspired by tidy note-taking workspaces: warm off-black text,
    // hairline cards, small radius and a clean sans.
    key: 'notebook',
    name: 'Notebook',
    theme: 'light',
    accent: '#2383e2',
    appearance: {
      colors: { bg: '#ffffff', card: '#ffffff', text: '#37352f', muted: '#706f6c' },
      cardStyle: 'hairline',
      radius: 8,
      font: 'inter',
      animation: 'subtle',
    },
  },
  {
    key: 'notebook-dark',
    name: 'Notebook Dark',
    theme: 'dark',
    accent: '#529cca',
    appearance: {
      colors: { bg: '#191919', card: '#202020', text: '#e6e5e3', muted: '#9b9a97' },
      cardStyle: 'hairline',
      radius: 8,
      font: 'inter',
      animation: 'subtle',
    },
  },
  {
    key: 'sage',
    name: 'Sage',
    theme: 'light',
    accent: '#3f7d5c',
    appearance: {
      colors: { bg: '#edf1ea', card: '#f8faf6', text: '#1f2a23', muted: '#606f65' },
      background: { effect: 'waves', speed: 'slow' },
      cardStyle: 'flat',
      radius: 28,
      font: 'rounded',
      animation: 'subtle',
    },
  },
  {
    key: 'midnight',
    name: 'Midnight',
    theme: 'dark',
    accent: '#8b9cff',
    appearance: {
      colors: { bg: '#07070c', card: '#14141f', text: '#ececf3', muted: '#8d8da0' },
      background: { type: 'gradient', color1: '#07070c', color2: '#1b1840', angle: 160, effect: 'stars' },
      cardStyle: 'glass',
      radius: 22,
      font: 'system',
      animation: 'lively',
      avatarEffect: 'glow',
    },
  },
  {
    key: 'dusk',
    name: 'Dusk',
    theme: 'light',
    accent: '#6b4bd8',
    appearance: {
      colors: { bg: '#f3e7f3', card: '#ffffff', text: '#1d1b2b', muted: '#69657d' },
      background: { type: 'gradient', color1: '#fbc2eb', color2: '#a6c1ee', angle: 135, effect: 'aurora' },
      cardStyle: 'glass',
      radius: 26,
      font: 'system',
      animation: 'lively',
    },
  },
  {
    key: 'glacier',
    name: 'Glacier',
    theme: 'light',
    accent: '#2f7cf6',
    appearance: {
      colors: { bg: '#e9f1f8', card: '#ffffff', text: '#0f1b2d', muted: '#5b6b80' },
      background: { type: 'gradient', color1: '#dbeafe', color2: '#f5e8ff', angle: 145, effect: 'aurora', speed: 'slow' },
      cardStyle: 'crystal',
      radius: 30,
      font: 'system',
      animation: 'lively',
    },
  },
  {
    key: 'obsidian',
    name: 'Obsidian',
    theme: 'dark',
    accent: '#5eead4',
    appearance: {
      colors: { bg: '#05070a', card: '#1a1f27', text: '#eef2f6', muted: '#8c98a8' },
      background: { type: 'gradient', color1: '#0b1320', color2: '#1d1030', angle: 200, effect: 'flow', speed: 'slow' },
      cardStyle: 'crystal',
      radius: 30,
      font: 'system',
      animation: 'lively',
    },
  },
  {
    key: 'sunset',
    name: 'Sunset',
    theme: 'light',
    accent: '#e8590c',
    appearance: {
      colors: { bg: '#fff1e6', card: '#fffaf5', text: '#2d1a10', muted: '#866554' },
      background: { type: 'gradient', color1: '#ffd6a5', color2: '#ffadad', angle: 160, effect: 'waves', speed: 'slow' },
      cardStyle: 'glass',
      radius: 24,
      font: 'rounded',
      animation: 'subtle',
    },
  },
  {
    key: 'terminal',
    name: 'Terminal',
    theme: 'dark',
    accent: '#22c55e',
    appearance: {
      colors: { bg: '#0a0f0a', card: '#0d140d', text: '#c8f7c5', muted: '#8dbb8a' },
      background: { pattern: 'grid', effect: 'stars', speed: 'slow' },
      cardStyle: 'outline',
      radius: 2,
      font: 'mono',
      animation: 'subtle',
      iconStyle: 'accent',
      avatarEffect: 'glitch',
    },
  },
  {
    key: 'blossom',
    name: 'Blossom',
    theme: 'light',
    accent: '#db2777',
    appearance: {
      colors: { bg: '#fdf2f8', card: '#ffffff', text: '#3b0d24', muted: '#8f5e77' },
      background: { effect: 'orbs', speed: 'slow' },
      cardStyle: 'flat',
      radius: 32,
      font: 'rounded',
      animation: 'lively',
    },
  },
  {
    key: 'neon-grid',
    name: 'Neon Grid',
    theme: 'dark',
    accent: '#ff2ec4',
    appearance: {
      colors: { bg: '#0d0221', card: '#1a0b35', text: '#f7ecff', muted: '#c1a9e0' },
      background: { type: 'gradient', color1: '#0d0221', color2: '#2a0a4a', angle: 180, effect: 'grid', speed: 'slow' },
      cardStyle: 'glass',
      glassClarity: 35,
      radius: 14,
      font: 'grotesk',
      animation: 'lively',
      avatarEffect: 'ring',
      buttonShape: 'pill',
    },
  },
  {
    key: 'espresso',
    name: 'Espresso',
    theme: 'dark',
    accent: '#d9a066',
    appearance: {
      colors: { bg: '#18120e', card: '#241a14', text: '#f4ebe1', muted: '#b9a28d' },
      background: { pattern: 'dots' },
      cardStyle: 'solid',
      radius: 18,
      font: 'playfair',
      animation: 'subtle',
    },
  },
  {
    key: 'linen',
    name: 'Linen',
    theme: 'light',
    accent: '#b4532a',
    appearance: {
      colors: { bg: '#f5efe4', card: '#fffdf8', text: '#2a241e', muted: '#756a5d' },
      cardStyle: 'hairline',
      radius: 6,
      font: 'serif',
      animation: 'subtle',
      iconStyle: 'soft',
      buttonShape: 'square',
    },
  },
  {
    key: 'ocean',
    name: 'Ocean',
    theme: 'light',
    accent: '#0e7490',
    appearance: {
      colors: { bg: '#e6f4f7', card: '#ffffff', text: '#082733', muted: '#4b6a76' },
      background: { type: 'gradient', color1: '#d7f2f7', color2: '#e1ecfb', angle: 170, effect: 'waves', speed: 'slow' },
      cardStyle: 'glass',
      radius: 22,
      font: 'inter',
      animation: 'subtle',
    },
  },
  {
    key: 'forest',
    name: 'Forest',
    theme: 'dark',
    accent: '#a3e635',
    appearance: {
      colors: { bg: '#0a130e', card: '#132119', text: '#e5f2e9', muted: '#9bb3a2' },
      background: { type: 'gradient', color1: '#0a130e', color2: '#16281c', angle: 180, effect: 'fireflies', speed: 'slow' },
      cardStyle: 'solid',
      radius: 20,
      font: 'outfit',
      animation: 'subtle',
    },
  },
  {
    key: 'winter',
    name: 'Winter',
    theme: 'dark',
    accent: '#7dd3fc',
    appearance: {
      colors: { bg: '#0d1526', card: '#1a2539', text: '#f1f5f9', muted: '#a3b1c6' },
      background: { type: 'gradient', color1: '#0d1526', color2: '#1d3557', angle: 180, effect: 'snow', speed: 'slow' },
      cardStyle: 'glass',
      glassClarity: 45,
      radius: 20,
      font: 'rounded',
      animation: 'subtle',
    },
  },
  {
    key: 'mint',
    name: 'Mint',
    theme: 'light',
    accent: '#059669',
    appearance: {
      colors: { bg: '#ecfaf4', card: '#ffffff', text: '#0c2b21', muted: '#4a6b5f' },
      background: { type: 'gradient', color1: '#d1fae5', color2: '#e0f2fe', angle: 135, effect: 'aurora', speed: 'slow' },
      cardStyle: 'crystal',
      radius: 26,
      font: 'inter',
      animation: 'lively',
    },
  },
  {
    key: 'pop',
    name: 'Pop',
    theme: 'light',
    accent: '#7c3aed',
    appearance: {
      colors: { bg: '#fff6d5', card: '#ffffff', text: '#1f1147', muted: '#665a88' },
      background: { effect: 'ripples', speed: 'slow' },
      cardStyle: 'flat',
      radius: 28,
      font: 'outfit',
      animation: 'lively',
      avatarEffect: 'wobble',
      buttonShape: 'pill',
      buttonFill: 'solid',
    },
  },
  {
    key: 'brutalist',
    name: 'Brutalist',
    theme: 'light',
    accent: '#ff3b00',
    appearance: {
      colors: { bg: '#efefef', card: '#ffffff', text: '#000000', muted: '#3b3b3b' },
      cardStyle: 'outline',
      radius: 0,
      font: 'grotesk',
      animation: 'none',
      iconStyle: 'mono',
      buttonShape: 'square',
    },
  },
  {
    key: 'noir',
    name: 'Noir',
    theme: 'dark',
    accent: '#ef4444',
    appearance: {
      colors: { bg: '#050505', card: '#111111', text: '#fafafa', muted: '#a3a3a3' },
      background: { type: 'gradient', color1: '#050505', color2: '#161616', angle: 180 },
      cardStyle: 'hairline',
      radius: 4,
      font: 'playfair',
      animation: 'subtle',
      iconStyle: 'outline',
    },
  },
  {
    key: 'citrus',
    name: 'Citrus',
    theme: 'light',
    accent: '#d97706',
    appearance: {
      colors: { bg: '#fffbeb', card: '#ffffff', text: '#1c1917', muted: '#6f6760' },
      background: { pattern: 'dots' },
      cardStyle: 'solid',
      radius: 32,
      font: 'rounded',
      animation: 'lively',
      buttonShape: 'pill',
      buttonFill: 'solid',
    },
  },
];

/**
 * Settings patch that applies a preset (theme, accent and a full appearance).
 * @param {typeof PRESETS[number]} preset
 */
export function presetPatch(preset) {
  const base = withAppearanceDefaults();
  return {
    theme: preset.theme,
    accent: preset.accent,
    appearance: {
      ...withAppearanceDefaults({
        ...preset.appearance,
        colors: { ...base.colors, ...preset.appearance.colors },
        background: { ...base.background, ...preset.appearance.background },
      }),
      preset: preset.key,
    },
  };
}

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
 * otherwise vanish on white. Keep in sync with server/src/lib/appearance.js.
 * @param {string} accent #rrggbb
 * @param {string} card #rrggbb card colour the link sits on
 * @param {number} [min] contrast ratio to reach
 * @returns {string} #rrggbb
 */
export function readableLink(accent, card, min = 5.5) {
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
    if (ratio(m, bg) >= min) return `#${m.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  return target[0] ? '#ffffff' : '#000000';
}

/**
 * The muted (secondary text) colour, nudged towards the text colour's end
 * of the scale until it reads on both the cards and the page background.
 * 5.2 rather than 4.5 because Glass cards over a gradient come out a little
 * lighter or darker than the card colour. Keep in sync with
 * server/src/lib/appearance.js.
 * @param {{ muted?: string, card?: string, bg?: string }} colors
 */
export function readableMuted({ muted, card, bg } = {}) {
  if (!muted) return muted;
  let m = card ? readableLink(muted, card, 5.2) : muted;
  if (bg) m = readableLink(m, bg, 4.8);
  return m;
}

/**
 * CSS custom properties for the settings (applied on <html>).
 * @param {import('./types.js').Settings} settings
 */
export function cssVars(settings) {
  const a = withAppearanceDefaults(settings.appearance);
  return {
    '--accent': settings.accent,
    '--on-accent': onAccent(settings.accent),
    '--radius': `${a.radius}px`,
    '--font': FONT_STACKS[a.font] || FONT_STACKS.system,
    '--clarity': String((a.glassClarity ?? 50) / 100),
    '--bg': a.colors.bg || null,
    '--card': a.colors.card || null,
    '--text': a.colors.text || null,
    '--muted': readableMuted(a.colors) || null,
    // Link colour in text cards, per theme (base.css picks one).
    '--link-light': readableLink(settings.accent, a.colors.card || THEME_DEFAULTS.light.card),
    '--link-dark': readableLink(settings.accent, a.colors.card || THEME_DEFAULTS.dark.card),
  };
}

/**
 * The theme a gradient background forces: "light" for a clearly light
 * gradient, "dark" for a clearly dark one, otherwise null (follow the Mode
 * setting). A dark-mode page on a pale gradient would put white text on a
 * near-white background, so the background wins. Keep in sync with
 * server/src/lib/appearance.js.
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

/**
 * "busy" when text sits on an animated effect or a photo (base.css then
 * gives text a halo in the background colour so it stays readable), else
 * "plain". Keep in sync with server/src/lib/appearance.js.
 */
export function backdropOf(appearance = {}) {
  const bg = appearance.background || {};
  return (bg.effect && bg.effect !== 'none') || bg.type === 'image' ? 'busy' : 'plain';
}

/**
 * Background and text colours for a brand-coloured pill ("Follow"), readable
 * at small sizes (WCAG 4.5:1): white text when it's legible; otherwise the
 * brand colour a shade darker so white works; otherwise near-black text.
 * @param {string} hex brand colour
 * @returns {{ bg: string, fg: string }}
 */
export function pillColors(hex = '') {
  const rgb = (h) => {
    const n = parseInt(String(h).replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return { bg: hex, fg: '#fff' };
  const lin = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const onWhite = (c) => 1.05 / (lum(c) + 0.05);
  const base = rgb(hex);
  for (let t = 0; t <= 0.3; t += 0.05) {
    const c = base.map((v) => v * (1 - t));
    if (onWhite(c) >= 4.5) return { bg: t === 0 ? hex : `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`, fg: '#fff' };
  }
  return { bg: hex, fg: '#111' };
}
