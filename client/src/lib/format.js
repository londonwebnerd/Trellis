/** Small formatting helpers shared by tiles. */

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' });
const UNITS = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];

/** "3 days ago" style relative time for an ISO date string. */
export function timeAgo(iso) {
  if (!iso) return '';
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, 'minute');
}

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

/** 12345 -> "12.3K" */
export const compactNumber = (n) => (typeof n === 'number' ? compact.format(n) : '');

/** Short random id for new tiles, e.g. "t_k3j9x0aa". */
export const newTileId = () => `t_${Math.random().toString(36).slice(2, 10)}`;
