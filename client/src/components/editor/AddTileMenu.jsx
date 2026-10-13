/**
 * "Add tile" dialog: paste anything (a URL, @user@instance, an email) and
 * the right tile type is detected, or pick a type from the menu
 * (ADD_MENU in tileRegistry.js).
 */
import { useState } from 'react';
import { newTileId } from '../../lib/format.js';
import { tileFromInput } from '../../lib/platforms.js';
import { ADD_MENU, TILE_TYPES } from '../../lib/tileRegistry.js';
import { BrandBadge, Icon } from '../Icons.jsx';
import Modal from './Modal.jsx';

/**
 * Build a complete tile of `type`, merging registry defaults with `data`.
 * `layout` overrides the type's default size ({ w, h }).
 */
export function createTile(type, data = {}, layout = {}) {
  const def = TILE_TYPES[type];
  return { id: newTileId(), type, w: layout.w ?? def.layout.w, h: layout.h ?? def.layout.h, data: { ...def.defaults, ...data } };
}

/** True if any required field of the tile is still empty. */
const needsDetails = (tile) =>
  TILE_TYPES[tile.type].fields.some((f) => f.required && !tile.data[f.name]);

/**
 * @param {{ open: boolean, onClose: () => void, onAdd: (tile: object, openEditor: boolean) => void }} props
 */
export default function AddTileMenu({ open, onClose, onAdd }) {
  const [input, setInput] = useState('');
  const [asButton, setAsButton] = useState(false);
  const detected = input.trim() ? tileFromInput(input) : null;
  // Embeds and text need room; everything else can be a slim button.
  const canBeButton = detected && !['spotify', 'youtube', 'image', 'text'].includes(detected.type);

  const addFromInput = (e) => {
    e.preventDefault();
    if (!detected) return;
    const tile = createTile(detected.type, detected.data, asButton && canBeButton ? { w: 4, h: 1 } : {});
    onAdd(tile, needsDetails(tile));
    setInput('');
  };

  const addPreset = (item) => onAdd(createTile(item.type, item.data, item.layout), true);

  return (
    <Modal open={open} onClose={onClose} title="Add a tile" className="modal--add">
      <form className="paste-box" onSubmit={addFromInput}>
        <Icon name="link" />
        <input
          className="paste-box__input"
          autoFocus
          /* The long hint is cut off on phones, so they get a shorter one. */
          placeholder={window.matchMedia('(max-width: 560px)').matches ? 'Paste a link or email…' : 'Paste a link, @user@instance or email…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Link, handle or email"
        />
        <button type="submit" className="button button--primary" disabled={!detected}>
          Add {detected ? TILE_TYPES[detected.type].label : ''}
        </button>
      </form>

      <label className="field field--checkbox paste-box__option">
        <input type="checkbox" checked={asButton} onChange={(e) => setAsButton(e.target.checked)} />
        <span>Add as a full-width button (Linktree style)</span>
      </label>

      {ADD_MENU.map((group) => (
        <section key={group.group}>
          <p className="add-grid__label">{group.group}</p>
          <div className="add-grid">
            {group.items.map((item) => {
              const def = TILE_TYPES[item.type];
              const icon = item.uiIcon || def.uiIcon;
              const brand = item.icon || (!item.uiIcon && def.icon);
              return (
                <button key={item.key} type="button" className="add-grid__item" onClick={() => addPreset(item)}>
                  {brand ? (
                    <BrandBadge platform={brand} size={36} />
                  ) : (
                    <span className="ui-badge ui-badge--lg">
                      <Icon name={icon} />
                    </span>
                  )}
                  <span>{item.label || def.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </Modal>
  );
}
