/**
 * Dialog for editing one tile. The form is generated from the tile type's
 * `fields` in lib/tileRegistry.js, and every change is applied live (you see
 * the tile update behind the dialog) and autosaved.
 */
import { useCallback } from 'react';
import { useImageUpload } from '../../hooks/useImageUpload.js';
import { clampSize, MAX_H, MAX_W, SIZE_PRESETS } from '../../lib/layout.js';
import { plainTextToHtml } from '../../lib/richText.js';
import { TILE_TYPES } from '../../lib/tileRegistry.js';
import { BrandBadge, Icon } from '../Icons.jsx';
import { useEditor } from './EditorContext.js';
import LinksField from './LinksField.jsx';
import Modal from './Modal.jsx';
import RichTextEditor from './RichTextEditor.jsx';
import CardOptions from './CardOptions.jsx';
import { AmountsField, DateTimeField, FileField, GalleryField, GeocodeField } from './CardFields.jsx';

/** Image field: preview + upload button + manual URL. */
export function ImageField({ value, onChange, id, purpose = 'tile' }) {
  const onUploaded = useCallback((url) => onChange(url), [onChange]);
  const { upload, uploading, error, dialog } = useImageUpload(onUploaded, purpose);
  return (
    <div className="image-field">
      {value && <img src={value} alt="" className="image-field__preview" />}
      <label className="button button--secondary">
        <Icon name="upload" size={16} /> {uploading ? 'Uploading…' : 'Upload image'}
        <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" hidden onChange={(e) => {
                upload(e.target.files[0]);
                e.target.value = ''; // so picking the same file again works
              }} />
      </label>
      <input id={id} type="url" className="input" placeholder="…or paste an image URL" value={value} onChange={(e) => onChange(e.target.value)} />
      {error && <p className="field__error">{error}</p>}
      {dialog}
    </div>
  );
}

/**
 * One form field, chosen by `field.kind`.
 * @param {{ field: object, value: any, onChange: (v: any) => void }} props
 */
/**
 * Longest value the server keeps for each field (server/src/lib/validate.js),
 * so the editor can't show text that would be cut off when saved.
 */
const FIELD_LIMITS = { title: 80, subtitle: 140, text: 80, caption: 140, subject: 150, message: 300, phone: 24, email: 254, handle: 120, username: 120, url: 2048, src: 2048 };

function Field({ field, value, onChange, data, onPatch }) {
  const id = `field-${field.name}`;
  let control;
  switch (field.kind) {
    case 'datetime':
      control = <DateTimeField id={id} value={value} onChange={onChange} />;
      break;
    case 'gallery':
      control = <GalleryField value={value} onChange={onChange} />;
      break;
    case 'amounts':
      control = <AmountsField value={value} onChange={onChange} />;
      break;
    case 'file':
      control = <FileField value={value} data={data} onPatch={onPatch} />;
      break;
    case 'geocode':
      control = <GeocodeField id={id} value={value} data={data} onPatch={onPatch} placeholder={field.placeholder} />;
      break;
    case 'note':
      return <p className="field__note">{field.text}</p>;
    case 'richtext':
      control = <RichTextEditor id={id} value={value} onChange={onChange} placeholder={field.placeholder} />;
      break;
    case 'links':
      control = <LinksField value={value} onChange={onChange} />;
      break;
    case 'textarea':
      control = <textarea id={id} className="input" rows={5} placeholder={field.placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'checkbox':
      return (
        <label className="field field--checkbox">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          <span>
            {field.label}
            {field.help && <small>{field.help}</small>}
          </span>
        </label>
      );
    case 'select':
      control = (
        <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(field.number ? Number(e.target.value) : e.target.value)}>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'urllist':
      control = (
        <textarea
          id={id}
          className="input"
          rows={4}
          placeholder={field.placeholder}
          value={(value || []).join('\n')}
          onChange={(e) => onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
        />
      );
      break;
    case 'image':
      control = <ImageField id={id} value={value || ''} onChange={onChange} purpose={field.purpose} />;
      break;
    default:
      control = (
        <div className={field.prefix ? 'input-group' : undefined}>
          {field.prefix && <span className="input-group__prefix">{field.prefix}</span>}
          <input
            id={id}
            className="input"
            type={field.kind === 'url' ? 'url' : field.kind === 'email' ? 'email' : 'text'}
            placeholder={field.placeholder}
            value={value ?? ''}
            maxLength={field.maxLength || FIELD_LIMITS[field.name]}
            required={field.required}
            onChange={(e) => onChange(field.prefix ? e.target.value.replace(/^@/, '') : e.target.value)}
          />
        </div>
      );
  }
  return (
    <div className="field">
      {['links', 'gallery', 'amounts', 'file'].includes(field.kind) ? <span className="field__label">{field.label}</span> : <label htmlFor={id}>{field.label}</label>}
      {control}
      {field.help && <small className="field__help">{field.help}</small>}
    </div>
  );
}

/** − value + stepper. */
function Stepper({ label, value, min, max, onChange }) {
  return (
    <div className="stepper">
      <span className="stepper__label">{label}</span>
      <button type="button" className="icon-button" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Decrease ${label}`}>
        <Icon name="minus" size={16} />
      </button>
      <span className="stepper__value" aria-live="polite">
        {value}
      </span>
      <button type="button" className="icon-button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`Increase ${label}`}>
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}

/** Size presets plus exact width/height steppers. */
function SizeControls({ tile, limits = {}, onResize }) {
  const minW = limits.minW ?? 1;
  const maxW = limits.maxW ?? MAX_W;
  const minH = limits.minH ?? 1;
  const maxH = limits.maxH ?? MAX_H;
  if (minW === maxW && minH === maxH) return null;
  const presets = SIZE_PRESETS.filter((p) => {
    const c = clampSize(limits, p.w, p.h);
    return c.w === p.w && c.h === p.h;
  });
  return (
    <div className="field">
      <span className="field__label">Size</span>
      {presets.length > 1 && (
        <div className="segmented" role="group" aria-label="Size presets">
          {presets.map((p) => {
            const active = tile.w === p.w && tile.h === p.h;
            return (
              <button key={p.key} type="button" className={active ? 'is-active' : ''} aria-pressed={active} onClick={() => onResize(p.w, p.h)}>
                <Icon name={`size-${p.key}`} size={16} /> {p.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="size-steppers">
        {minW !== maxW && <Stepper label="Width" value={tile.w} min={minW} max={maxW} onChange={(w) => onResize(w, tile.h)} />}
        {minH !== maxH && <Stepper label="Height" value={tile.h} min={minH} max={maxH} onChange={(h) => onResize(tile.w, h)} />}
      </div>
      <small className="field__help">Width is in columns (4 on desktop, 2 on phones). Height 1 is a slim button, 2 is square. You can also drag a tile’s corner.</small>
    </div>
  );
}

/**
 * @param {{ tileId: string | null, onClose: () => void, onDuplicated?: (newId: string) => void }} props
 */
export default function TileEditor({ tileId, onClose, onDuplicated }) {
  const { page, actions } = useEditor();
  const tile = page.tiles.find((t) => t.id === tileId);
  const def = tile && TILE_TYPES[tile.type];

  const close = () => {
    actions.checkpoint();
    onClose();
  };

  if (!tile || !def) return null;

  const title = (
    <span className="modal__title-with-icon">
      {def.icon ? <BrandBadge platform={def.icon} size={28} /> : <span className="ui-badge"><Icon name={def.uiIcon} size={16} /></span>}
      {def.label}
    </span>
  );

  return (
    <Modal
      open
      onClose={close}
      title={title}
      className={def.fields.some((f) => ['richtext', 'links', 'gallery', 'amounts'].includes(f.kind)) ? 'modal--wide' : ''}
      footer={
        <>
          <button
            type="button"
            className="button button--danger"
            onClick={() => {
              actions.removeTile(tile.id);
              onClose();
            }}
          >
            <Icon name="trash" size={16} /> Delete
          </button>
          <span className="button-row">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                actions.checkpoint();
                onDuplicated?.(actions.duplicateTile(tile.id));
              }}
            >
              <Icon name="duplicate" size={16} /> Duplicate
            </button>
            <button type="button" className="button button--primary" onClick={close}>
              Done
            </button>
          </span>
        </>
      }
    >
      <form className="form" onSubmit={(e) => (e.preventDefault(), close())}>
        {def.fields
          .filter((f) => !f.showIf || f.showIf(tile.data))
          .map((field) => (
            <Field
              key={field.name}
              field={field}
              value={field.kind === 'richtext' ? tile.data.html || plainTextToHtml(tile.data.text) : tile.data[field.name]}
              // Rich text replaces any legacy plain `text` once edited.
              onChange={(v) => actions.updateTile(tile.id, field.kind === 'richtext' ? { html: v, text: '' } : { [field.name]: v }, field.name)}
              data={tile.data}
              onPatch={(patch) => actions.updateTile(tile.id, patch, field.name)}
            />
          ))}

        <SizeControls tile={tile} limits={def.layout} onResize={(w, h) => actions.resizeTile(tile.id, w, h)} />

        <CardOptions tile={tile} />
      </form>
    </Modal>
  );
}
