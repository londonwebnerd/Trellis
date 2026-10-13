/**
 * Edit the row of social icons under the profile (Linktree-style): a list
 * of links, each shown as its network's icon, and where the row goes.
 */
import { useState } from 'react';
import { detectPlatform, PLATFORMS, prettyHost } from '../../lib/platforms.js';
import { BrandBadge, Icon } from '../Icons.jsx';
import SocialIcons from '../SocialIcons.jsx';
import { useEditor } from './EditorContext.js';
import Modal from './Modal.jsx';

const MAX = 16;

/** Accept "you@example.com" and bare "instagram.com/you" too. */
function normalise(input) {
  const v = input.trim();
  if (!v) return '';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`;
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  return `https://${v.replace(/^\/+/, '')}`;
}

export function SocialsEditor() {
  const { page } = useEditor();
  const [open, setOpen] = useState(false);
  const socials = page.profile.socials || [];
  return (
    <div className="socials-editor">
      {page.settings.socialsPosition !== 'bottom' && (
        <div inert="">
          <SocialIcons socials={socials} />
        </div>
      )}
      <button type="button" className="link-button" onClick={() => setOpen(true)}>
        {socials.length ? 'Edit social icons' : 'Add social icons'}
      </button>
      <SocialsDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

export default function SocialsDialog({ open, onClose }) {
  const { page, actions } = useEditor();
  const socials = page.profile.socials || [];
  const [draft, setDraft] = useState('');
  const set = (list) => actions.updateProfile({ socials: list }, 'socials');

  const add = (e) => {
    e.preventDefault();
    const url = normalise(draft);
    if (!url || socials.length >= MAX) return;
    set([...socials, { url }]);
    setDraft('');
  };
  const move = (i, by) => {
    const next = [...socials];
    const [item] = next.splice(i, 1);
    next.splice(i + by, 0, item);
    set(next);
  };

  return (
    <Modal open={open} onClose={onClose} title="Social icons">
      <div className="form">
        <p className="field__help">Small icons for your profiles, under your bio or at the bottom of the page. Paste a link and the right icon is picked for you.</p>
        <form className="socials-add" onSubmit={add}>
          <input className="input" type="text" inputMode="url" placeholder="https://instagram.com/you" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Profile link" />
          <button type="submit" className="button button--primary" disabled={!draft.trim() || socials.length >= MAX}>
            <Icon name="plus" size={16} /> Add
          </button>
        </form>
        {socials.length > 0 && (
          <ol className="socials-list">
            {socials.map(({ url }, i) => {
              const platform = /^mailto:/i.test(url) ? 'email' : detectPlatform(url);
              return (
                <li key={`${url}-${i}`}>
                  <BrandBadge platform={platform} size={28} />
                  <span className="socials-list__text">
                    <b>{platform === 'website' ? prettyHost(url) : PLATFORMS[platform].name}</b>
                    <small>{url.replace(/^(https?:\/\/(www\.)?|mailto:)/, '')}</small>
                  </span>
                  <button type="button" className="icon-button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                    <Icon name="chevron-up" size={16} />
                  </button>
                  <button type="button" className="icon-button" onClick={() => move(i, 1)} disabled={i === socials.length - 1} aria-label="Move down">
                    <Icon name="chevron-down" size={16} />
                  </button>
                  <button type="button" className="icon-button" onClick={() => set(socials.filter((_, j) => j !== i))} aria-label="Remove">
                    <Icon name="trash" size={16} />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        <div className="field">
          <span className="field__label">Position</span>
          <div className="segmented" role="group" aria-label="Position">
            {[
              ['top', 'Under the bio'],
              ['bottom', 'Bottom of the page'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={(page.settings.socialsPosition || 'top') === value ? 'is-active' : ''}
                aria-pressed={(page.settings.socialsPosition || 'top') === value}
                onClick={() => actions.updateSettings({ socialsPosition: value }, 'socialsPosition')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
