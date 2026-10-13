/**
 * Visitor statistics on the live page (see server/src/lib/analytics.js).
 *
 * No cookies or storage: one "view" beacon when the page opens, and one
 * "click" beacon when a card link is followed. Browsers that send Do Not
 * Track / Global Privacy Control are skipped here as well as on the server.
 *
 * Optionally (Settings → Statistics → "Tag outgoing links"), outgoing links
 * get utm_source=<this site>&utm_medium=link-in-bio added as they're
 * clicked, so the sites you link to can see the traffic came from you.
 * Existing utm_ parameters are never overwritten.
 */

const optedOut = () => navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;

/** Sent as text/plain: the only body type every browser's sendBeacon accepts. */
function send(payload) {
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon?.('/api/collect', new Blob([body], { type: 'text/plain;charset=UTF-8' }))) return;
  } catch {
    /* fall through */
  }
  fetch('/api/collect', { method: 'POST', body, headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, keepalive: true, credentials: 'same-origin' }).catch(() => {});
}

let viewed = false;

/** Count a page view (once per page load). */
export function trackView() {
  if (viewed || optedOut()) return;
  viewed = true;
  const q = new URLSearchParams(window.location.search);
  send({
    type: 'view',
    referrer: document.referrer || '',
    utm: { source: q.get('utm_source') || q.get('ref') || '', medium: q.get('utm_medium') || '', campaign: q.get('utm_campaign') || '' },
  });
}

/** Count a click on a card. */
export function trackClick(tileId) {
  if (optedOut() || !tileId) return;
  send({ type: 'click', tile: tileId });
}

/**
 * Add UTM tags to an outgoing http(s) link (other sites only). Returns the
 * new address, or null when nothing should change.
 */
export function withUtm(href, { source = window.location.hostname, medium = 'link-in-bio' } = {}) {
  let url;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || url.host === window.location.host) return null;
  if ([...url.searchParams.keys()].some((k) => k.startsWith('utm_'))) return null;
  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_medium', medium);
  return url.href;
}

/**
 * One delegated listener for the whole page: counts clicks on links inside
 * cards and (optionally) tags them. Uses `pointerdown`-free plain click and
 * auxclick (middle click) so "open in new tab" is counted too.
 * Returns a cleanup function.
 *
 * @param {{ analytics: boolean, utmTags: boolean }} options
 */
export function installClickTracking({ analytics, utmTags }) {
  const onClick = (e) => {
    if (e.type === 'auxclick' && e.button !== 1) return;
    const link = e.target.closest?.('a[href]');
    const cell = link?.closest('[data-tile-id]');
    if (!link) return;
    if (utmTags && !link.dataset.utmDone) {
      const tagged = withUtm(link.getAttribute('href'));
      if (tagged) link.setAttribute('href', tagged);
      link.dataset.utmDone = '1';
    }
    if (analytics && cell) trackClick(cell.dataset.tileId);
  };
  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true);
  return () => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('auxclick', onClick, true);
  };
}
