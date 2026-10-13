import { linkHref } from '../lib/richText.js';
import { detectPlatform, PLATFORMS, prettyHost } from '../lib/platforms.js';
import { BrandBadge } from './Icons.jsx';

/**
 * Row of small social icons (Linktree-style), under the bio or above the
 * footer (Settings → profile → social icons). Each URL gets its network's
 * icon automatically; email addresses work too.
 *
 * @param {{ socials: { url: string }[], position?: 'top' | 'bottom' }} props
 */
export default function SocialIcons({ socials = [], position = 'top' }) {
  if (!socials.length) return null;
  return (
    <ul className={`social-icons social-icons--${position}`} aria-label="Social links">
      {socials.map(({ url }, i) => {
        const platform = /^mailto:/i.test(url) ? 'email' : detectPlatform(url);
        const name = platform === 'website' ? prettyHost(url) : PLATFORMS[platform].name;
        const external = /^https?:/i.test(url);
        return (
          <li key={`${url}-${i}`}>
            <a href={linkHref(url)} target={external ? '_blank' : undefined} rel="noopener noreferrer me" aria-label={name} title={name}>
              <BrandBadge platform={platform} size={36} className="social-icons__badge" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
