/**
 * Settings → Site name & description.
 *
 * One name, used everywhere: the browser tab, bookmarks, search results,
 * link previews (iMessage, WhatsApp, Slack…), and the label under the icon
 * when someone adds the page to their phone's home screen. Renaming the site
 * here updates all of them at once; the previews below show the result.
 */
import { faviconHref } from '../../hooks/useFavicon.js';
import { siteName } from '../../hooks/useSiteName.js';
import { useEditor } from './EditorContext.js';

export default function SiteNameSection() {
  const { page, actions } = useEditor();
  const { settings, profile } = page;
  const set = (name) => (value) => actions.updateSettings({ [name]: value }, name);
  const name = siteName(page);
  const description = settings.description || profile.bio.slice(0, 160);
  const host = window.location.host;

  return (
    <>
      <div className="field">
        <label htmlFor="siteName">Site name</label>
        <div className="site-name-row">
          <input
            id="siteName"
            className="input"
            placeholder={profile.name || 'e.g. Andrew Gomes'}
            value={settings.pageTitle}
            maxLength={80}
            onChange={(e) => set('pageTitle')(e.target.value)}
          />
          {settings.pageTitle && (
            <button type="button" className="button button--secondary" onClick={() => set('pageTitle')('')} title="Use your profile name instead">
              Use my name
            </button>
          )}
        </div>
        <small className="field__help">Shown in the browser tab, bookmarks, search results, link previews and on phone home screens. Leave empty to use your name.</small>

        <div className="site-previews" aria-hidden="true">
          <span className="site-previews__label">Browser tab</span>
          <div className="browser-preview">
            <div className="browser-preview__strip">
              <div className="tab-preview">
                <img src={faviconHref(settings.favicon)} alt="" width="16" height="16" />
                <span>{name}</span>
                <span className="tab-preview__close">×</span>
              </div>
            </div>
            <div className="browser-preview__bar">
              <span className="browser-preview__url">{host}</span>
            </div>
          </div>
          <span className="site-previews__label">Link preview</span>
          <div className="share-preview">
            {profile.avatar && <img className="share-preview__image" src={profile.avatar} alt="" />}
            <div>
              <small>{host}</small>
              <strong>{name}</strong>
              <span>{description || 'Add a description below'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="field">
        <label htmlFor="description">Description</label>
        <textarea id="description" className="input" rows={3} placeholder="Defaults to your bio" value={settings.description} maxLength={200} onChange={(e) => set('description')(e.target.value)} />
        <small className="field__help">Used in search results and link previews on social networks and chat apps.</small>
      </div>
    </>
  );
}
