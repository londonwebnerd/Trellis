import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons.jsx';
import { useEditor } from './EditorContext.js';

const STATUS_TEXT = { saved: 'Draft saved', pending: 'Unsaved', saving: 'Saving…', error: 'Save failed', conflict: 'Edited elsewhere' };

/**
 * "More" menu: the less frequent actions, so the toolbar stays one row on
 * phones. Closes on outside click, Escape, or after choosing an item.
 */
function MoreMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const button = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    ref.current?.querySelector('[role="menuitem"]')?.focus();
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /** Arrow keys move between items. */
  const onMenuKey = (e) => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const items = [...ref.current.querySelectorAll('[role="menuitem"]:not([disabled])')];
    const i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  };

  return (
    <div className="more-menu" ref={ref}>
      <button
        ref={button}
        type="button"
        className={`icon-button ${open ? 'is-active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More"
        title="More"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div className="more-menu__list" role="menu" aria-label="More" onKeyDown={onMenuKey}>
          {items.filter(Boolean).map((item) =>
            item.href ? (
              <a key={item.label} role="menuitem" className="more-menu__item" href={item.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
                <Icon name={item.icon} size={16} /> {item.label}
              </a>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`more-menu__item ${item.danger ? 'more-menu__item--danger' : ''}`}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
              >
                <Icon name={item.icon} size={16} /> {item.label}
                {item.badge ? <span className="more-menu__badge">{item.badge}</span> : null}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Floating editor toolbar: add, undo/redo, design, settings, a "More" menu,
 * the save status and the Publish button.
 *
 * @param {{
 *   onAdd: () => void,
 *   onSettings: () => void,
 *   onLogout: () => void,
 *   phonePreview: boolean,
 *   onTogglePhonePreview: () => void,
 *   designOpen: boolean,
 *   onToggleDesign: () => void,
 *   onHistory: () => void,
 *   onStats: () => void,
 *   onInbox: () => void,
 *   onShortLinks: () => void,
 *   onSecurity: () => void,
 *   onShowConflict: () => void,
 *   inboxCount: number,
 *   onPublish: () => void,
 *   onDiscard: () => void,
 * }} props
 */
export default function Toolbar({
  onAdd,
  onSettings,
  onLogout,
  phonePreview,
  onTogglePhonePreview,
  designOpen,
  onToggleDesign,
  onHistory,
  onStats,
  onInbox,
  onShortLinks,
  onSecurity,
  onShowConflict,
  inboxCount = 0,
  onPublish,
  onDiscard,
}) {
  const { actions, canUndo, canRedo, saveStatus, saveError, retrySave, hasUnpublished, publishing } = useEditor();
  return (
    <nav className="toolbar" aria-label="Editor">
      <button type="button" className="button button--primary toolbar__add" onClick={onAdd} aria-label="Add a tile">
        <Icon name="plus" /> <span className="toolbar__add-label">Add</span>
      </button>
      <span className="toolbar__divider" />
      <button type="button" className="icon-button" onClick={actions.undo} disabled={!canUndo} aria-label="Undo" title="Undo (⌘/Ctrl+Z)">
        <Icon name="undo" />
      </button>
      <button type="button" className="icon-button" onClick={actions.redo} disabled={!canRedo} aria-label="Redo" title="Redo (⇧⌘/Ctrl+Shift+Z)">
        <Icon name="redo" />
      </button>
      <span className="toolbar__divider" />
      <button
        type="button"
        className={`icon-button ${designOpen ? 'is-active' : ''}`}
        onClick={onToggleDesign}
        aria-pressed={designOpen}
        aria-label="Design"
        title="Design: presets, colours, background"
      >
        <Icon name="palette" />
      </button>
      <button type="button" className="icon-button" onClick={onSettings} aria-label="Settings" title="Settings">
        <Icon name="settings" />
      </button>
      <MoreMenu
        items={[
          { label: phonePreview ? 'Desktop layout' : 'Phone preview', icon: phonePreview ? 'desktop' : 'phone', onClick: onTogglePhonePreview },
          { label: 'Statistics', icon: 'chart', onClick: onStats },
          { label: 'Inbox', icon: 'inbox', onClick: onInbox, badge: inboxCount || null },
          { label: 'Short links', icon: 'link', onClick: onShortLinks },
          { label: 'Version history', icon: 'history', onClick: onHistory },
          { label: 'Sign-in & security', icon: 'shield', onClick: onSecurity },
          { label: 'View live page', icon: 'eye', href: '/' },
          { label: 'Discard unpublished changes', icon: 'undo', onClick: onDiscard, disabled: !hasUnpublished, danger: true },
          { label: 'Log out', icon: 'logout', onClick: onLogout },
        ]}
      />
      <span className="toolbar__divider" />
      {saveStatus === 'conflict' ? (
        <button type="button" className="save-status save-status--error" onClick={onShowConflict} title="Saved in another tab or device: choose a version" aria-label="Edited elsewhere: choose a version">
          {STATUS_TEXT.conflict}
        </button>
      ) : saveStatus === 'error' ? (
        <button type="button" className={`save-status save-status--error`} onClick={retrySave} title={saveError || 'Save failed: tap to retry'} aria-label="Save failed, retry">
          {STATUS_TEXT.error} · Retry
        </button>
      ) : (
        <span className={`save-status save-status--${saveStatus}`} title={STATUS_TEXT[saveStatus]}>
          {STATUS_TEXT[saveStatus]}
        </span>
      )}
      <button
        type="button"
        className={`button toolbar__publish ${hasUnpublished ? 'button--primary' : 'button--secondary'}`}
        onClick={onPublish}
        disabled={!hasUnpublished || publishing}
        aria-label={hasUnpublished ? 'Publish changes' : 'Published'}
        title={hasUnpublished ? 'Make your changes live' : 'Everything is live'}
      >
        <Icon name={hasUnpublished ? 'send' : 'check'} size={16} />
        <span className="toolbar__publish-label">{publishing ? 'Publishing…' : hasUnpublished ? 'Publish' : 'Published'}</span>
      </button>
    </nav>
  );
}
