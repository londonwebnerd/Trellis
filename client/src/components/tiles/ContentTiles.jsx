/**
 * Non-social tiles: media players, email, rich text, link lists, headings
 * and images. Each receives `{ tile, shape }`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  appleMusicEmbedUrl,
  spotifyEmbedUrl,
  vimeoEmbedUrl,
  youtubeEmbedUrl,
} from "../../lib/embeds.js";
import { detectPlatform, prettyHost } from "../../lib/platforms.js";
import {
  cleanRichHtml,
  plainTextToHtml,
  renderRichText,
  linkHref,
} from "../../lib/richText.js";
import { BrandBadge, Icon } from "../Icons.jsx";
import EmbedFrame from "./EmbedFrame.jsx";
import LinkCard from "./LinkCard.jsx";

/** Placeholder shown when a tile has nothing to show yet. */
function EmptyTile({ label }) {
  return <div className="tile-empty">{label}</div>;
}

/** Spotify playlist / album / track / podcast player. Fills the tile. */
export function SpotifyTile({ tile }) {
  const src = spotifyEmbedUrl(tile.data.url);
  if (!src)
    return <EmptyTile label="Paste a Spotify playlist, album or track link" />;
  return (
    <EmbedFrame
      src={src}
      title="Spotify player"
      className="embed-frame--fill"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
    />
  );
}

/**
 * Apple Music player (album, playlist, song, artist). Fills the tile; Apple's
 * player adapts to the height (a 1-row tile gives a compact single player).
 */
export function AppleMusicTile({ tile }) {
  const src = appleMusicEmbedUrl(tile.data.url);
  if (!src)
    return (
      <EmptyTile label="Paste an Apple Music album, playlist or song link" />
    );
  return (
    <EmbedFrame
      src={src}
      title="Apple Music player"
      className="embed-frame--fill embed-frame--applemusic"
      allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write"
      extraSandbox="allow-forms allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
    />
  );
}

/** Vimeo video player (privacy-friendly "do not track" mode). Fills the tile. */
export function VimeoTile({ tile }) {
  const src = vimeoEmbedUrl(tile.data.url);
  if (!src) return <EmptyTile label="Paste a Vimeo video link" />;
  return (
    <EmbedFrame
      src={src}
      title={tile.data.title || "Vimeo video"}
      className="embed-frame--fill"
      allow="autoplay; fullscreen; picture-in-picture; clipboard-write"
    />
  );
}

/** YouTube video player. Fills the tile. */
export function YouTubeTile({ tile }) {
  const src = youtubeEmbedUrl(tile.data.url);
  if (!src) return <EmptyTile label="Paste a YouTube video link" />;
  return (
    <EmbedFrame
      src={src}
      title={tile.data.title || "YouTube video"}
      className="embed-frame--fill"
    />
  );
}

/** Email: opens the mail client; the copy button copies the address. */
export function EmailTile({ tile, shape }) {
  const { email, subject, title, subtitle } = tile.data;
  const [copied, setCopied] = useState(false);
  // Optional pre-filled subject line for the visitor's mail app.
  const href = `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;

  const copy = async (event) => {
    event.preventDefault();
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (e.g. insecure context): ignore */
    }
  };

  return (
    <LinkCard
      href={href}
      platform="email"
      shape={shape}
      title={title || "Email me"}
      subtitle={subtitle || email}
      footer={
        shape !== "sm" && (
          <button
            type="button"
            className="tile-pill tile-pill--button tile-interactive"
            onClick={copy}
          >
            {/* One column is too narrow for the full label on phones. */}
            <Icon name={copied ? "check" : "copy"} size={14} />{" "}
            {copied ? "Copied" : tile.w > 1 ? "Copy address" : "Copy"}
          </button>
        )
      }
    />
  );
}

/**
 * Rich text: headings, bold/italic/underline, links, lists and quotes.
 * Rendered through the allowlist in lib/richText.js (never raw HTML).
 */
export function TextTile({ tile, shape }) {
  const { html, text } = tile.data;
  const content = useMemo(
    () => renderRichText(html ? cleanRichHtml(html) : plainTextToHtml(text)),
    [html, text],
  );
  // Long text scrolls inside the card. Make it focusable then, so it can be
  // scrolled with the keyboard too (Safari won't otherwise).
  const ref = useRef(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || shape === "bar") return undefined;
    const check = () => setScrolls(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shape, content]);
  if (!html && !text) return <EmptyTile label="Click to write something" />;
  return (
    <div
      ref={ref}
      className="tile-text rich-text"
      dir="auto"
      {...(scrolls && { tabIndex: 0, role: "region", "aria-label": "Text" })}
    >
      {/* A one-row card shows the text as a single line, cut with "…". */}
      {shape === "bar" ? (
        <div className="tile-text__line">{content}</div>
      ) : (
        content
      )}
    </div>
  );
}

/**
 * Links stacked as buttons.
 */
export function LinkListTile({ tile, shape }) {
  const { title, links = [] } = tile.data;
  if (!links.length) return <EmptyTile label="Add some links" />;
  return (
    <div className={`link-list link-list--${shape}`}>
      {title && <h3 className="link-list__title">{title}</h3>}
      <ul>
        {links.map((link, i) => {
          const platform = /^mailto:/i.test(link.url)
            ? "email"
            : detectPlatform(link.url);
          const external = /^https?:/i.test(link.url);
          return (
            <li key={`${link.url}-${i}`}>
              <a
                className="link-list__item"
                href={linkHref(link.url)}
                target={external ? "_blank" : undefined}
                rel="noopener noreferrer me"
              >
                <BrandBadge platform={platform} size={26} />
                <span className="link-list__label">
                  {link.label ||
                    prettyHost(link.url) ||
                    link.url.replace(/^(mailto|tel):/i, "")}
                </span>
                <Icon name="arrow" size={14} />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Full-width section heading. */
export function HeadingTile({ tile }) {
  return (
    <h2 className="tile-heading" dir="auto">
      {tile.data.text}
    </h2>
  );
}

/** Photo section. */
export function ImageTile({ tile }) {
  const { src, url, caption } = tile.data;
  if (!src) return <EmptyTile label="Upload an image" />;
  const body = (
    <>
      <img
        className="tile-image__img"
        src={src}
        alt={caption || ""}
        loading="lazy"
      />
      {caption && <span className="tile-image__caption">{caption}</span>}
    </>
  );
  return url ? (
    <a
      className="tile-image"
      href={linkHref(url)}
      target="_blank"
      rel="noopener noreferrer"
    >
      {body}
    </a>
  ) : (
    <div className="tile-image">{body}</div>
  );
}
