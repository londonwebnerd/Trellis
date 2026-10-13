/**
 * Icons.
 *
 * - <BrandBadge platform="x" /> : rounded brand-coloured square with the logo.
 * - <Icon name="plus" />        : small stroke icons used by the UI/editor.
 *
 * UI icons are inlined SVG paths (24×24 grid, 2px stroke) so there's no
 * icon-font or extra request.
 */
import { PLATFORMS } from '../lib/platforms.js';

/** Pick black or white for legible contrast on a brand colour. */
function contrastColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 186 ? '#000' : '#fff';
}

/**
 * Brand logo on a coloured rounded square.
 * @param {{ platform: string, size?: number, className?: string }} props
 */
export function BrandBadge({ platform, size = 40, className = '' }) {
  const p = PLATFORMS[platform] || PLATFORMS.website;
  return (
    <span
      className={`brand-badge brand-${platform} ${className}`}
      // As variables, so Design → Icons can restyle every badge on the page.
      style={{ width: size, height: size, '--badge-bg': p.color, '--badge-fg': contrastColor(p.color) }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="currentColor" fillRule="evenodd">
        <path d={p.path} />
      </svg>
    </span>
  );
}

/** Stroke paths for UI icons. Keep each to a few simple shapes. */
const UI_ICONS = {
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  'chevron-left': 'M15 18l-6-6 6-6',
  'chevron-right': 'M9 18l6-6-6-6',
  'chevron-up': 'M18 15l-6-6-6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  text: 'M4 6h16M4 12h16M4 18h10',
  heading: 'M6 4v16M18 4v16M6 12h12',
  image: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  arrow: 'M7 17L17 7M8 7h9v9',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  check: 'M5 12l5 5L20 7',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  duplicate: 'M8 8h12v12H8zM16 8V4H4v12h4',
  resize: 'M20 14v6h-6M20 20l-7-7M10 4H4v6',
  phone: 'M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2',
  desktop: 'M3 4h18v12H3zM8 20h8M12 16v4',
  plug: 'M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5',
  minus: 'M5 12h14',
  palette: 'M12 3a9 9 0 0 0 0 18c1.1 0 1.7-.8 1.7-1.6 0-.5-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4-4-7.6-9-7.6zM7.5 12h.01M9.5 7.5h.01M14.5 7.5h.01',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6zM9 12l2 2 4-4',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z',
  // Draft / history / analytics / inbox / sharing.
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z',
  share: 'M12 3v13M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2M18 16v2M7 7h.01M17 7h.01M7 17h.01',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4M12 15v2',
  unlock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 7.5-2',
  alert: 'M12 3l10 18H2zM12 10v4M12 17.5h.01',
  calendar: 'M4 6h16v15H4zM4 10h16M9 3v4M15 3v4',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  gallery: 'M3 6h14v12H3zM7 18l4-4 3 3M21 8v12H7M10 10h.01',
  timer: 'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 10v4l2 2M10 2h4',
  file: 'M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  form: 'M4 4h16v5H4zM4 13h16v7H4zM7 16h6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  heart: 'M12 20s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6.2-8 11-8 11z',
  bag: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2',
  play: 'M7 4l13 8-13 8z',
  eyeoff: 'M3 3l18 18M10.6 6.1A9.7 9.7 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.3 3.9M6.6 6.7C3.9 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  // Rich text toolbar.
  bold: 'M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z',
  italic: 'M14 4h-4M14 20h-4M14 4l-4 16',
  underline: 'M7 4v7a5 5 0 0 0 10 0V4M5 20h14',
  strike: 'M5 12h14M16 7a4 3 0 0 0-4-2c-2.2 0-4 1.3-4 3 0 3 8 2 8 6 0 1.7-1.8 3-4 3a4 3 0 0 1-4-2',
  h: 'M6 4v16M15 4v16M6 12h9M19 13l2-1v8',
  quote: 'M7 7h4v4c0 3-2 5-4 6M15 7h4v4c0 3-2 5-4 6',
  ol: 'M10 6h10M10 12h10M10 18h10M4 4h1v4M4 8h2M4 14h2l-2 3h2',
  eraser: 'M16 3l5 5-11 11H5l-2-2 13-14zM9 21h12',
  // Size picker glyphs: filled cells of a 2×2 grid.
  'size-bar': 'M5 10h14v4H5z',
  'size-sm': 'M5 5h6v6H5z',
  'size-wide': 'M5 5h14v6H5z',
  'size-tall': 'M5 5h6v14H5z',
  'size-lg': 'M5 5h14v14H5z',
};

/**
 * Small UI icon.
 * @param {{ name: keyof typeof UI_ICONS, size?: number, title?: string }} props
 */
export function Icon({ name, size = 18, title }) {
  const isSize = name.startsWith('size-');
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={isSize ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={isSize ? 0 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {isSize && <rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />}
      <path d={UI_ICONS[name]} />
    </svg>
  );
}
