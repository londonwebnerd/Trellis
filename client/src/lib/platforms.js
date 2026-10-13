/**
 * Platform catalogue + URL detection.
 *
 * `PLATFORMS` maps a key to the brand name, colour and icon used for tile
 * badges. `detectPlatform(url)` figures out which one a link belongs to, and
 * `tileFromInput(text)` powers the editor's "paste anything" box by turning a
 * pasted URL/handle/email into the best-fitting tile.
 *
 * To support a new site, add an entry to PLATFORMS with a `match` regex
 * (tested against the URL's hostname) — nothing else needs to change.
 */
import {
  siApplemusic,
  siBandcamp,
  siCaldotcom,
  siCalendly,
  siCashapp,
  siEtsy,
  siGumroad,
  siOpenstreetmap,
  siPaypal,
  siShopify,
  siStripe,
  siVenmo,
  siBehance,
  siBlogger,
  siBluesky,
  siBuymeacoffee,
  siDeviantart,
  siDiscord,
  siDribbble,
  siFacebook,
  siFlickr,
  siGithub,
  siGitlab,
  siInstagram,
  siKofi,
  siMastodon,
  siMedium,
  siNotion,
  siPandora,
  siPatreon,
  siPinterest,
  siReddit,
  siSignal,
  siSoundcloud,
  siSpotify,
  siSubstack,
  siTelegram,
  siThreads,
  siTiktok,
  siTumblr,
  siVimeo,
  siTwitch,
  siWhatsapp,
  siWordpress,
  siX,
  siYoutube,
} from 'simple-icons';

/**
 * LinkedIn isn't in simple-icons (brand request), so it's drawn here: a
 * rounded square with "in" knocked out (rendered with fill-rule="evenodd").
 */
const linkedinIcon = {
  hex: '0A66C2',
  path:
    'M3 0h18a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3z' +
    'M4.7 6.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0z' +
    'M5 9.5h3V19H5z' +
    'M10 9.5h2.9v1.4c.5-.9 1.7-1.7 3.4-1.7 3 0 3.7 2 3.7 4.6V19h-3v-4.6c0-1.2-.2-2.4-1.7-2.4s-2.3 1-2.3 2.5V19H10z',
};

/** Envelope for email tiles (filled, evenodd flap). */
const emailIcon = {
  hex: 'EA4335',
  path: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM4 7.2V18h16V7.2l-8 5.3z',
};

/** Simple globe for generic websites. */
const websiteIcon = {
  hex: '636366',
  path:
    'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z' +
    'M4.1 11h3.4c.1-2.3.6-4.4 1.4-6A8 8 0 0 0 4.1 11z' +
    'M9.5 11h5c-.2-3.2-1.3-5.6-2.5-6.8-1.2 1.2-2.3 3.6-2.5 6.8z' +
    'M16.5 11h3.4a8 8 0 0 0-4.8-6c.8 1.6 1.3 3.7 1.4 6z' +
    'M19.9 13h-3.4c-.1 2.3-.6 4.4-1.4 6a8 8 0 0 0 4.8-6z' +
    'M14.5 13h-5c.2 3.2 1.3 5.6 2.5 6.8 1.2-1.2 2.3-3.6 2.5-6.8z' +
    'M7.5 13H4.1a8 8 0 0 0 4.8 6c-.8-1.6-1.3-3.7-1.4-6z',
};

/** Brand entry from a simple-icons object. */
const brand = (name, icon, match, extra = {}) => ({ name, color: `#${icon.hex}`, path: icon.path, match, ...extra });

/** @type {Record<string, { name: string, color: string, path: string, match?: RegExp }>} */
export const PLATFORMS = {
  x: brand('X', siX, /(^|\.)(x|twitter)\.com$/),
  bluesky: brand('Bluesky', siBluesky, /(^|\.)bsky\.app$/),
  mastodon: brand('Mastodon', siMastodon, /(^|\.)(mastodon\.\w+|mstdn\.\w+|fosstodon\.org|hachyderm\.io|infosec\.exchange)$/),
  instagram: brand('Instagram', siInstagram, /(^|\.)instagram\.com$/),
  facebook: brand('Facebook', siFacebook, /(^|\.)(facebook\.com|fb\.com|fb\.me)$/),
  linkedin: brand('LinkedIn', linkedinIcon, /(^|\.)(linkedin\.com|lnkd\.in)$/),
  spotify: brand('Spotify', siSpotify, /(^|\.)(spotify\.com|spotify\.link)$/),
  applemusic: brand('Apple Music', siApplemusic, /(^|\.)music\.apple\.com$/),
  pandora: brand('Pandora', siPandora, /(^|\.)pandora\.(com|app\.link)$/),
  youtube: brand('YouTube', siYoutube, /(^|\.)(youtube\.com|youtu\.be)$/),
  vimeo: brand('Vimeo', siVimeo, /(^|\.)vimeo\.com$/),
  threads: brand('Threads', siThreads, /(^|\.)threads\.(net|com)$/),
  tiktok: brand('TikTok', siTiktok, /(^|\.)tiktok\.com$/),
  github: brand('GitHub', siGithub, /(^|\.)github\.com$/),
  gitlab: brand('GitLab', siGitlab, /(^|\.)gitlab\.com$/),
  twitch: brand('Twitch', siTwitch, /(^|\.)twitch\.tv$/),
  discord: brand('Discord', siDiscord, /(^|\.)(discord\.gg|discord\.com)$/),
  reddit: brand('Reddit', siReddit, /(^|\.)reddit\.com$/),
  pinterest: brand('Pinterest', siPinterest, /(^|\.)pinterest\.\w+$/),
  telegram: brand('Telegram', siTelegram, /(^|\.)(t\.me|telegram\.me)$/),
  whatsapp: brand('WhatsApp', siWhatsapp, /(^|\.)(wa\.me|whatsapp\.com)$/),
  signal: brand('Signal', siSignal, /(^|\.)signal\.(me|org)$/),
  soundcloud: brand('SoundCloud', siSoundcloud, /(^|\.)soundcloud\.com$/),
  bandcamp: brand('Bandcamp', siBandcamp, /(^|\.)bandcamp\.com$/),
  caldotcom: brand('Cal.com', siCaldotcom, /(^|\.)cal\.com$/),
  calendly: brand('Calendly', siCalendly, /(^|\.)calendly\.com$/),
  openstreetmap: brand('OpenStreetMap', siOpenstreetmap, /(^|\.)openstreetmap\.org$/),
  paypal: brand('PayPal', siPaypal, /(^|\.)(paypal\.com|paypal\.me)$/),
  stripe: brand('Stripe', siStripe, /(^|\.)(stripe\.com|buy\.stripe\.com)$/),
  cashapp: brand('Cash App', siCashapp, /(^|\.)cash\.app$/),
  venmo: brand('Venmo', siVenmo, /(^|\.)venmo\.com$/),
  gumroad: brand('Gumroad', siGumroad, /(^|\.)gumroad\.com$/),
  shopify: brand('Shopify', siShopify, /(^|\.)(myshopify\.com|shopify\.com)$/),
  etsy: brand('Etsy', siEtsy, /(^|\.)etsy\.com$/),
  medium: brand('Medium', siMedium, /(^|\.)medium\.com$/),
  notion: brand('Notion', siNotion, /(^|\.)(notion\.so|notion\.site)$/),
  wordpress: brand('WordPress', siWordpress, /(^|\.)(wordpress\.com|wp\.me)$/),
  tumblr: brand('Tumblr', siTumblr, /(^|\.)tumblr\.com$/),
  blogger: brand('Blogger', siBlogger, /(^|\.)(blogger\.com|blogspot\.[a-z.]+)$/),
  substack: brand('Substack', siSubstack, /(^|\.)substack\.com$/),
  patreon: brand('Patreon', siPatreon, /(^|\.)patreon\.com$/),
  kofi: brand('Ko-fi', siKofi, /(^|\.)ko-fi\.com$/),
  buymeacoffee: brand('Buy Me a Coffee', siBuymeacoffee, /(^|\.)(buymeacoffee\.com|buymeacoff\.ee)$/),
  deviantart: brand('DeviantArt', siDeviantart, /(^|\.)(deviantart\.com|deviantart\.net|fav\.me)$/),
  flickr: brand('Flickr', siFlickr, /(^|\.)(flickr\.com|flic\.kr)$/),
  dribbble: brand('Dribbble', siDribbble, /(^|\.)dribbble\.com$/),
  behance: brand('Behance', siBehance, /(^|\.)behance\.net$/),
  email: brand('Email', emailIcon),
  website: brand('Website', websiteIcon),
};

/**
 * Call-to-action pill shown on link cards for platforms where it makes sense
 * (hidden on small tiles). Anything not listed gets no pill.
 */
export const PLATFORM_ACTIONS = {
  github: 'Follow',
  gitlab: 'Follow',
  buymeacoffee: 'Buy me a coffee',
  kofi: 'Support',
  patreon: 'Join',
  discord: 'Join',
  deviantart: 'Watch',
  flickr: 'Follow',
  pandora: 'Listen',
  applemusic: 'Listen',
  spotify: 'Listen',
  soundcloud: 'Listen',
  bandcamp: 'Listen',
  paypal: 'Pay',
  stripe: 'Pay',
  gumroad: 'Shop',
  etsy: 'Shop',
  shopify: 'Shop',
  caldotcom: 'Book',
  calendly: 'Book',
  youtube: 'Subscribe',
  twitch: 'Follow',
  tiktok: 'Follow',
  threads: 'Follow',
  substack: 'Subscribe',
  medium: 'Follow',
  wordpress: 'Read',
  tumblr: 'Follow',
  blogger: 'Read',
  whatsapp: 'Message',
  vimeo: 'Watch',
  notion: 'Open',
  telegram: 'Join',
  dribbble: 'Follow',
  behance: 'Follow',
};

/** Parse a URL, tolerating a missing scheme ("example.com/foo"). */
export function parseUrl(input = '') {
  const s = input.trim();
  if (!s) return null;
  try {
    return new URL(/^[a-z][\w+.-]*:/i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
}

/** Return the PLATFORMS key for a URL ("website" when nothing matches). */
export function detectPlatform(url = '') {
  if (/^mailto:/i.test(url)) return 'email';
  const u = parseUrl(url);
  if (!u) return 'website';
  const host = u.hostname.replace(/^www\./, '');
  for (const [key, p] of Object.entries(PLATFORMS)) {
    if (p.match && p.match.test(host)) return key;
  }
  // Any Mastodon-compatible server uses /@user profile paths.
  if (/^\/@[\w.]+\/?$/.test(u.pathname)) return 'mastodon';
  return 'website';
}

/** "https://www.example.com/path" -> "example.com" */
export const prettyHost = (url = '') => parseUrl(url)?.hostname.replace(/^www\./, '') || url;

/** "https://linkedin.com/in/jane-doe/" -> "jane-doe" ('' if unparseable). */
export const lastPathSegment = (url = '') => parseUrl(url)?.pathname.split('/').filter(Boolean).pop() || '';

const EMAIL_RE = /^(mailto:)?[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/i;
const MASTODON_HANDLE_RE = /^@?([\w.]+)@([a-z0-9-]+(\.[a-z0-9-]+)+)$/i;
const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i;

/**
 * Turn whatever the user pasted into a `{ type, data }` tile description.
 * Falls back to a text tile for anything that isn't a link.
 * @param {string} input
 * @returns {{ type: string, data: Record<string, unknown> }}
 */
export function tileFromInput(input) {
  const text = input.trim();

  const masto = text.match(MASTODON_HANDLE_RE);
  if (masto && !text.includes('/')) {
    // "@user@instance.social" is a Mastodon handle; "user@gmail.com" is email.
    if (text.startsWith('@')) return { type: 'mastodon', data: { handle: `${masto[1]}@${masto[2]}`, showLatest: true } };
  }
  if (EMAIL_RE.test(text)) return { type: 'email', data: { email: text.replace(/^mailto:/i, '') } };

  const u = /\s/.test(text) ? null : parseUrl(text);
  if (!u || !u.hostname.includes('.')) return { type: 'text', data: { text } };

  const url = u.toString();
  const path = u.pathname;
  const firstSegment = path.split('/').filter(Boolean)[0] || '';

  switch (detectPlatform(url)) {
    case 'spotify':
      return { type: 'spotify', data: { url } };
    case 'applemusic':
      // Albums, playlists, songs and artists can be embedded.
      return /\/(album|playlist|song|artist|station)\//.test(path) ? { type: 'applemusic', data: { url } } : { type: 'link', data: { url } };
    case 'github':
      // github.com/<user> -> profile card with repos; deeper links stay links.
      return /^\/[\w-]+\/?$/.test(path) ? { type: 'github', data: { username: firstSegment, showRepos: true } } : { type: 'link', data: { url } };
    case 'youtube':
      return /watch|youtu\.be|shorts|embed|live/.test(url) ? { type: 'youtube', data: { url } } : { type: 'link', data: { url } };
    case 'instagram':
      if (/\/(p|reel|tv)\//.test(path)) return { type: 'instagram', data: { mode: 'posts', posts: [url] } };
      return { type: 'instagram', data: { username: firstSegment, mode: 'profile' } };
    case 'x': {
      const status = path.match(/^\/(\w+)\/status/);
      if (status) return { type: 'x', data: { username: status[1], postUrl: url } };
      return { type: 'x', data: { username: firstSegment } };
    }
    case 'bluesky': {
      const handle = path.match(/^\/profile\/([^/]+)/)?.[1];
      return handle ? { type: 'bluesky', data: { handle, showLatest: true } } : { type: 'link', data: { url } };
    }
    case 'mastodon': {
      const user = path.match(/^\/@([\w.]+)/)?.[1];
      return user ? { type: 'mastodon', data: { handle: `${user}@${u.hostname}`, showLatest: true } } : { type: 'link', data: { url } };
    }
    case 'facebook':
      return { type: 'facebook', data: { url } };
    case 'vimeo':
      return /vimeo\.com\/(?:video\/|channels\/[\w-]+\/|showcase\/\d+\/video\/)?\d{5,}/.test(url) ? { type: 'vimeo', data: { url } } : { type: 'link', data: { url } };
    case 'notion':
      return { type: 'notion', data: { url } };
    case 'tiktok':
      return /\/(video|photo)\/\d+/.test(path) ? { type: 'tiktok', data: { url } } : { type: 'link', data: { url } };
    case 'twitch':
      return /^\/[A-Za-z0-9_]{3,25}\/?$/.test(path) ? { type: 'twitch', data: { channel: firstSegment.toLowerCase() } } : { type: 'link', data: { url } };
    case 'soundcloud':
      return firstSegment ? { type: 'soundcloud', data: { url } } : { type: 'link', data: { url } };
    case 'pinterest':
      return /\/pin\/[\w-]*\d{6,}/.test(path) ? { type: 'pinterest', data: { url } } : { type: 'link', data: { url } };
    case 'caldotcom':
    case 'calendly':
      return firstSegment ? { type: 'booking', data: { url, showEmbed: true } } : { type: 'link', data: { url } };
    case 'medium':
    case 'substack':
    case 'wordpress':
    case 'blogger':
    case 'tumblr':
      // Blogs get a card that can show the latest posts.
      return { type: 'blog', data: { url, showLatest: true } };
    case 'whatsapp': {
      const phone = u.hostname.endsWith('wa.me') ? firstSegment.replace(/\D/g, '') : (u.searchParams.get('phone') || '').replace(/\D/g, '');
      return phone ? { type: 'whatsapp', data: { phone, message: u.searchParams.get('text') || '' } } : { type: 'link', data: { url } };
    }
    case 'linkedin':
      if (/\/(posts|feed|embed)\//.test(path)) return { type: 'linkedin', data: { postUrl: url, url } };
      return { type: 'linkedin', data: { url } };
    default:
      if (IMAGE_RE.test(path)) return { type: 'image', data: { src: url } };
      return { type: 'link', data: { url } };
  }
}
