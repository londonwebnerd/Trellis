/**
 * "Card settings" in the tile editor, for every card type:
 *
 *   Visibility  hide the card, or show it only between two dates
 *   Lock        sensitive-content warning, age gate, or an unlock code
 *   Look        the card's own background/text colours and a "spotlight"
 *               animation to draw attention to it
 *
 * These live next to the card's `data` (tile.visibility / .lock / .style)
 * and are checked by the server: hidden and scheduled cards are never sent
 * to visitors, and a code-locked card's content only after the right code.
 */
import { useState } from 'react';
import { Icon } from '../Icons.jsx';
import { DateTimeField } from './CardFields.jsx';
import { useEditor } from './EditorContext.js';

const ANIMATIONS = [
  ['none', 'None'],
  ['pulse', 'Pulse'],
  ['wiggle', 'Wiggle'],
  ['shine', 'Shine'],
  ['bounce', 'Bounce'],
  ['glow', 'Glow'],
];

/** Drop empty values; undefined (= delete the key) when nothing is left. */
const compact = (obj, isEmpty) => (isEmpty(obj) ? undefined : obj);

function ColorInput({ label, value, onChange }) {
  return (
    <label className="card-color">
      <span>{label}</span>
      <span className="card-color__row">
        <input type="color" value={value || '#ffffff'} onChange={(e) => onChange(e.target.value)} aria-label={`${label} colour`} />
        {value ? (
          <button type="button" className="link-button" onClick={() => onChange('')}>
            Default
          </button>
        ) : (
          <small>Theme</small>
        )}
      </span>
    </label>
  );
}

export default function CardOptions({ tile }) {
  const { actions } = useEditor();
  const v = tile.visibility || {};
  const lock = tile.lock || { type: 'none' };
  const style = tile.style || {};
  const [open, setOpen] = useState(Boolean(tile.visibility || tile.lock || tile.style));

  const setVisibility = (patch) => {
    const next = { hidden: false, showFrom: '', showUntil: '', ...v, ...patch };
    actions.updateTileProps(tile.id, { visibility: compact(next, (x) => !x.hidden && !x.showFrom && !x.showUntil) }, 'visibility');
  };
  const setLock = (patch) => {
    const next = { ...lock, ...patch };
    actions.updateTileProps(tile.id, { lock: next.type === 'none' ? undefined : next }, 'lock');
  };
  const setStyle = (patch) => {
    const next = { bg: '', text: '', animation: 'none', ...style, ...patch };
    actions.updateTileProps(tile.id, { style: compact(next, (x) => !x.bg && !x.text && x.animation === 'none') }, `style:${Object.keys(patch)[0]}`);
  };

  const scheduleError = v.showFrom && v.showUntil && Date.parse(v.showUntil) <= Date.parse(v.showFrom) ? 'The end is before the start.' : null;

  return (
    <details className="card-options" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <Icon name="settings" size={16} /> Card settings
        <small>Visibility, lock, colours</small>
      </summary>

      <div className="field">
        <span className="field__label">Visibility</span>
        <label className="field field--checkbox">
          <input type="checkbox" checked={Boolean(v.hidden)} onChange={(e) => setVisibility({ hidden: e.target.checked })} />
          <span>
            Hide this card
            <small>Visitors don’t see it; it stays here in the editor.</small>
          </span>
        </label>
        {!v.hidden && (
          <div className="card-options__dates">
            <label className="field">
              <span className="field__label field__label--small">Show from</span>
              <DateTimeField value={v.showFrom} onChange={(showFrom) => setVisibility({ showFrom })} />
            </label>
            <label className="field">
              <span className="field__label field__label--small">Show until</span>
              <DateTimeField value={v.showUntil} onChange={(showUntil) => setVisibility({ showUntil })} />
            </label>
          </div>
        )}
        {scheduleError && <p className="field__error">{scheduleError}</p>}
        {!v.hidden && (v.showFrom || v.showUntil) && <small className="field__help">Times are in your time zone. The card appears and disappears by itself (no need to publish again).</small>}
      </div>

      <div className="field">
        <span className="field__label">Lock</span>
        <select className="input" value={lock.type} onChange={(e) => setLock({ type: e.target.value, ...(e.target.value === 'age' && !lock.age && { age: 18 }) })} aria-label="Lock">
          <option value="none">No lock</option>
          <option value="sensitive">Sensitive content warning</option>
          <option value="age">Age confirmation</option>
          <option value="code">Unlock code</option>
        </select>
        {lock.type === 'age' && (
          <label className="field card-options__inline">
            <span className="field__label field__label--small">Minimum age</span>
            <input className="input" type="number" min="13" max="99" value={lock.age ?? 18} onChange={(e) => setLock({ age: Number(e.target.value) || 18 })} />
          </label>
        )}
        {lock.type === 'code' && (
          <>
            <label className="field">
              <span className="field__label field__label--small">Code</span>
              <input className="input" maxLength={64} value={lock.code || ''} onChange={(e) => setLock({ code: e.target.value })} placeholder="e.g. VIP2026" autoComplete="off" />
            </label>
            <label className="field">
              <span className="field__label field__label--small">Hint for visitors (optional)</span>
              <input className="input" maxLength={80} value={lock.hint || ''} onChange={(e) => setLock({ hint: e.target.value })} placeholder="e.g. The code is in my newsletter" />
            </label>
            {!lock.code && <p className="field__error">Enter a code, or the lock is removed when saved.</p>}
          </>
        )}
        <small className="field__help">
          {lock.type === 'code'
            ? 'The card’s link and content stay on your server until a visitor enters the code (not case-sensitive).'
            : lock.type === 'none'
              ? 'Visitors see a notice over the card first.'
              : 'Visitors have to confirm before they see the card. Nothing is checked or stored.'}
        </small>
      </div>

      <div className="field">
        <span className="field__label">Look</span>
        <div className="card-options__colors">
          <ColorInput label="Background" value={style.bg} onChange={(bg) => setStyle({ bg })} />
          <ColorInput label="Text" value={style.text} onChange={(text) => setStyle({ text })} />
        </div>
        <span className="field__label field__label--small">Spotlight animation</span>
        <div className="segmented segmented--grid3" role="group" aria-label="Spotlight animation">
          {ANIMATIONS.map(([value, label]) => (
            <button key={value} type="button" className={(style.animation || 'none') === value ? 'is-active' : ''} aria-pressed={(style.animation || 'none') === value} onClick={() => setStyle({ animation: value })}>
              {label}
            </button>
          ))}
        </div>
        <small className="field__help">Use a spotlight on one card at a time, for your newest release or most important link. Visitors who prefer reduced motion see a still highlight instead.</small>
      </div>
    </details>
  );
}
