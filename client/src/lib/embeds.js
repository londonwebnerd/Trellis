/**
 * Embed URL builders.
 *
 * Every iframe on the page gets its `src` from one of these functions, which
 * parse an ID out of a normal share URL and build the official embed URL.
 * User input never goes straight into an iframe `src`, and every host used
 * here is whitelisted in the server's Content-Security-Policy (frame-src).
 *
 * Each function returns `null` when the URL isn't recognised.
 */

/** https://open.spotify.com/playlist/ID -> Spotify embed player. */
export function spotifyEmbedUrl(url = '') {
  const m = url.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album|track|artist|show|episode)\/([A-Za-z0-9]+)/);
  return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator` : null;
}

/**
 * music.apple.com/<country>/<album|playlist|song|artist>/… -> Apple Music
 * player. The embed host mirrors the normal URL path.
 */
export function appleMusicEmbedUrl(url = '') {
  const m = url.match(/^https:\/\/(?:embed\.)?music\.apple\.com(\/[a-z]{2}\/(?:album|playlist|song|artist|station)\/[^?#\s]+)(\?[^#\s]*)?/i);
  if (!m) return null;
  const query = new URLSearchParams(m[2] || '');
  const params = new URLSearchParams();
  if (query.get('i')) params.set('i', query.get('i')); // a single song inside an album
  params.set('theme', 'auto');
  return `https://embed.music.apple.com${m[1]}?${params}`;
}

/**
 * Published Notion page (https://<workspace>.notion.site/<title>-<id>) ->
 * Notion's embed view (/ebd/<id>). Only pages published to the web from a
 * notion.site address can be embedded; private notion.so links can't.
 */
export function notionEmbedUrl(url = '') {
  const m = url.match(/^https:\/\/([a-z0-9-]+)\.notion\.site\/(?:ebd\/)?(?:[^?#]*?-)?([0-9a-f]{32})(?:[?#]|$)/i);
  return m ? `https://${m[1]}.notion.site/ebd/${m[2].toLowerCase()}` : null;
}

/**
 * Vimeo video -> Vimeo player with "do not track". Handles vimeo.com/123,
 * vimeo.com/channels/x/123, vimeo.com/showcase/x/video/123, player URLs and
 * unlisted videos (vimeo.com/123/abcdef or ?h=abcdef).
 */
export function vimeoEmbedUrl(url = '') {
  const m = url.match(/^https:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/|channels\/[\w-]+\/|groups\/[\w-]+\/videos\/|showcase\/\d+\/video\/)?(\d{5,12})(?:\/([\da-f]{6,20}))?/i);
  if (!m) return null;
  const hash = m[2] || new URL(url).searchParams.get('h');
  const params = new URLSearchParams({ dnt: '1' });
  if (hash && /^[\da-f]{6,20}$/i.test(hash)) params.set('h', hash);
  return `https://player.vimeo.com/video/${m[1]}?${params}`;
}

/** watch?v=, youtu.be/, /shorts/, /embed/ -> privacy-enhanced YouTube player. */
export function youtubeEmbedUrl(url = '') {
  const m =
    url.match(/youtube\.com\/watch\?(?:.*&)?v=([\w-]{11})/) ||
    url.match(/youtu\.be\/([\w-]{11})/) ||
    url.match(/youtube\.com\/(?:shorts|embed|live)\/([\w-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}

/** Instagram post/reel URL -> Instagram embed page. */
export function instagramEmbedUrl(url = '') {
  const m = url.match(/instagram\.com\/(?:[\w.]+\/)?(p|reel|tv)\/([\w-]+)/);
  return m ? `https://www.instagram.com/${m[1]}/${m[2]}/embed/` : null;
}

/** x.com / twitter.com status URL -> embedded post. */
export function xPostEmbedUrl(url = '', theme = 'light') {
  const m = url.match(/(?:x|twitter)\.com\/\w+\/status(?:es)?\/(\d+)/);
  return m ? `https://platform.twitter.com/embed/Tweet.html?id=${m[1]}&theme=${theme}&dnt=true` : null;
}

/** Facebook page URL -> Page Plugin showing the page timeline. */
export function facebookPageEmbedUrl(url = '', { width = 500, height = 600 } = {}) {
  if (!/^https:\/\/(www\.|m\.)?facebook\.com\//.test(url)) return null;
  const params = new URLSearchParams({
    href: url,
    tabs: 'timeline',
    width: String(Math.round(Math.min(500, Math.max(180, width)))),
    height: String(Math.round(Math.max(70, height))),
    small_header: 'true',
    adapt_container_width: 'true',
    hide_cover: 'false',
    show_facepile: 'false',
  });
  return `https://www.facebook.com/plugins/page.php?${params}`;
}

/**
 * LinkedIn post -> embed. Accepts the iframe URL from LinkedIn's "Embed this
 * post" menu, a feed/update URN URL, or a /posts/...-activity-123-... URL.
 */
export function linkedinEmbedUrl(url = '') {
  const urn = url.match(/urn:li:(share|activity|ugcPost):(\d+)/);
  if (urn) return `https://www.linkedin.com/embed/feed/update/urn:li:${urn[1]}:${urn[2]}`;
  const activity = url.match(/linkedin\.com\/posts\/.*activity-(\d+)/);
  return activity ? `https://www.linkedin.com/embed/feed/update/urn:li:activity:${activity[1]}` : null;
}

/** TikTok video (tiktok.com/@you/video/123…) -> TikTok's embed player. */
export function tiktokEmbedUrl(url = '') {
  const m = url.match(/^https:\/\/(?:www\.|m\.)?tiktok\.com\/(?:@[\w.-]+\/(?:video|photo)\/|embed\/(?:v2\/)?|player\/v1\/|v\/)(\d{8,25})/i);
  return m ? `https://www.tiktok.com/player/v1/${m[1]}?description=1&music_info=1&rel=0` : null;
}

/** Twitch channel name or link (twitch.tv/name, twitch.tv/videos/123) -> Twitch player. */
export function twitchEmbedUrl(input = '', parent = typeof window !== 'undefined' ? window.location.hostname : 'localhost') {
  const value = input.trim();
  const params = new URLSearchParams({ parent, autoplay: 'false', muted: 'true' });
  const video = value.match(/twitch\.tv\/videos\/(\d+)/i);
  if (video) params.set('video', `v${video[1]}`);
  else {
    const name = (value.match(/twitch\.tv\/([A-Za-z0-9_]{3,25})(?:[/?#]|$)/i) || value.match(/^@?([A-Za-z0-9_]{3,25})$/))?.[1];
    if (!name || /^(videos|directory|p|settings)$/i.test(name)) return null;
    params.set('channel', name.toLowerCase());
  }
  return `https://player.twitch.tv/?${params}`;
}

/** Twitch channel page for a name or link (for the "Open on Twitch" link). */
export function twitchPageUrl(input = '') {
  const value = input.trim();
  if (/^https:\/\/(www\.)?twitch\.tv\//i.test(value)) return value;
  const name = value.replace(/^@/, '');
  return /^[A-Za-z0-9_]{3,25}$/.test(name) ? `https://www.twitch.tv/${name.toLowerCase()}` : '';
}

/** SoundCloud track, playlist or profile link -> SoundCloud's widget. */
export function soundcloudEmbedUrl(url = '', { visual = true } = {}) {
  if (!/^https:\/\/(?:www\.|m\.|on\.)?soundcloud\.com\/[^\s]+/i.test(url)) return null;
  const clean = url.replace(/^https:\/\/m\./i, 'https://').split('#')[0];
  const params = new URLSearchParams({ url: clean, auto_play: 'false', hide_related: 'true', show_comments: 'false', show_user: 'true', show_reposts: 'false', show_teaser: 'false', visual: String(visual) });
  return `https://w.soundcloud.com/player/?${params}`;
}

/**
 * Bandcamp player. Bandcamp needs the album/track number, which the server
 * pulls out of the pasted embed code ("album=123" or "track=123").
 */
export function bandcampEmbedUrl(embedId = '', { theme = 'light', tall = true } = {}) {
  const m = embedId.match(/\b(album|track)=(\d{3,15})\b/);
  if (!m) return null;
  const colors = theme === 'dark' ? 'bgcol=333333/linkcol=0f91ff' : 'bgcol=ffffff/linkcol=0687f5';
  return `https://bandcamp.com/EmbeddedPlayer/${m[1]}=${m[2]}/size=large/${colors}/${tall ? 'tracklist=true/artwork=small' : 'tracklist=false/artwork=small'}/transparent=true/`;
}

/** Pinterest pin (pinterest.com/pin/123/) -> Pinterest's pin widget. */
export function pinterestEmbedUrl(url = '') {
  const m = url.match(/^https:\/\/(?:[a-z]{2,3}\.|www\.)?pinterest\.[a-z.]{2,6}\/pin\/(?:[\w-]*--)?(\d{6,25})/i);
  return m ? `https://assets.pinterest.com/ext/embed.html?id=${m[1]}` : null;
}

/**
 * Booking page: Cal.com (cal.com/you/30min) or Calendly
 * (calendly.com/you/30min) -> the provider's inline booking view.
 */
export function bookingEmbedUrl(url = '', theme = 'light') {
  const cal = url.match(/^https:\/\/(?:app\.)?cal\.com\/([\w.-]+(?:\/[\w.-]+)?)\/?(?:[?#]|$)/i);
  if (cal) return `https://cal.com/${cal[1]}/embed?${new URLSearchParams({ embed: '', layout: 'month_view', theme })}`;
  const calendly = url.match(/^https:\/\/calendly\.com\/([\w.-]+(?:\/[\w.-]+)?)\/?(?:[?#]|$)/i);
  if (calendly) {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    return `https://calendly.com/${calendly[1]}?${new URLSearchParams({ embed_domain: host, embed_type: 'Inline', hide_gdpr_banner: '1', hide_event_type_details: '0' })}`;
  }
  return null;
}

/** Which booking service a link points to. */
export const bookingProvider = (url = '') => (/^https:\/\/(?:app\.)?cal\.com\//i.test(url) ? 'cal' : /^https:\/\/calendly\.com\//i.test(url) ? 'calendly' : null);

/** OpenStreetMap view centred on a point, with a marker. */
export function osmEmbedUrl(lat, lon, zoom = 14) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const z = Math.min(18, Math.max(3, Math.round(zoom)));
  const dLon = 360 / 2 ** z;
  const dLat = dLon * Math.max(0.2, Math.cos((lat * Math.PI) / 180)) * 0.6;
  const bbox = [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((n) => n.toFixed(5)).join(',');
  return `https://www.openstreetmap.org/export/embed.html?${new URLSearchParams({ bbox, layer: 'mapnik', marker: `${lat.toFixed(5)},${lon.toFixed(5)}` })}`;
}

/** Link to the same place on openstreetmap.org (opens in a new tab). */
export const osmPageUrl = (lat, lon, zoom = 15) => `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lon.toFixed(5)}#map=${zoom}/${lat.toFixed(5)}/${lon.toFixed(5)}`;

/** Names of embed providers, by iframe host (for the click-to-load notice). */
const PROVIDERS = [
  [/(^|\.)spotify\.com$/, 'Spotify'],
  [/(^|\.)music\.apple\.com$/, 'Apple Music'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)twitter\.com$/, 'X'],
  [/(^|\.)facebook\.com$/, 'Facebook'],
  [/(^|\.)youtube-nocookie\.com$/, 'YouTube'],
  [/(^|\.)vimeo\.com$/, 'Vimeo'],
  [/(^|\.)linkedin\.com$/, 'LinkedIn'],
  [/(^|\.)notion\.site$/, 'Notion'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)twitch\.tv$/, 'Twitch'],
  [/(^|\.)soundcloud\.com$/, 'SoundCloud'],
  [/(^|\.)bandcamp\.com$/, 'Bandcamp'],
  [/(^|\.)pinterest\.com$/, 'Pinterest'],
  [/(^|\.)cal\.com$/, 'Cal.com'],
  [/(^|\.)calendly\.com$/, 'Calendly'],
  [/(^|\.)openstreetmap\.org$/, 'OpenStreetMap'],
];

/** "YouTube" for a youtube-nocookie.com iframe, etc. */
export function embedProvider(src = '') {
  let host = '';
  try {
    host = new URL(src).hostname;
  } catch {
    return 'this service';
  }
  return PROVIDERS.find(([re]) => re.test(host))?.[1] || host;
}
