/**
 * Design panel: a non-modal drawer (bottom sheet on phones) so the page
 * stays visible and every change previews live. Covers presets, light/dark
 * mode, colours (picker or hex code), background, animated background
 * effects, card style (+ clarity for Glass/Crystal), corner radius, font,
 * avatar animation and animation.
 *
 * Changes go through the normal editor actions, so they autosave and can be
 * undone; dragging a colour picker or slider counts as one undo step.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useImageUpload } from '../../hooks/useImageUpload.js';
import { AVATAR_EFFECTS, gradientTone, ICON_STYLES, THEME_DEFAULTS, withAppearanceDefaults } from '../../lib/appearance.js';
import Avatar from '../Avatar.jsx';
import { BrandBadge, Icon } from '../Icons.jsx';
import { TILE_TYPES } from '../../lib/tileRegistry.js';
import { useEditor } from './EditorContext.js';
import PresetPicker from './PresetPicker.jsx';

/**
 * Cards that work well as a one-row link button (profiles and links). Players,
 * photos, text and other media keep their size.
 */
const BUTTONABLE = new Set(['link', 'x', 'bluesky', 'mastodon', 'instagram', 'facebook', 'linkedin', 'github', 'blog', 'notion', 'whatsapp', 'email', 'twitch', 'booking', 'file', 'contact', 'vcard']);

const isButton = (t) => t.h <= 1 && t.type !== 'heading';
const canBeButton = (t) => BUTTONABLE.has(t.type) && !isButton(t) && (TILE_TYPES[t.type]?.layout?.minH ?? 1) <= 1;

const ACCENTS = ['#0a84ff', '#30d158', '#ff9f0a', '#ff375f', '#bf5af2', '#64d2ff', '#111111'];

/** Segmented control. */
function Segmented({ label, value, options, onChange, className = '' }) {
  return (
    <div className={`segmented ${className}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={value === o.value ? 'is-active' : ''} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Normalise a typed hex colour: "#abc", "abc", "#AABBCC" -> "#aabbcc".
 * Returns null while the text isn't a complete colour yet.
 */
export function parseHex(text) {
  const m = String(text).trim().replace(/^#/, '').match(/^([\da-f]{3}|[\da-f]{6})$/i);
  if (!m) return null;
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return `#${hex.toLowerCase()}`;
}

/**
 * Text box for a hex colour code. Applies as soon as the code is complete;
 * on blur an incomplete code snaps back to the current colour.
 */
function HexInput({ value, onChange, label }) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  // Follow outside changes (colour picker, presets, undo), but never while
  // the user is typing: "#123" is already a valid colour, and replacing the
  // box with "#112233" would stop them typing the other three digits.
  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);
  return (
    <input
      className="hex-input"
      type="text"
      inputMode="text"
      spellCheck={false}
      autoComplete="off"
      maxLength={7}
      aria-label={`${label} hex code`}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        setText(e.target.value);
        const hex = parseHex(e.target.value);
        if (hex && hex !== value) onChange(hex);
      }}
      onBlur={() => {
        setFocused(false);
        setText(value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

/** Colour picker + hex code, with a "reset to theme default" button. */
function ColorRow({ label, value, fallback, onChange }) {
  return (
    <div className="color-row">
      <input type="color" value={value || fallback} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      <span className="color-row__label">{label}</span>
      <HexInput label={label} value={value || fallback} onChange={onChange} />
      {value ? (
        <button type="button" className="link-button" onClick={() => onChange('')}>
          Reset
        </button>
      ) : (
        <small>Default</small>
      )}
    </div>
  );
}

/** Labelled range slider. */
function Slider({ label, value, min, max, unit = '', onChange }) {
  return (
    <label className="slider">
      <span>
        {label} <b>{value}{unit}</b>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/** @param {{ onClose: () => void }} props */
export default function DesignPanel({ onClose }) {
  const { page, actions } = useEditor();
  const buttonCount = page.tiles.filter(isButton).length;
  const convertible = page.tiles.filter(canBeButton);
  /** Every link and profile card becomes a full-width button (one undo step). */
  const makeButtons = () => {
    actions.checkpoint();
    actions.replacePage({ ...page, tiles: page.tiles.map((t) => (canBeButton(t) ? { ...t, w: Math.min(4, TILE_TYPES[t.type]?.layout?.maxW ?? 4), h: 1 } : t)) });
    actions.checkpoint();
  };
  const { settings } = page;
  const a = withAppearanceDefaults(settings.appearance);
  /** A clearly light or dark gradient decides the colours, whatever the mode. */
  const tone = gradientTone(a);
  const palette = THEME_DEFAULTS[(tone || settings.theme) === 'dark' ? 'dark' : 'light'];

  /** Update appearance fields; marks the design as customised. */
  const setAppearance = useCallback(
    (patch, field) => actions.updateSettings({ appearance: { ...a, ...patch, preset: 'custom' } }, `appearance:${field}`),
    [actions, a],
  );
  const setColor = (name) => (value) => setAppearance({ colors: { ...a.colors, [name]: value } }, `color:${name}`);
  const setBg = (patch, field) => setAppearance({ background: { ...a.background, ...patch } }, `bg:${field}`);

  const { upload, uploading, error } = useImageUpload((url) => setBg({ type: 'image', image: url }, 'image'), 'background');

  // Move focus into the panel when it opens and back to the toolbar button
  // when it closes, so keyboard users don't get lost.
  const panelRef = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <aside
      ref={panelRef}
      className="design-panel"
      aria-label="Design"
      tabIndex={-1}
      onKeyDown={(e) => {
        // Escape closes the panel (inputs that use Escape themselves stop it first).
        if (e.key === 'Escape' && !e.defaultPrevented) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <header className="design-panel__header">
        <h2>
          <Icon name="palette" /> Design
        </h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close design panel">
          <Icon name="close" />
        </button>
      </header>

      <div className="design-panel__body">
        <section>
          <h3>Presets</h3>
          <PresetPicker />
          <small className="field__help">A preset is a starting point: everything below stays editable. Export a preset to reuse it on another site.</small>
        </section>

        <section>
          <h3>Mode</h3>
          <Segmented
            label="Theme"
            value={settings.theme}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(theme) => actions.updateSettings({ theme }, 'theme')}
          />
          <small className="field__help">Auto follows each visitor’s device setting. Custom colours below apply in both modes.</small>
          {tone && tone !== settings.theme && (
            <small className="field__help field__help--note" role="status">
              {tone === 'light'
                ? 'Your background gradient is light, so the page uses light-mode colours (dark text) to stay readable. Pick darker gradient colours for a dark page.'
                : 'Your background gradient is dark, so the page uses dark-mode colours (light text) to stay readable. Pick lighter gradient colours for a light page.'}
            </small>
          )}
        </section>

        <section>
          <h3>Colours</h3>
          <div className="swatches">
            {ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch ${settings.accent === c ? 'is-active' : ''}`}
                style={{ background: c }}
                onClick={() => actions.updateSettings({ accent: c }, 'accent')}
                aria-label={`Accent ${c}`}
              />
            ))}
            <input type="color" value={settings.accent} onChange={(e) => actions.updateSettings({ accent: e.target.value }, 'accent')} aria-label="Custom accent colour" />
            <HexInput label="Accent" value={settings.accent} onChange={(accent) => actions.updateSettings({ accent }, 'accent')} />
          </div>
          <div className="color-rows">
            <ColorRow label="Background" value={a.colors.bg} fallback={palette.bg} onChange={setColor('bg')} />
            <ColorRow label="Cards" value={a.colors.card} fallback={palette.card} onChange={setColor('card')} />
            <ColorRow label="Text" value={a.colors.text} fallback={palette.text} onChange={setColor('text')} />
            <ColorRow label="Secondary text" value={a.colors.muted} fallback={palette.muted} onChange={setColor('muted')} />
          </div>
        </section>

        <section>
          <h3>Background</h3>
          <Segmented
            label="Background type"
            value={a.background.type}
            options={[
              { value: 'none', label: 'Plain' },
              { value: 'gradient', label: 'Gradient' },
              { value: 'image', label: 'Image' },
            ]}
            onChange={(type) => setBg({ type }, 'type')}
          />

          {a.background.type === 'gradient' && (
            <div className="design-group">
              <div className="color-rows color-rows--inline">
                <ColorRow label="From" value={a.background.color1} fallback="#a1c4fd" onChange={(color1) => setBg({ color1: color1 || '#a1c4fd' }, 'color1')} />
                <ColorRow label="To" value={a.background.color2} fallback="#c2e9fb" onChange={(color2) => setBg({ color2: color2 || '#c2e9fb' }, 'color2')} />
              </div>
              <Slider label="Angle" value={a.background.angle} min={0} max={360} unit="°" onChange={(angle) => setBg({ angle }, 'angle')} />
            </div>
          )}

          {a.background.type === 'image' && (
            <div className="design-group">
              <div className="bg-image">
                {a.background.image && <img src={a.background.image} alt="" />}
                <label className="button button--secondary">
                  <Icon name="upload" size={16} /> {uploading ? 'Uploading…' : a.background.image ? 'Replace image' : 'Upload image'}
                  <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" hidden onChange={(e) => {
                upload(e.target.files[0]);
                e.target.value = ''; // so picking the same file again works
              }} />
                </label>
              </div>
              {error && <p className="field__error">{error}</p>}
              <input className="input" type="url" placeholder="…or paste an image URL" value={a.background.image} onChange={(e) => setBg({ image: e.target.value }, 'imageUrl')} />
              <Slider label="Darken" value={a.background.dim} min={0} max={80} unit="%" onChange={(dim) => setBg({ dim }, 'dim')} />
              <Slider label="Blur" value={a.background.blur} min={0} max={30} unit="px" onChange={(blur) => setBg({ blur }, 'blur')} />
              <small className="field__help">Tip: with a photo, “Glass” cards and a little darkening keep text readable.</small>
            </div>
          )}

          <span className="field__label">Pattern</span>
          <Segmented
            label="Pattern"
            value={a.background.pattern}
            options={[
              { value: 'none', label: 'None' },
              { value: 'dots', label: 'Dots' },
              { value: 'grid', label: 'Grid' },
            ]}
            onChange={(pattern) => setBg({ pattern }, 'pattern')}
          />
        </section>

        <section>
          <h3>Animated background</h3>
          <div className="effect-options" role="group" aria-label="Background effect">
            {[
              { value: 'none', label: 'None' },
              { value: 'aurora', label: 'Aurora' },
              { value: 'flow', label: 'Flow' },
              { value: 'orbs', label: 'Orbs' },
              { value: 'waves', label: 'Waves' },
              { value: 'stars', label: 'Stars' },
              { value: 'fireflies', label: 'Fireflies' },
              { value: 'snow', label: 'Snow' },
              { value: 'ripples', label: 'Ripples' },
              { value: 'grid', label: 'Retro grid' },
            ].map((o) => (
              <button
                key={o.value}
                type="button"
                className={`effect-option effect-option--${o.value} ${a.background.effect === o.value ? 'is-active' : ''}`}
                aria-pressed={a.background.effect === o.value}
                onClick={() => setBg({ effect: o.value }, 'effect')}
              >
                <span className="effect-option__swatch" aria-hidden="true" />
                {o.label}
              </button>
            ))}
          </div>
          {a.background.effect !== 'none' && (
            <div className="design-group">
              <span className="field__label">Speed</span>
              <Segmented
                label="Effect speed"
                value={a.background.speed}
                options={[
                  { value: 'slow', label: 'Slow' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'fast', label: 'Fast' },
                ]}
                onChange={(speed) => setBg({ speed }, 'speed')}
              />
              {['aurora', 'flow'].includes(a.background.effect) && a.background.type !== 'gradient' && (
                <div className="color-rows color-rows--inline">
                  <ColorRow label="Colour 1" value={a.background.color1} fallback="#a1c4fd" onChange={(color1) => setBg({ color1: color1 || '#a1c4fd' }, 'color1')} />
                  <ColorRow label="Colour 2" value={a.background.color2} fallback="#c2e9fb" onChange={(color2) => setBg({ color2: color2 || '#c2e9fb' }, 'color2')} />
                </div>
              )}
              <small className="field__help">Uses your accent colour{['aurora', 'flow'].includes(a.background.effect) ? ' plus these two colours' : ''}. Effects pause automatically for visitors who prefer reduced motion.</small>
            </div>
          )}
        </section>

        <section>
          <h3>Cards</h3>
          <Segmented
            className="segmented--grid3"
            label="Card style"
            value={a.cardStyle}
            options={[
              { value: 'solid', label: 'Solid' },
              { value: 'glass', label: 'Glass' },
              { value: 'crystal', label: 'Crystal' },
              { value: 'outline', label: 'Outline' },
              { value: 'flat', label: 'Flat' },
              { value: 'hairline', label: 'Hairline' },
            ]}
            onChange={(cardStyle) => setAppearance({ cardStyle }, 'cardStyle')}
          />
          {['glass', 'crystal'].includes(a.cardStyle) && (
            <Slider
              label="Clarity"
              value={a.glassClarity}
              min={0}
              max={100}
              unit="%"
              onChange={(glassClarity) => setAppearance({ glassClarity }, 'glassClarity')}
            />
          )}
          {['glass', 'crystal'].includes(a.cardStyle) && <small className="field__help">Lower is frostier, higher is clearer. Works best over a gradient, photo or animated background.</small>}
          <Slider label="Corner radius" value={a.radius} min={0} max={36} unit="px" onChange={(radius) => setAppearance({ radius }, 'radius')} />
        </section>

        <section>
          <h3>Buttons</h3>
          <Segmented
            label="Button shape"
            value={a.buttonShape || 'card'}
            options={[
              { value: 'card', label: 'Like cards' },
              { value: 'pill', label: 'Pill' },
              { value: 'square', label: 'Square' },
            ]}
            onChange={(buttonShape) => setAppearance({ buttonShape }, 'buttonShape')}
          />
          <Segmented
            className="segmented--grid4"
            label="Button fill"
            value={a.buttonFill || 'card'}
            options={[
              { value: 'card', label: 'Card' },
              { value: 'solid', label: 'Solid' },
              { value: 'outline', label: 'Outline' },
              { value: 'soft', label: 'Soft' },
            ]}
            onChange={(buttonFill) => setAppearance({ buttonFill }, 'buttonFill')}
          />
          <small className="field__help">
            For cards one row tall (the “Button” size in a card’s settings), the classic link-in-bio look. Solid and Soft use your accent colour.{' '}
            {buttonCount > 0
              ? `You have ${buttonCount} button-size ${buttonCount === 1 ? 'card' : 'cards'}.`
              : 'You don’t have any button-size cards yet, so these change nothing for now.'}
          </small>
          {convertible.length > 0 && (
            <button type="button" className="button button--secondary button--small buttons-convert" onClick={makeButtons}>
              Turn {buttonCount > 0 ? 'the other ' : ''}
              {convertible.length} link {convertible.length === 1 ? 'card' : 'cards'} into buttons
            </button>
          )}
        </section>

        <section>
          <h3>Font</h3>
          <div className="font-options" role="group" aria-label="Font">
            {[
              { value: 'system', label: 'System' },
              { value: 'serif', label: 'Serif' },
              { value: 'mono', label: 'Mono' },
              { value: 'rounded', label: 'Rounded' },
              { value: 'inter', label: 'Inter' },
              { value: 'grotesk', label: 'Grotesk' },
              { value: 'outfit', label: 'Outfit' },
              { value: 'playfair', label: 'Playfair' },
            ].map((f) => (
              <button
                key={f.value}
                type="button"
                className={`font-option font-option--${f.value} ${a.font === f.value ? 'is-active' : ''}`}
                aria-pressed={a.font === f.value}
                onClick={() => setAppearance({ font: f.value }, 'font')}
              >
                <span>Aa</span>
                {f.label}
              </button>
            ))}
          </div>
          <small className="field__help">The first four use fonts already on visitors’ devices. Inter, Grotesk, Outfit and Playfair are served from your own server (no Google Fonts), around 30–50 KB, downloaded only when chosen.</small>
        </section>

        <section>
          <h3>Icons</h3>
          <div className="icon-options" role="group" aria-label="Icon colours">
            {ICON_STYLES.map((st) => (
              <button
                key={st.value}
                type="button"
                className={`icon-option icon-demo--${st.value} ${a.iconStyle === st.value ? 'is-active' : ''}`}
                aria-pressed={a.iconStyle === st.value}
                title={st.help}
                onClick={() => setAppearance({ iconStyle: st.value }, 'iconStyle')}
              >
                <span className="icon-option__badges" aria-hidden="true">
                  {['instagram', 'github', 'youtube'].map((pl) => (
                    <BrandBadge key={pl} platform={pl} size={22} />
                  ))}
                </span>
                {st.label}
              </button>
            ))}
          </div>
          <small className="field__help">
            {ICON_STYLES.find((st) => st.value === a.iconStyle)?.help} For the logos on your cards and in the social icons row.
          </small>
          <small className="field__help field__help--legal">
            Logos and brand names belong to their owners and are shown only to link to your profiles on those services. Some brands ask that their logo appear only
            in its official colours, or in plain black or white: check their brand guidelines before recolouring if that matters to you.
          </small>
        </section>

        <section>
          <h3>Avatar</h3>
          <div className="avatar-options" role="group" aria-label="Avatar animation">
            {AVATAR_EFFECTS.map((fx) => (
              <button
                key={fx.value}
                type="button"
                className={`avatar-option ${a.avatarEffect === fx.value ? 'is-active' : ''}`}
                aria-pressed={a.avatarEffect === fx.value}
                title={fx.help}
                onClick={() => setAppearance({ avatarEffect: fx.value }, 'avatarEffect')}
              >
                <span className={`avatar-demo avatar-demo--${fx.value}`} aria-hidden="true">
                  <span>
                    <Avatar profile={page.profile} size={48} />
                  </span>
                </span>
                {fx.label}
              </button>
            ))}
          </div>
          <small className="field__help">{AVATAR_EFFECTS.find((fx) => fx.value === a.avatarEffect)?.help} Visitors who turned on “reduce motion” see the photo still.</small>
          <Segmented
            label="Avatar colours"
            className="avatar-tone"
            value={a.avatarTone}
            options={[
              { value: 'color', label: 'Colour' },
              { value: 'mono', label: 'Black & white' },
            ]}
            onChange={(avatarTone) => setAppearance({ avatarTone }, 'avatarTone')}
          />
        </section>

        <section>
          <h3>Animation</h3>
          <Segmented
            label="Animation"
            value={a.animation}
            options={[
              { value: 'none', label: 'None' },
              { value: 'subtle', label: 'Subtle' },
              { value: 'lively', label: 'Lively' },
            ]}
            onChange={(animation) => setAppearance({ animation }, 'animation')}
          />
          <small className="field__help">
            Subtle: tiles fade in and lift on hover. Lively: adds a gentle tilt and a slowly drifting gradient. Visitors who turned on “reduce motion” never see animations.
          </small>
        </section>
      </div>
    </aside>
  );
}
