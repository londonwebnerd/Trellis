import { avatarUrl } from '../lib/avatars.js';

/** Initials for the plain fallback: "Jane Doe" -> "JD". */
export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

/**
 * The profile picture: the uploaded photo if there is one, otherwise a
 * generated DiceBear avatar (gently animated via the .avatar-gen class),
 * otherwise plain initials.
 *
 * @param {{ profile: import('../lib/types.js').Profile, size?: number }} props
 */
export default function Avatar({ profile, size = 160 }) {
  if (profile.avatar) return <img src={profile.avatar} alt="" width={size} height={size} />;
  const generated = avatarUrl(profile);
  if (generated) {
    return <img className="avatar-gen" src={generated} alt="" width={size} height={size} decoding="async" />;
  }
  return <span>{initials(profile.name)}</span>;
}
