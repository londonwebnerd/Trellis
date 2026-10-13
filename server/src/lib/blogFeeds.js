/**
 * Latest posts for Blog cards (Medium, Substack, WordPress.com, Blogger,
 * Tumblr), read from each platform's public RSS/Atom feed.
 *
 * Only these hosts are accepted, so the server can't be used to fetch
 * arbitrary addresses (no SSRF). The XML parser is deliberately tiny: it
 * reads just titles, links, dates, an excerpt and the first image of each
 * post, and every value is reduced to plain text or an https URL.
 */
import { htmlToText } from './html.js';
import { safeFetch } from './safeFetch.js';

/**
 * Work out a blog's platform and feed URL from its normal address.
 * @param {string} blogUrl e.g. "https://name.substack.com" or "https://medium.com/@name"
 * @returns {{ platform: string, feedUrl: string, home: string }}
 */
export function feedFor(blogUrl) {
  let u;
  try {
    u = new URL(blogUrl);
  } catch {
    throw new Error('Not a valid blog URL');
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const first = u.pathname.split('/').filter(Boolean)[0] || '';
  const sub = (domain) => (host.endsWith(`.${domain}`) ? host.slice(0, -domain.length - 1) : null);
  const name = /^[a-z0-9-]{1,63}$/i;

  if (host === 'medium.com' && first) {
    return { platform: 'medium', feedUrl: `https://medium.com/feed/${encodeURIComponent(first).replace('%40', '@')}`, home: `https://medium.com/${first}` };
  }
  if (sub('medium.com') && name.test(sub('medium.com'))) {
    return { platform: 'medium', feedUrl: `https://${host}/feed`, home: `https://${host}` };
  }
  if (sub('substack.com') && name.test(sub('substack.com'))) {
    return { platform: 'substack', feedUrl: `https://${host}/feed`, home: `https://${host}` };
  }
  if (sub('wordpress.com') && name.test(sub('wordpress.com'))) {
    return { platform: 'wordpress', feedUrl: `https://${host}/feed/`, home: `https://${host}` };
  }
  if (sub('blogspot.com') && name.test(sub('blogspot.com'))) {
    return { platform: 'blogger', feedUrl: `https://${host}/feeds/posts/default?alt=rss`, home: `https://${host}` };
  }
  if (sub('tumblr.com') && name.test(sub('tumblr.com'))) {
    return { platform: 'tumblr', feedUrl: `https://${host}/rss`, home: `https://${host}` };
  }
  if (host === 'tumblr.com' && name.test(first)) {
    return { platform: 'tumblr', feedUrl: `https://${first}.tumblr.com/rss`, home: `https://www.tumblr.com/${first}` };
  }
  throw new Error('Latest posts work for Medium, Substack, WordPress.com, Blogger (blogspot.com) and Tumblr addresses');
}

/* ------------------------------ Tiny XML ------------------------------ */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decode XML/HTML entities (named basics + numeric). */
const decode = (s) =>
  s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/** Text content of the first <tag>…</tag> (CDATA aware), or ''. */
function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  if (!m) return '';
  const cdata = m[1].match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return cdata ? cdata[1] : decode(m[1]);
}

/** Attribute value from the first matching self-closing/open tag. */
function attr(xml, tagPattern, name) {
  const m = xml.match(new RegExp(`<${tagPattern}\\b[^>]*\\b${name}=["']([^"']+)["']`, 'i'));
  return m ? decode(m[1]) : '';
}

const httpsUrl = (url) => (/^https?:\/\//i.test(url || '') ? url.replace(/^http:/i, 'https:') : null);

/** First image of a post: media tags, enclosure, or the first <img> in its HTML. */
function firstImage(item, html) {
  return (
    httpsUrl(attr(item, 'media:content', 'url')) ||
    httpsUrl(attr(item, 'media:thumbnail', 'url')) ||
    (/image\//i.test(attr(item, 'enclosure', 'type')) ? httpsUrl(attr(item, 'enclosure', 'url')) : null) ||
    httpsUrl((html.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1])
  );
}

/**
 * Parse an RSS 2.0 or Atom feed into { title, posts }.
 * @param {string} xml
 */
export function parseFeed(xml) {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = xml.match(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) || [];
  const channel = xml.split(isAtom ? /<entry[\s>]/i : /<item[\s>]/i)[0];
  const posts = blocks.slice(0, 6).map((item) => {
    const html = tag(item, 'content:encoded') || tag(item, 'content') || tag(item, 'description') || tag(item, 'summary');
    const link = isAtom ? attr(item, 'link[^>]*rel=["\']alternate["\'][^>]*', 'href') || attr(item, 'link', 'href') : tag(item, 'link').trim();
    const clean = html.replace(/<(script|style|iframe|noscript)[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<\/(p|div|h\d|li)>/gi, ' ');
    const text = htmlToText(clean).replace(/\s+/g, ' ').trim();
    return {
      text: htmlToText(tag(item, 'title')).trim() || 'Untitled post',
      excerpt: text.length > 220 ? `${text.slice(0, 217).trimEnd()}…` : text,
      url: httpsUrl(link) || null,
      createdAt: tag(item, 'pubDate') || tag(item, 'published') || tag(item, 'updated') || null,
      image: firstImage(item, html),
    };
  });
  return { title: htmlToText(tag(channel, 'title')).trim(), posts: posts.filter((p) => p.url) };
}

/**
 * Fetch and parse a blog's feed (max 3 MB, 8 s timeout).
 * @param {string} blogUrl
 */
export async function fetchBlog(blogUrl) {
  const { platform, feedUrl, home } = feedFor(blogUrl);
  // https only, public addresses only (every redirect re-checked), 3 MB max.
  const res = await safeFetch(feedUrl, {
    headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5', 'User-Agent': 'Trellis/1.0 (+feed reader)' },
    timeoutMs: 8000,
    maxBytes: 3_000_000,
  });
  if (!res.ok) throw new Error(`Feed returned ${res.status}`);
  const xml = res.body;
  const { title, posts } = parseFeed(xml);
  return {
    platform,
    name: title,
    url: home,
    posts: posts.map((p) => ({ ...p, createdAt: p.createdAt && !Number.isNaN(Date.parse(p.createdAt)) ? new Date(p.createdAt).toISOString() : null })),
  };
}
