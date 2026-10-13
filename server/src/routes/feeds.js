/**
 * Social feed proxies: GET /api/feeds/:tileId
 *
 * Some tiles can show live content (latest Bluesky/Mastodon post, Instagram
 * media grid). Fetching it server-side means:
 *   - one cached upstream request per 10 minutes instead of one per visitor,
 *   - no API tokens in the browser (Instagram),
 *   - no CORS headaches.
 *
 * The endpoint takes a *tile id*, not a raw URL/handle: the handle is read
 * from the saved page, so visitors can't use the server as an open proxy.
 */
import { Router } from 'express';
import { findLiveTile, getDraft } from '../lib/store.js';
import { TtlCache } from '../lib/cache.js';
import { htmlToText } from '../lib/html.js';
import { fetchBlog } from '../lib/blogFeeds.js';
import { getInstagramToken, onIntegrationChange } from '../lib/integrations.js';
import { clientKey, isAuthenticated } from '../lib/auth.js';
import { safeFetchJson } from '../lib/safeFetch.js';

const router = Router();
// Successes are cached for 10 minutes; failures for 3, so a dead or
// rate-limited upstream isn't hammered on every visit.
const cache = new TtlCache(10 * 60 * 1000, 3 * 60 * 1000);

// A new/removed Instagram token should show up immediately.
onIntegrationChange(() => cache.clear());

/** JSON from an upstream API: https only, public addresses only, 2 MB max, 6 s. */
const getJson = (url) => safeFetchJson(url, { headers: { 'User-Agent': 'Trellis/1.0' }, timeoutMs: 6000 });

/**
 * Only pass https URLs to the page (upgrading http), so live feeds can never
 * introduce insecure "mixed content" or javascript:/data: links. Used for
 * every image and link that comes from a third-party service.
 */
const https = (url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null;
  try {
    const parsed = new URL(url.replace(/^http:/i, 'https:'));
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
};

/* ------------------------------- Bluesky ------------------------------ */

async function fetchBluesky(handle) {
  const api = 'https://public.api.bsky.app/xrpc';
  const actor = encodeURIComponent(handle);
  const [profile, feed] = await Promise.all([
    getJson(`${api}/app.bsky.actor.getProfile?actor=${actor}`),
    getJson(`${api}/app.bsky.feed.getAuthorFeed?actor=${actor}&limit=10&filter=posts_no_replies`),
  ]);
  const posts = feed.feed
    .filter((item) => !item.reason) // skip reposts
    .slice(0, 3)
    .map(({ post }) => ({
      text: post.record?.text || '',
      createdAt: post.record?.createdAt,
      url: `https://bsky.app/profile/${profile.handle}/post/${post.uri.split('/').pop()}`,
      image: https(post.embed?.images?.[0]?.thumb),
    }));
  return {
    name: profile.displayName || profile.handle,
    handle: profile.handle,
    avatar: https(profile.avatar),
    followers: profile.followersCount ?? null,
    url: `https://bsky.app/profile/${profile.handle}`,
    posts,
  };
}

/* ------------------------------ Mastodon ------------------------------ */

/** Split "user@instance.social" and refuse anything that isn't a public hostname. */
function parseMastodonHandle(handle) {
  const [user, host] = handle.replace(/^@/, '').split('@');
  const validHost = /^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i.test(host || '') && !/\.(local|internal|lan|home)$/i.test(host);
  if (!user || !validHost) throw new Error('Mastodon handle must look like user@instance.social');
  return { user, host };
}

async function fetchMastodon(handle) {
  const { user, host } = parseMastodonHandle(handle);
  const base = `https://${host}/api/v1`;
  const account = await getJson(`${base}/accounts/lookup?acct=${encodeURIComponent(user)}`);
  const statuses = await getJson(`${base}/accounts/${encodeURIComponent(account.id)}/statuses?limit=3&exclude_replies=true&exclude_reblogs=true`);
  return {
    name: account.display_name || account.username,
    handle: `${account.username}@${host}`,
    avatar: https(account.avatar),
    followers: account.followers_count ?? null,
    url: https(account.url),
    posts: (Array.isArray(statuses) ? statuses : []).map((s) => ({
      text: htmlToText(s.content),
      createdAt: s.created_at,
      url: https(s.url),
      image: https(s.media_attachments?.find((m) => m.type === 'image')?.preview_url),
    })),
  };
}

/* ------------------------------ Instagram ----------------------------- */

/**
 * Requires an Instagram token, connected in the editor (Settings ->
 * Integrations) or set as INSTAGRAM_ACCESS_TOKEN. See lib/integrations.js.
 */
async function fetchInstagram() {
  const raw = getInstagramToken();
  if (!raw) throw Object.assign(new Error('Instagram is not connected'), { code: 'not_connected' });
  const token = encodeURIComponent(raw);
  const api = 'https://graph.instagram.com';
  const [me, media] = await Promise.all([
    getJson(`${api}/me?fields=username,profile_picture_url&access_token=${token}`),
    getJson(`${api}/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink&limit=24&access_token=${token}`),
  ]);
  return {
    name: me.username,
    handle: me.username,
    avatar: https(me.profile_picture_url),
    url: `https://www.instagram.com/${me.username}/`,
    posts: media.data.map((m) => ({
      url: https(m.permalink),
      text: m.caption || '',
      image: https(m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url),
    })).filter((p) => p.image),
  };
}

/* ------------------------------- GitHub ------------------------------- */

/**
 * Public GitHub profile + most recently updated repositories. Uses the
 * unauthenticated API (60 requests/hour per server IP), which the 10-minute
 * cache keeps well within.
 */
async function fetchGitHub(username) {
  if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(username)) throw new Error('Invalid GitHub username');
  const api = `https://api.github.com/users/${encodeURIComponent(username)}`;
  const [user, repos] = await Promise.all([getJson(api), getJson(`${api}/repos?sort=updated&per_page=12&type=owner`)]);
  return {
    name: user.name || user.login,
    handle: user.login,
    avatar: https(user.avatar_url),
    followers: user.followers ?? null,
    publicRepos: user.public_repos ?? null,
    url: https(user.html_url),
    posts: repos
      .filter((r) => !r.fork && !r.archived)
      .sort((a, b) => b.stargazers_count - a.stargazers_count || new Date(b.pushed_at) - new Date(a.pushed_at))
      .slice(0, 6)
      .map((r) => ({ text: r.name, description: r.description || '', stars: r.stargazers_count, language: r.language, url: https(r.html_url) })),
  };
}

/* -------------------------------- Route ------------------------------- */

const loaders = Object.assign(Object.create(null), {
  bluesky: (tile) => tile.data.handle && fetchBluesky(tile.data.handle),
  mastodon: (tile) => tile.data.handle && fetchMastodon(tile.data.handle),
  instagram: (tile) => tile.data.mode === 'feed' && fetchInstagram(),
  github: (tile) => tile.data.username && fetchGitHub(tile.data.username),
  blog: (tile) => tile.data.url && tile.data.showLatest && fetchBlog(tile.data.url),
});

/**
 * Per-client request limit (120 a minute): a page with many feed cards is
 * fine, a script hammering the endpoint is not.
 */
const hits = new Map();
function feedRateLimit(req, res, next) {
  const now = Date.now();
  const key = clientKey(req.ip);
  const entry = hits.get(key);
  if (!entry || now - entry.start > 60_000) {
    if (hits.size > 20_000) {
      // Drop expired windows first, then the oldest, never everything at once.
      for (const [k, e] of hits) if (now - e.start > 60_000) hits.delete(k);
      while (hits.size > 20_000) hits.delete(hits.keys().next().value);
    }
    hits.set(key, { start: now, count: 1 });
    return next();
  }
  entry.count += 1;
  if (entry.count > 120) {
    res.set('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests', code: 'rate_limited' });
  }
  next();
}

router.get('/:tileId', feedRateLimit, async (req, res) => {
  // Visitors: live cards on the published page. The editor: also cards that
  // so far only exist in the draft.
  const editor = isAuthenticated(req);
  let tile = findLiveTile(req.params.tileId) || (editor ? getDraft().tiles.find((t) => t.id === req.params.tileId) : null);
  // A code-locked card's feed would give away what it hides.
  if (tile?.lock?.type === 'code' && !editor) tile = null;
  const loader = tile && loaders[tile.type];
  if (!loader) return res.status(404).json({ error: 'No feed for this tile' });

  // Key on the tile's settings so editing a handle busts the cache.
  const key = `${tile.type}:${JSON.stringify(tile.data)}`;
  try {
    const data = await cache.get(key, async () => {
      try {
        const result = await loader(tile);
        if (!result) throw new Error('Tile is not configured for a feed');
        return result;
      } catch (err) {
        // Logged once per failed upstream attempt, not on every cached replay.
        if (err.code !== 'not_connected') console.warn(`[feeds] ${tile.type} tile ${tile.id}: ${err.message}`);
        throw err;
      }
    });
    res.set('Cache-Control', editor ? 'private, no-store' : 'public, max-age=300');
    res.json(data);
  } catch (err) {
    res.set('Cache-Control', 'no-store');
    res.status(502).json({ error: 'Could not load this feed right now', code: err.code === 'not_connected' ? 'not_connected' : 'upstream_error' });
  }
});

export default router;
