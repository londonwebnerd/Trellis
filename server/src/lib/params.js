/**
 * Query parameters allowed on the public page.
 *
 * The page itself takes no parameters, so `/?anything=else` is answered with
 * the 404 page. Links shared on social networks, newsletters and ads get
 * tracking parameters appended automatically, though (Instagram adds
 * `igsh`, Facebook `fbclid`, newsletters `utm_*`…), and those must keep
 * working, so they're allowed. Add to the list if a service you use appends
 * another one.
 */
const ALLOWED = new Set([
  // Analytics campaign tags
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'utm_name',
  // Social networks and ads
  'fbclid', 'igsh', 'igshid', 'gclid', 'gbraid', 'wbraid', 'dclid', 'msclkid', 'twclid', 'ttclid',
  'li_fat_id', 'yclid', 'epik', 'rdt_cid', 'si', 's', 't', 'ref', 'ref_src', 'ref_url', 'source',
  // Newsletters
  'mc_cid', 'mc_eid', '_hsenc', '_hsmi', 'mkt_tok',
  // Analytics cookies passed in links
  '_ga', '_gl',
]);

/** True if the query contains a parameter that isn't on the allow list. */
export const hasUnknownParams = (query = {}) => Object.keys(query).some((key) => !ALLOWED.has(key.toLowerCase()) && !key.toLowerCase().startsWith('utm_'));
