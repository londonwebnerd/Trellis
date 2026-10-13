/**
 * The Presets section of the Design panel:
 *
 *   - built-in presets (lib/appearance.js),
 *   - "On this server": preset files the server owner put in presets/,
 *   - "My presets": designs saved on this page, with save, export, import
 *     and delete.
 *
 * Applying any preset copies its values into the page settings, so
 * everything stays editable afterwards and the action can be undone.
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { presetPatch, PRESETS, THEME_DEFAULTS } from '../../lib/appearance.js';
import { downloadPresetFile, MAX_CUSTOM_PRESETS, presetFromSettings, readPresetFile } from '../../lib/presetFiles.js';
import { Icon } from '../Icons.jsx';
import { useEditor } from './EditorContext.js';

/** Miniature rendering of a preset. */
function PresetPreview({ preset }) {
  const p = presetPatch(preset);
  const a = p.appearance;
  const palette = THEME_DEFAULTS[p.theme === 'dark' ? 'dark' : 'light'];
  const bg = a.colors.bg || palette.bg;
  const card = a.colors.card || palette.card;
  const text = a.colors.text || palette.text;
  const background = a.background.type === 'gradient' ? `linear-gradient(${a.background.angle}deg, ${a.background.color1}, ${a.background.color2})` : bg;
  const radius = Math.max(2, a.radius / 3);
  const cardStyle = {
    background:
      a.cardStyle === 'glass' ? `${card}aa` : a.cardStyle === 'crystal' ? `${card}55` : a.cardStyle === 'flat' ? `color-mix(in srgb, ${text} 6%, ${bg})` : card,
    borderRadius: radius,
    border:
      a.cardStyle === 'outline'
        ? `1px solid ${text}`
        : a.cardStyle === 'crystal'
          ? '1px solid rgba(255,255,255,.7)'
          : a.cardStyle === 'hairline'
            ? `1px solid color-mix(in srgb, ${text} 14%, transparent)`
            : '1px solid transparent',
    boxShadow: a.cardStyle === 'crystal' ? 'inset 0 1px 0 rgba(255,255,255,.8)' : undefined,
  };
  return (
    <span className="preset__preview" style={{ background }}>
      <span className="preset__card preset__card--wide" style={cardStyle}>
        <span className="preset__dot" style={{ background: p.accent }} />
        <span className="preset__line" style={{ background: text }} />
      </span>
      <span className="preset__card" style={cardStyle} />
      <span className="preset__card" style={cardStyle} />
    </span>
  );
}

/**
 * Grid of preset buttons. `actions(preset)` may render extra buttons (export,
 * delete) next to each one.
 */
function PresetGrid({ presets, active, onApply, actions, label }) {
  return (
    <div className="presets" role="group" aria-label={label}>
      {presets.map((preset) => (
        <div key={preset.key} className="preset-wrap">
          <button type="button" className={`preset ${active === preset.key ? 'is-active' : ''}`} onClick={() => onApply(preset)} aria-pressed={active === preset.key}>
            <PresetPreview preset={preset} />
            <span className="preset__name">{preset.name}</span>
          </button>
          {actions && <div className="preset__actions">{actions(preset)}</div>}
        </div>
      ))}
    </div>
  );
}

export default function PresetPicker() {
  const { page, actions } = useEditor();
  const { settings } = page;
  const active = settings.appearance?.preset;
  const mine = settings.customPresets || [];

  const [serverPresets, setServerPresets] = useState([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api
      .getServerPresets()
      .then((r) => alive && setServerPresets(r.presets || []))
      .catch(() => {}); // optional feature: no folder, no section
    return () => {
      alive = false;
    };
  }, []);

  const apply = (preset) => {
    actions.checkpoint();
    const settings = { ...page.settings, ...presetPatch(preset) };
    // A preset may also pick the drawn avatar style, but never replaces an uploaded photo.
    const profile = preset.profile && !page.profile.avatar ? { ...page.profile, ...preset.profile } : page.profile;
    actions.replacePage({ ...page, settings, profile });
    actions.checkpoint();
  };

  const setMine = (list, field) => {
    actions.checkpoint();
    actions.updateSettings({ customPresets: list }, field);
    actions.checkpoint();
  };

  /** Save the current design; a preset with the same name is replaced. */
  const save = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = mine.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    if (!existing && mine.length >= MAX_CUSTOM_PRESETS) {
      setMessage({ error: true, text: `You can keep up to ${MAX_CUSTOM_PRESETS} presets. Delete one first.` });
      return;
    }
    const preset = { ...presetFromSettings(settings, trimmed), ...(existing && { key: existing.key }) };
    const list = existing ? mine.map((p) => (p.key === existing.key ? preset : p)) : [...mine, preset];
    actions.checkpoint();
    actions.updateSettings({ customPresets: list, appearance: { ...settings.appearance, preset: preset.key } }, 'customPresets');
    actions.checkpoint();
    setNaming(false);
    setName('');
    setMessage({ text: existing ? `Updated “${trimmed}”.` : `Saved “${trimmed}”.` });
  };

  const importFile = async (file) => {
    if (!file) return;
    try {
      if (mine.length >= MAX_CUSTOM_PRESETS) throw new Error(`You can keep up to ${MAX_CUSTOM_PRESETS} presets. Delete one first.`);
      const preset = await readPresetFile(file);
      setMine([...mine, preset], 'customPresets');
      setMessage({ text: `Imported “${preset.name}”. Click it to apply.` });
    } catch (err) {
      setMessage({ error: true, text: err.message });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <PresetGrid label="Built-in presets" presets={PRESETS} active={active} onApply={apply} />

      {serverPresets.length > 0 && (
        <>
          <span className="field__label presets__heading">On this server</span>
          <PresetGrid
            label="Presets on this server"
            presets={serverPresets}
            active={active}
            onApply={apply}
            actions={(p) => (
              <button type="button" className="icon-button icon-button--tiny" onClick={() => downloadPresetFile(p)} aria-label={`Export ${p.name}`} title="Export as file">
                <Icon name="download" size={14} />
              </button>
            )}
          />
        </>
      )}

      <span className="field__label presets__heading">My presets</span>
      {mine.length > 0 ? (
        <PresetGrid
          label="My presets"
          presets={mine}
          active={active}
          onApply={apply}
          actions={(p) => (
            <>
              <button type="button" className="icon-button icon-button--tiny" onClick={() => downloadPresetFile(p)} aria-label={`Export ${p.name}`} title="Export as file">
                <Icon name="download" size={14} />
              </button>
              <button
                type="button"
                className="icon-button icon-button--tiny"
                onClick={() => {
                  setMine(
                    mine.filter((x) => x.key !== p.key),
                    'customPresets',
                  );
                  setMessage({ text: `Deleted “${p.name}”. Undo brings it back.` });
                }}
                aria-label={`Delete ${p.name}`}
                title="Delete"
              >
                <Icon name="trash" size={14} />
              </button>
            </>
          )}
        />
      ) : (
        <small className="field__help">Save the design you’ve made here to reuse it later, or import a preset file.</small>
      )}

      {naming ? (
        <form className="preset-save" onSubmit={save}>
          <input
            className="input"
            autoFocus
            maxLength={40}
            placeholder="Preset name"
            aria-label="Preset name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setNaming(false);
              }
            }}
          />
          <button type="submit" className="button" disabled={!name.trim()}>
            Save
          </button>
          <button type="button" className="button button--secondary" onClick={() => setNaming(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="preset-tools">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => {
              setNaming(true);
              setMessage(null);
            }}
          >
            <Icon name="plus" size={16} /> Save current design
          </button>
          <label className="button button--secondary">
            <Icon name="upload" size={16} /> Import
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => importFile(e.target.files[0])} />
          </label>
        </div>
      )}
      {message && (
        <p className={message.error ? 'field__error' : 'field__help'} role="status">
          {message.text}
        </p>
      )}
    </>
  );
}
