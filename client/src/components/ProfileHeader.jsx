import Avatar from './Avatar.jsx';
import { Icon } from './Icons.jsx';
import SocialIcons from './SocialIcons.jsx';

/**
 * Avatar, name, bio and location. Read-only; the editor renders its own
 * editable version (editor/EditableProfile.jsx) with the same markup classes.
 *
 * @param {{ profile: import('../lib/types.js').Profile, socialsOnTop?: boolean }} props
 */
export default function ProfileHeader({ profile, socialsOnTop = true }) {
  return (
    <header className="profile">
      <div className="profile__avatar">
        <Avatar profile={profile} />
      </div>
      <h1 className="profile__name" dir="auto">{profile.name}</h1>
      {profile.bio && <p className="profile__bio" dir="auto">{profile.bio}</p>}
      {profile.location && (
        <p className="profile__location" dir="auto">
          <Icon name="pin" size={16} /> {profile.location}
        </p>
      )}
      {socialsOnTop && <SocialIcons socials={profile.socials} />}
    </header>
  );
}

