import { PLATFORMS } from '../../lib/platforms.js';
import { BrandBadge, Icon } from '../Icons.jsx';
import { linkHref } from '../../lib/richText.js';
import { pillColors } from '../../lib/appearance.js';

/**
 * The standard "social link" card used by most tiles: brand badge, title,
 * subtitle and an optional call-to-action pill, plus an optional preview
 * area (`children`) for embeds or live posts, and an optional `footer`
 * row under the text for buttons.
 *
 * In the `bar` shape (a 1-row tile) it renders as a horizontal,
 * Linktree-style button and hides previews and footers.
 *
 * The whole card is clickable via a "stretched link" (the anchor's ::after
 * covers the card), while anything in `children` marked `.tile-interactive`
 * sits above it and stays usable (iframes, buttons).
 * rel="me" lets Mastodon (and others) verify that the profile links back here.
 *
 * @param {{
 *   href: string,
 *   platform: string,
 *   title: string,
 *   subtitle?: string,
 *   action?: string,
 *   shape: 'bar' | 'sm' | 'wide' | 'tall' | 'lg',
 *   children?: import('react').ReactNode,
 *   footer?: import('react').ReactNode,
 *   className?: string,
 *   thumb?: string,      optional picture instead of the brand badge
 *   uiIcon?: string,     UI icon (Icons.jsx) instead of the brand badge
 *   download?: string,   file name: download the link instead of opening it
 * }} props
 */
/** Brand colour for the card, plus readable colours for its "Follow" pill. */
function brandVars(color) {
  if (!color) return undefined;
  const pill = pillColors(color);
  return { '--brand': color, '--pill-bg': pill.bg, '--pill-fg': pill.fg };
}

export default function LinkCard({ href, platform, title, subtitle, action, shape, children, footer, className = '', thumb, uiIcon, download }) {
  const safe = linkHref(href);
  const isExternal = /^https?:/.test(safe);
  const isBar = shape === 'bar';
  const compact = shape === 'sm' || isBar;
  return (
    <div className={`tile-card tile-card--${shape} ${className}`} data-platform={platform} style={brandVars(PLATFORMS[platform]?.color)}>
      <div className="tile-card__head">
        {thumb ? (
          <img className="tile-thumb" src={thumb} alt="" style={{ width: isBar ? 34 : compact ? 40 : 44, height: isBar ? 34 : compact ? 40 : 44 }} loading="lazy" />
        ) : uiIcon ? (
          <span className="ui-badge ui-badge--tile" style={{ width: isBar ? 34 : compact ? 40 : 44, height: isBar ? 34 : compact ? 40 : 44 }} aria-hidden="true">
            <Icon name={uiIcon} size={isBar ? 18 : 20} />
          </span>
        ) : (
          <BrandBadge platform={platform} size={isBar ? 34 : compact ? 40 : 44} />
        )}
        {action && !compact && <span className="tile-pill">{action}</span>}
        {shape === 'sm' && (
          <span className="tile-card__arrow" aria-hidden="true">
            <Icon name="arrow" size={16} />
          </span>
        )}
      </div>
      <div className="tile-card__text" dir="auto">
        <a className="tile-card__link" href={safe} target={isExternal && !download ? '_blank' : undefined} rel="noopener noreferrer me" download={download}>
          {title}
        </a>
        {subtitle && <span className="tile-card__subtitle">{subtitle}</span>}
      </div>
      {isBar && (
        <span className="tile-card__arrow" aria-hidden="true">
          <Icon name="arrow" size={16} />
        </span>
      )}
      {footer && !isBar && <div className="tile-card__footer">{footer}</div>}
      {children && !isBar && <div className="tile-card__preview">{children}</div>}
    </div>
  );
}
