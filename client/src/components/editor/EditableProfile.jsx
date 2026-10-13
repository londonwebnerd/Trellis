/**
 * Editable version of ProfileHeader: click the avatar to upload a photo,
 * type straight into name, bio and location. Without a photo, a small
 * picker chooses the generated (DiceBear) avatar style and seed.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useImageUpload } from '../../hooks/useImageUpload.js';
import { SocialsEditor } from './SocialsDialog.jsx';
import { AVATAR_STYLES, DEFAULT_AVATAR_STYLE, avatarUrl, randomSeed } from '../../lib/avatars.js';
import Avatar, { initials } from '../Avatar.jsx';
import { Icon } from '../Icons.jsx';
import { useEditor } from './EditorContext.js';

/** <textarea> that grows with its content. */
function AutoTextarea({ value, onChange, ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} rows={1} value={value} onChange={onChange} {...rest} />;
}

export default function EditableProfile() {
  const { page, actions } = useEditor();
  const { profile } = page;

  const onUploaded = useCallback((avatar) => actions.updateProfile({ avatar }, 'avatar'), [actions]);
  const { upload, uploading, error, dialog } = useImageUpload(onUploaded, 'avatar');

  const field = (name) => ({
    value: profile[name],
    onChange: (e) => actions.updateProfile({ [name]: e.target.value }, name),
  });

  return (
    <header className="profile profile--editing">
      <label className={`profile__avatar profile__avatar--editable ${uploading ? 'is-busy' : ''}`} title="Change photo">
        <Avatar profile={profile} />
        <span className="profile__avatar-overlay">
          <Icon name="upload" /> {profile.avatar ? 'Change' : 'Add photo'}
        </span>
        <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" hidden onChange={(e) => {
                upload(e.target.files[0]);
                e.target.value = ''; // so picking the same file again works
              }} />
      </label>
      {profile.avatar && (
        <button type="button" className="link-button" onClick={() => actions.updateProfile({ avatar: '' }, 'avatar')}>
          Remove photo
        </button>
      )}
      {!profile.avatar && <AvatarStylePicker profile={profile} onChange={(patch) => actions.updateProfile(patch, 'avatarStyle')} />}
      {error && <p className="field__error">{error}</p>}
      {dialog}

      <AutoTextarea className="profile__name inline-input" placeholder="Your name" maxLength={80} aria-label="Name" {...field('name')} />
      <AutoTextarea className="profile__bio inline-input" placeholder="Write a short bio…" maxLength={600} aria-label="Bio" {...field('bio')} />
      <div className="profile__location">
        <Icon name="pin" size={16} />
        <input className="inline-input" placeholder="Location (optional)" maxLength={80} aria-label="Location" {...field('location')} />
      </div>
      <SocialsEditor />
    </header>
  );
}

/**
 * Style + shuffle controls for the generated avatar. Collapsed by default so
 * the profile header stays tidy.
 */
function AvatarStylePicker({ profile, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const toggleRef = useRef(null);

  // Close the popover on outside click or Escape; focus the current style
  // when it opens, and return focus to the toggle after Escape.
  useEffect(() => {
    if (!open) return undefined;
    ref.current?.querySelector('[aria-checked="true"]')?.focus();
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => {
      // Ignore an Escape something else (a dialog, the design panel) already handled.
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = profile.avatarStyle || DEFAULT_AVATAR_STYLE;
  const label = AVATAR_STYLES.find((s) => s.id === current)?.label || 'Sketch';
  return (
    <div className="avatar-picker" ref={ref}>
      <div className="avatar-picker__row">
        <button ref={toggleRef} type="button" className="link-button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          Avatar: {label}
        </button>
        {current !== 'initials' && (
          <button type="button" className="link-button" onClick={() => onChange({ avatarSeed: randomSeed() })} title="Generate a different avatar">
            Shuffle
          </button>
        )}
        {profile.avatarSeed && (
          <button type="button" className="link-button" onClick={() => onChange({ avatarSeed: '' })} title="Base the avatar on your name again">
            Reset
          </button>
        )}
      </div>
      {open && (
        <div className="avatar-picker__grid" role="radiogroup" aria-label="Avatar style">
          {AVATAR_STYLES.map((s) => {
            const src = avatarUrl(profile, s.id);
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={current === s.id}
                className={`avatar-picker__option ${current === s.id ? 'is-active' : ''}`}
                onClick={() => {
                  onChange({ avatarStyle: s.id });
                  setOpen(false);
                }}
              >
                {src ? <img src={src} alt="" width="44" height="44" loading="lazy" /> : <span>{initials(profile.name)}</span>}
                <small>{s.label}</small>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
