import { timeAgo } from '../../lib/format.js';
import { linkHref } from '../../lib/richText.js';

/**
 * Latest-post preview used by Bluesky and Mastodon tiles.
 * Text is rendered as plain text (the server strips HTML).
 *
 * @param {{ post?: { text: string, createdAt?: string, url: string, image?: string|null }, loading: boolean, error: string|null, showImage: boolean }} props
 */
export default function FeedPost({ post, loading, error, showImage }) {
  if (loading) return <div className="feed-post feed-post--loading" aria-busy="true" />;
  if (error) return <p className="feed-post feed-post--error">Couldn’t load latest post</p>;
  if (!post) return null;
  return (
    <a className="feed-post tile-interactive" href={linkHref(post.url)} target="_blank" rel="noopener noreferrer">
      {showImage && post.image && <img className="feed-post__image" src={post.image} alt="" loading="lazy" />}
      <p className="feed-post__text">{post.text || 'View post'}</p>
      {post.createdAt && <time dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>}
    </a>
  );
}
