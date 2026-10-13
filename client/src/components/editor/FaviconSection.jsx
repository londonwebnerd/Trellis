/**
 * Settings → Favicon: the small icon in browser tabs and bookmarks.
 * Choose the default icon, an emoji, or upload an image (square PNG or ICO
 * works best; it's also used as the iOS home-screen icon).
 */
import { faviconHref } from '../../hooks/useFavicon.js';
import { useImageUpload } from '../../hooks/useImageUpload.js';
import { Icon } from '../Icons.jsx';
import { useEditor } from './EditorContext.js';

const EMOJI_SUGGESTIONS = ['👋', '🚀', '✨', '💻', '🌍', '🎧', '📸', '🔥', '🌱', '⚡️'];

export default function FaviconSection() {
  const { page, actions } = useEditor();
  const favicon = { type: 'default', emoji: '👋', image: '', ...page.settings.favicon };
  const set = (patch, field = 'any') => actions.updateSettings({ favicon: { ...favicon, ...patch } }, `favicon:${field}`);
  const { upload, uploading, error } = useImageUpload((image) => set({ type: 'image', image }, 'image'), 'favicon');

  return (
    <div className="field">
      <span className="field__label">Favicon</span>
      <div className="favicon-row">
        <span className="favicon-preview" title="Preview">
          <img src={faviconHref(favicon)} alt="" width="32" height="32" />
        </span>
        <div className="segmented" role="group" aria-label="Favicon type">
          {[
            { value: 'default', label: 'Default' },
            { value: 'emoji', label: 'Emoji' },
            { value: 'image', label: 'Image' },
          ].map((o) => (
            <button key={o.value} type="button" className={favicon.type === o.value ? 'is-active' : ''} aria-pressed={favicon.type === o.value} onClick={() => set({ type: o.value }, 'type')}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {favicon.type === 'emoji' && (
        <div className="emoji-picker">
          <input className="input emoji-picker__input" value={favicon.emoji} maxLength={8} onChange={(e) => set({ emoji: e.target.value }, 'emoji')} aria-label="Emoji" />
          {EMOJI_SUGGESTIONS.map((emoji) => (
            <button key={emoji} type="button" className={`emoji-picker__option ${favicon.emoji === emoji ? 'is-active' : ''}`} onClick={() => set({ emoji }, 'emoji')}>
              {emoji}
            </button>
          ))}
        </div>
      )}

      {favicon.type === 'image' && (
        <div className="button-row">
          <label className="button button--secondary">
            <Icon name="upload" size={16} /> {uploading ? 'Uploading…' : favicon.image ? 'Replace image' : 'Upload image'}
            <input type="file" accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/webp,image/jpeg,image/gif" hidden onChange={(e) => {
                upload(e.target.files[0]);
                e.target.value = ''; // so picking the same file again works
              }} />
          </label>
        </div>
      )}
      {error && <p className="field__error">{error}</p>}
      <small className="field__help">
        {favicon.type === 'image' ? 'Use a square image, ideally a 512×512 PNG. It’s also used when someone adds your page to their phone’s home screen.' : 'Shown in browser tabs and bookmarks.'}
      </small>
    </div>
  );
}
