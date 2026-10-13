/**
 * Blog and messaging cards.
 *
 *  - BlogTile: Medium, Substack, WordPress.com, Blogger and Tumblr, with
 *    the latest posts read from the blog's feed by the server
 *    (server/src/lib/blogFeeds.js). Other blog addresses show as a link card.
 *  - NotionTile: a Notion page, optionally embedded (published pages only).
 *  - WhatsAppTile: "message me" card that opens a WhatsApp chat (wa.me link),
 *    optionally with a pre-filled message.
 */
import { useView } from "../../context/ViewContext.js";
import { useFeed } from "../../hooks/useFeed.js";
import { notionEmbedUrl } from "../../lib/embeds.js";
import { timeAgo } from "../../lib/format.js";
import { hasPreviewRoom, isRoomy } from "../../lib/layout.js";
import {
  detectPlatform,
  PLATFORM_ACTIONS,
  PLATFORMS,
  prettyHost,
} from "../../lib/platforms.js";
import EmbedFrame from "./EmbedFrame.jsx";
import LinkCard from "./LinkCard.jsx";
import { linkHref } from "../../lib/richText.js";

const BLOG_PLATFORMS = ["medium", "substack", "wordpress", "blogger", "tumblr"];

/** How many posts fit: 1 in a wide card, more as it gets taller. */
const postCount = (tile, shape) =>
  shape === "wide" ? 1 : Math.max(1, Math.min(5, tile.h - 1));

export function BlogTile({ tile, shape }) {
  const { editing } = useView();
  const { url, showLatest, title, subtitle } = tile.data;
  const detected = detectPlatform(url);
  const platform = BLOG_PLATFORMS.includes(detected) ? detected : "website";
  const wantsFeed = Boolean(url && showLatest && platform !== "website");
  const feed = useFeed(tile.id, {
    enabled: wantsFeed,
    version: JSON.stringify(tile.data),
    delay: editing ? 1200 : 0,
  });
  const posts = feed.data?.posts?.slice(0, postCount(tile, shape)) || [];
  const showPosts = wantsFeed && hasPreviewRoom(shape);

  return (
    <LinkCard
      href={url || "#"}
      platform={platform}
      shape={shape}
      title={
        title ||
        feed.data?.name ||
        (platform === "website"
          ? prettyHost(url) || "Blog"
          : PLATFORMS[platform].name)
      }
      subtitle={subtitle || prettyHost(url)}
      action={PLATFORM_ACTIONS[platform] || "Read"}
    >
      {showPosts && feed.loading && (
        <div className="feed-post feed-post--loading" aria-busy="true" />
      )}
      {showPosts && feed.error && editing && (
        <p className="feed-post feed-post--error">Couldn’t load latest posts</p>
      )}
      {showPosts && posts.length > 0 && (
        <ul className="blog-posts">
          {posts.map((post, i) => (
            <li key={post.url}>
              <a
                className="blog-post tile-interactive"
                href={linkHref(post.url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {i === 0 && post.image && isRoomy(shape) && (
                  <img
                    className="blog-post__image"
                    src={post.image}
                    alt=""
                    loading="lazy"
                  />
                )}
                <strong>{post.text}</strong>
                {i === 0 && post.excerpt && isRoomy(shape) && (
                  <span className="blog-post__excerpt">{post.excerpt}</span>
                )}
                {post.createdAt && (
                  <time dateTime={post.createdAt}>
                    {timeAgo(post.createdAt)}
                  </time>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </LinkCard>
  );
}

/** Format a number in international style for display: "+44 071 123 456". */
const formatPhone = (digits = "") =>
  digits ? `+${digits.replace(/(\d{1,3})(?=(\d{3})+$)/g, "$1 ").trim()}` : "";

export function WhatsAppTile({ tile, shape }) {
  const { message, title, subtitle } = tile.data;
  const phone = (tile.data.phone || "").replace(/\D/g, "");
  const href = phone
    ? `https://wa.me/${phone}${message ? `?text=${encodeURIComponent(message)}` : ""}`
    : "#";
  return (
    <LinkCard
      href={href}
      platform="whatsapp"
      shape={shape}
      title={title || "WhatsApp"}
      subtitle={
        subtitle ||
        (shape === "sm" || shape === "bar"
          ? "Message me"
          : formatPhone(phone) || "Message me")
      }
      action="Message"
    />
  );
}

/**
 * Notion page link. Only if the page is published to the web (a notion.site
 * address) and "Show the page" is on.
 */
export function NotionTile({ tile, shape }) {
  const { url, title, subtitle, showEmbed } = tile.data;
  const embed = showEmbed && isRoomy(shape) && notionEmbedUrl(url);
  // "My-Page-Title-1a2b…" -> "My Page Title"
  const pageName = (url || "")
    .split("/")
    .pop()
    ?.replace(/-?[0-9a-f]{32}.*$/i, "")
    .replace(/-/g, " ")
    .trim();
  return (
    <LinkCard
      href={url || "#"}
      platform="notion"
      shape={shape}
      title={title || pageName || "Notion"}
      subtitle={subtitle || prettyHost(url) || "notion.site"}
      action="Open"
    >
      {embed && (
        <EmbedFrame
          src={embed}
          title={title || "Notion page"}
          className="embed-frame--post embed-frame--notion"
        />
      )}
    </LinkCard>
  );
}
