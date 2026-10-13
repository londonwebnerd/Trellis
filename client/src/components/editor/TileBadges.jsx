import { Icon } from '../Icons.jsx';

const short = (iso) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });

/**
 * Little labels on a card in the editor: hidden, scheduled, locked. So it's
 * obvious which cards visitors won't see (or will only see later).
 */
export default function TileBadges({ tile }) {
  const v = tile.visibility || {};
  const now = Date.now();
  const badges = [];
  if (v.hidden) badges.push(['eyeoff', 'Hidden']);
  else if (v.showFrom && Date.parse(v.showFrom) > now) badges.push(['clock', `From ${short(v.showFrom)}`]);
  else if (v.showUntil && Date.parse(v.showUntil) <= now) badges.push(['clock', 'Ended']);
  else if (v.showUntil) badges.push(['clock', `Until ${short(v.showUntil)}`]);
  if (tile.lock?.type === 'code') badges.push(['lock', 'Code']);
  if (tile.lock?.type === 'age') badges.push(['lock', `${tile.lock.age}+`]);
  if (tile.lock?.type === 'sensitive') badges.push(['alert', 'Sensitive']);
  if (!badges.length) return null;
  return (
    <span className="tile-badges" aria-hidden="true">
      {badges.map(([icon, label]) => (
        <span key={label} className="tile-badge">
          <Icon name={icon} size={12} /> {label}
        </span>
      ))}
    </span>
  );
}
