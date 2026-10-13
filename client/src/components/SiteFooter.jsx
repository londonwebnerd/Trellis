/** Where "Powered by Trellis" links to. Change it here if the project moves. */
export const TRELLIS_URL = "https://github.com/londonwebnerd/Trellis";

/**
 * Small "Powered by Trellis" credit at the bottom of the page. Shown unless
 * it's switched off in Settings → Footer (settings.showPoweredBy).
 *
 * @param {{ settings: import('../lib/types.js').Settings }} props
 */
export default function SiteFooter({ settings }) {
  if (settings.showPoweredBy === false) return null;
  return (
    <footer className="site-footer">
      <a href={TRELLIS_URL} target="_blank" rel="noopener noreferrer">
        <img src="/favicon.svg" alt="" width="16" height="16" />
        <span>
          Powered by <b>Trellis</b>
        </span>
      </a>
    </footer>
  );
}
