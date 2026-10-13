/**
 * Tiles for social networks.
 *
 * Each component receives `{ tile, shape }` where `tile.data` holds the
 * fields defined for its type in lib/tileRegistry.js and `shape` (from
 * lib/layout.js) says roughly how much room the tile has. Bigger tiles
 * reveal richer content (embedded posts, latest posts, feeds).
 */
import { useView } from "../../context/ViewContext.js";
import { useFeed } from "../../hooks/useFeed.js";
import {
  facebookPageEmbedUrl,
  instagramEmbedUrl,
  linkedinEmbedUrl,
  xPostEmbedUrl,
} from "../../lib/embeds.js";
import { compactNumber } from "../../lib/format.js";
import { hasPreviewRoom, isRoomy } from "../../lib/layout.js";
import {
  detectPlatform,
  lastPathSegment,
  PLATFORM_ACTIONS,
  PLATFORMS,
  prettyHost,
} from "../../lib/platforms.js";
import EmbedFrame from "./EmbedFrame.jsx";
import FeedPost from "./FeedPost.jsx";
import LinkCard from "./LinkCard.jsx";
import { linkHref } from "../../lib/richText.js";

/**
 * Generic link: icon, colour and call-to-action ("Join", "Support"…) are
 * picked from the URL, so a Patreon, Ko-fi or Discord link just works.
 */
export function LinkTile({ tile, shape }) {
  const { url, title, subtitle, thumb } = tile.data;
  const platform = detectPlatform(url);
  const handle = lastPathSegment(url);
  return (
    <LinkCard
      href={url || "#"}
      thumb={thumb}
      platform={platform}
      shape={shape}
      title={
        title ||
        (platform === "website" ? prettyHost(url) : PLATFORMS[platform].name)
      }
      subtitle={
        subtitle ||
        (title
          ? prettyHost(url)
          : platform !== "website" && handle
            ? handle
            : "")
      }
      action={PLATFORM_ACTIONS[platform]}
    />
  );
}

/**
 * GitHub profile with follower/repo counts and, if enabled, your top
 * repositories
 */
export function GitHubTile({ tile, shape }) {
  const { editing } = useView();
  const { username, showRepos, title } = tile.data;
  const feed = useFeed(tile.id, {
    enabled: Boolean(username),
    version: JSON.stringify(tile.data),
    delay: editing ? 1200 : 0,
  });
  const user = feed.data;
  const stats = user
    ? [
        `${compactNumber(user.followers)} followers`,
        `${compactNumber(user.publicRepos)} repos`,
      ].join(" · ")
    : "";
  const repoCount =
    shape === "wide"
      ? 2
      : shape === "tall"
        ? 3
        : Math.min(6, Math.max(2, (tile.h - 1) * Math.min(tile.w, 2)));
  const repos = user?.posts?.slice(0, repoCount) || [];
  return (
    <LinkCard
      href={user?.url || `https://github.com/${username}`}
      platform="github"
      shape={shape}
      title={title || user?.name || "GitHub"}
      subtitle={[username && `@${username}`, shape !== "sm" && stats]
        .filter(Boolean)
        .join(" · ")}
      action="Follow"
    >
      {showRepos && hasPreviewRoom(shape) && repos.length > 0 && (
        <ul
          className={`gh-repos ${tile.w >= 2 && isRoomy(shape) ? "gh-repos--grid" : ""}`}
        >
          {repos.map((r) => (
            <li key={r.url}>
              <a
                className="gh-repo tile-interactive"
                href={linkHref(r.url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <strong>{r.text}</strong>
                {r.description && isRoomy(shape) && (
                  <span className="gh-repo__desc">{r.description}</span>
                )}
                <span className="gh-repo__meta">
                  {r.language && <span>{r.language}</span>}
                  <span>★ {compactNumber(r.stars)}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </LinkCard>
  );
}

/** Twitter (NOT X) profile, optionally with an embedded post. */
export function XTile({ tile, shape }) {
  const { theme } = useView();
  const { username, postUrl, title } = tile.data;
  const embed = isRoomy(shape) && xPostEmbedUrl(postUrl, theme);
  return (
    <LinkCard
      href={`https://x.com/${username}`}
      platform="x"
      shape={shape}
      title={title || "X"}
      subtitle={username ? `@${username}` : ""}
      action="Follow"
    >
      {embed && (
        <EmbedFrame
          src={embed}
          title="Post on X"
          className="embed-frame--post"
        />
      )}
    </LinkCard>
  );
}

/**
 * Shared implementation for feed-capable networks (Bluesky, Mastodon):
 * shows profile info and, if enabled, the latest post from the server proxy.
 */
function FeedSocialTile({ tile, shape, platform, href, fallbackHandle }) {
  const { editing } = useView();
  const wantsFeed = Boolean(tile.data.showLatest && tile.data.handle);
  const feed = useFeed(tile.id, {
    enabled: wantsFeed,
    version: JSON.stringify(tile.data),
    delay: editing ? 1200 : 0,
  });
  const profile = feed.data;
  const followers =
    profile?.followers != null
      ? `${compactNumber(profile.followers)} followers`
      : "";
  const handle = profile?.handle || fallbackHandle;
  return (
    <LinkCard
      href={profile?.url || href}
      platform={platform}
      shape={shape}
      title={tile.data.title || profile?.name || PLATFORMS[platform].name}
      subtitle={[handle && `@${handle}`, shape !== "sm" && followers]
        .filter(Boolean)
        .join(" · ")}
      action="Follow"
    >
      {wantsFeed && hasPreviewRoom(shape) && (
        <FeedPost
          post={profile?.posts?.[0]}
          loading={feed.loading}
          error={feed.error}
          showImage={isRoomy(shape) && tile.w >= 2}
        />
      )}
    </LinkCard>
  );
}

export function BlueskyTile({ tile, shape }) {
  const handle = tile.data.handle;
  return (
    <FeedSocialTile
      tile={tile}
      shape={shape}
      platform="bluesky"
      href={`https://bsky.app/profile/${handle}`}
      fallbackHandle={handle}
    />
  );
}

export function MastodonTile({ tile, shape }) {
  const [user, host] = (tile.data.handle || "").split("@");
  return (
    <FeedSocialTile
      tile={tile}
      shape={shape}
      platform="mastodon"
      href={host ? `https://${host}/@${user}` : "#"}
      fallbackHandle={tile.data.handle}
    />
  );
}

/**
 * How many feed thumbnails fit: more columns for wider tiles, more rows for
 * taller ones (one grid row = half a cell; the header takes ~0.6 of a cell).
 */
function feedGrid(w, h, showHeader) {
  const cols = { 1: 2, 2: 3, 3: 4, 4: 6 }[w] || 3;
  const usable = h / 2 - (showHeader ? 0.6 : 0.1);
  const rows = Math.max(1, Math.floor((usable * cols) / w));
  return { cols, count: cols * rows };
}

/**
 * Instagram in three modes:
 *  - profile: a link card
 *  - posts:   embedded post(s) pasted by URL (no token needed)
 *  - feed:    live grid of your latest posts, fetched by the server
 *             (connect Instagram in Settings → Integrations)
 */
export function InstagramTile({ tile, shape }) {
  const { username, mode, posts = [], title, showHeader = true } = tile.data;
  const { editing } = useView();
  const isFeed = mode === "feed";
  const feed = useFeed(tile.id, {
    enabled: isFeed,
    version: JSON.stringify(tile.data),
    delay: editing ? 1200 : 0,
  });
  const name = username || feed.data?.handle || "";
  const href = name ? `https://www.instagram.com/${name}/` : posts[0] || "#";

  // Feed tiles without the header are just a photo grid.
  if (isFeed && !showHeader && shape !== "bar") {
    return (
      <InstagramGrid
        tile={tile}
        feed={feed}
        showHeader={false}
        editing={editing}
      />
    );
  }

  let preview = null;
  if (mode === "posts" && hasPreviewRoom(shape)) {
    const count = shape === "tall" ? 1 : Math.min(tile.w, 3);
    const embeds = posts.map(instagramEmbedUrl).filter(Boolean).slice(0, count);
    preview = embeds.length > 0 && (
      <div className="insta-embeds" style={{ "--n": embeds.length }}>
        {embeds.map((src) => (
          <EmbedFrame
            key={src}
            src={src}
            title="Instagram post"
            className="embed-frame--instagram"
          />
        ))}
      </div>
    );
  } else if (isFeed && hasPreviewRoom(shape)) {
    preview = (
      <InstagramGrid tile={tile} feed={feed} showHeader editing={editing} />
    );
  }

  return (
    <LinkCard
      href={href}
      platform="instagram"
      shape={shape}
      title={title || "Instagram"}
      subtitle={name ? `@${name}` : ""}
      action="Follow"
    >
      {preview}
    </LinkCard>
  );
}

/** The live thumbnail grid for Instagram feed tiles. */
function InstagramGrid({ tile, feed, showHeader, editing }) {
  const { cols, count } = feedGrid(tile.w, tile.h, showHeader);
  if (feed.error) {
    if (!editing) return null; // visitors just see the profile card
    return (
      <p className="feed-post feed-post--error">
        {feed.error.includes("not connected")
          ? "Connect Instagram in Settings → Integrations to show your feed"
          : "Couldn’t load your Instagram feed"}
      </p>
    );
  }
  const items = feed.data?.posts || Array.from({ length: count }, () => null);
  return (
    <div
      className={`insta-grid ${showHeader ? "" : "insta-grid--bare"}`}
      style={{ "--cols": cols }}
    >
      {items.slice(0, count).map((p, i) =>
        p ? (
          <a
            key={p.url}
            className="insta-grid__item tile-interactive"
            href={linkHref(p.url)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <img src={p.image} alt={p.text.slice(0, 80)} loading="lazy" />
          </a>
        ) : (
          <span key={i} className="insta-grid__item insta-grid__item--empty" />
        ),
      )}
    </div>
  );
}

/** Facebook page/profile, optionally with the Page Plugin timeline. */
export function FacebookTile({ tile, shape }) {
  const { url, showTimeline, title } = tile.data;
  const embed =
    showTimeline &&
    isRoomy(shape) &&
    facebookPageEmbedUrl(url, { width: tile.w >= 2 ? 500 : 300, height: 600 });
  return (
    <LinkCard
      href={url || "#"}
      platform="facebook"
      shape={shape}
      title={title || "Facebook"}
      subtitle={lastPathSegment(url) || "facebook.com"}
      action="Follow"
    >
      {embed && (
        <EmbedFrame
          src={embed}
          title="Facebook timeline"
          className="embed-frame--post"
        />
      )}
    </LinkCard>
  );
}

/** LinkedIn profile/company, optionally with an embedded post. */
export function LinkedInTile({ tile, shape }) {
  const { url, postUrl, title, subtitle } = tile.data;
  const embed = isRoomy(shape) && linkedinEmbedUrl(postUrl);
  return (
    <LinkCard
      href={url || postUrl || "#"}
      platform="linkedin"
      shape={shape}
      title={title || "LinkedIn"}
      subtitle={subtitle || lastPathSegment(url)}
      action="Connect"
    >
      {embed && (
        <EmbedFrame
          src={embed}
          title="LinkedIn post"
          className="embed-frame--post"
        />
      )}
    </LinkCard>
  );
}
