/**
 * Editor form fields for the newer card types: photo lists (gallery), tip
 * amounts, PDF upload, address search (map) and date + time.
 */
import { useCallback, useId, useRef, useState } from "react";
import { api } from "../../api/client.js";
import { useImageUpload } from "../../hooks/useImageUpload.js";
import { Icon } from "../Icons.jsx";

/* ------------------------------ Date + time ----------------------------- */

export function toLocalInput(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DateTimeField({ id, value, onChange }) {
  return (
    <div className="input-row">
      <input
        id={id}
        className="input"
        type="datetime-local"
        value={toLocalInput(value)}
        onChange={(e) =>
          onChange(e.target.value ? new Date(e.target.value).toISOString() : "")
        }
      />
      {value && (
        <button
          type="button"
          className="icon-button"
          onClick={() => onChange("")}
          aria-label="Clear date"
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}

/* -------------------------------- Gallery ------------------------------- */

const MAX_PHOTOS = 20;

export function GalleryField({ value = [], onChange }) {
  // Latest list, so several uploads in a row each add their photo.
  const latest = useRef(value);
  latest.current = value;
  const onUploaded = useCallback(
    (src) => {
      latest.current = [...latest.current, { src, caption: "", url: "" }].slice(
        0,
        MAX_PHOTOS,
      );
      onChange(latest.current);
    },
    [onChange],
  );
  const { upload, uploading, error, dialog } = useImageUpload(
    onUploaded,
    "tile",
  );
  const [queue, setQueue] = useState(0);
  const update = (i, patch) =>
    onChange(value.map((im, j) => (j === i ? { ...im, ...patch } : im)));
  const move = (i, by) => {
    const next = [...value];
    const [item] = next.splice(i, 1);
    next.splice(i + by, 0, item);
    onChange(next);
  };
  // Several files: each goes through the crop dialog in turn.
  const addFiles = async (files) => {
    const list = [...files].slice(0, MAX_PHOTOS - value.length);
    setQueue(list.length);
    for (const f of list) {
      await upload(f);
      setQueue((q) => q - 1);
    }
  };

  return (
    <div className="gallery-field">
      {value.length > 0 && (
        <ol className="gallery-field__list">
          {value.map((im, i) => (
            <li key={`${im.src}-${i}`}>
              <img src={im.src} alt="" />
              <span className="gallery-field__inputs">
                <input
                  className="input"
                  placeholder="Caption (optional)"
                  maxLength={140}
                  value={im.caption}
                  onChange={(e) => update(i, { caption: e.target.value })}
                  aria-label={`Caption for photo ${i + 1}`}
                />
                <input
                  className="input"
                  type="url"
                  placeholder="Link (optional)"
                  value={im.url}
                  onChange={(e) => update(i, { url: e.target.value })}
                  aria-label={`Link for photo ${i + 1}`}
                />
              </span>
              <span className="gallery-field__buttons">
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Move up"
                >
                  <Icon name="chevron-up" size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => move(i, 1)}
                  disabled={i === value.length - 1}
                  aria-label="Move down"
                >
                  <Icon name="chevron-down" size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                  aria-label="Remove photo"
                >
                  <Icon name="trash" size={16} />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      {value.length < MAX_PHOTOS && (
        <label className="button button--secondary">
          <Icon name="upload" size={16} />{" "}
          {uploading || queue > 0 ? "Uploading…" : "Add photos"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      )}
      {error && <p className="field__error">{error}</p>}
      {dialog}
    </div>
  );
}

/* -------------------------------- Amounts ------------------------------- */

export function AmountsField({ value = [], onChange }) {
  const update = (i, patch) =>
    onChange(value.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  return (
    <div className="amounts-field">
      {value.map((a, i) => (
        <div key={i} className="amounts-field__row">
          <input
            className="input amounts-field__label"
            placeholder="£3"
            maxLength={20}
            value={a.label}
            onChange={(e) => update(i, { label: e.target.value })}
            aria-label={`Amount ${i + 1} label`}
          />
          <input
            className="input"
            type="url"
            placeholder="https://buy.stripe.com/… or https://paypal.me/you/3"
            value={a.url}
            onChange={(e) => update(i, { url: e.target.value })}
            aria-label={`Amount ${i + 1} payment link`}
          />
          <button
            type="button"
            className="icon-button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            aria-label="Remove amount"
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      ))}
      {value.length < 6 && (
        <button
          type="button"
          className="button button--secondary"
          onClick={() => onChange([...value, { label: "", url: "" }])}
        >
          <Icon name="plus" size={16} /> Add amount
        </button>
      )}
    </div>
  );
}

/* --------------------------------- File --------------------------------- */

const MAX_PDF = 10 * 1024 * 1024;

export function FileField({ value, data, onPatch }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const pick = async (file) => {
    if (!file) return;
    setError(null);
    if (file.type && file.type !== "application/pdf")
      return setError("Please choose a PDF file.");
    if (file.size > MAX_PDF) return setError("That PDF is larger than 10 MB.");
    setBusy(true);
    try {
      const { url, size } = await api.uploadFile(file);
      onPatch({ src: url, size, fileName: file.name.slice(0, 120) });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="file-field">
      {value && (
        <p className="file-field__current">
          <Icon name="file" size={16} /> {data.fileName || value}
        </p>
      )}
      <label className="button button--secondary">
        <Icon name="upload" size={16} />{" "}
        {busy ? "Uploading…" : value ? "Replace PDF" : "Upload PDF"}
        <input
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => {
            pick(e.target.files[0]);
            e.target.value = "";
          }}
        />
      </label>
      {value && (
        <label className="field file-field__name">
          <span className="field__label">Download file name</span>
          <input
            className="input"
            maxLength={120}
            value={data.fileName}
            onChange={(e) => onPatch({ fileName: e.target.value })}
          />
        </label>
      )}
      {error && <p className="field__error">{error}</p>}
    </div>
  );
}

/* ------------------------------- Geocode -------------------------------- */

export function GeocodeField({ id, value, data, onPatch, placeholder }) {
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const listId = useId();
  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      const { results: found } = await api.geocode(value);
      setResults(found);
      if (found.length === 1) choose(found[0]);
      if (!found.length)
        setError("Nothing found. Try adding the city or country.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const choose = (r) => {
    onPatch({ lat: r.lat, lon: r.lon });
    setResults(null);
  };
  const located = Number.isFinite(data.lat) && Number.isFinite(data.lon);
  return (
    <div className="geocode-field">
      <div className="input-row">
        <input
          id={id}
          className="input"
          placeholder={placeholder}
          maxLength={200}
          value={value || ""}
          onChange={(e) => onPatch({ address: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          aria-describedby={listId}
        />
        <button
          type="button"
          className="button button--secondary"
          onClick={search}
          disabled={busy || (value || "").trim().length < 3}
        >
          {busy ? "Searching…" : "Find"}
        </button>
      </div>
      <div id={listId}>
        {results && results.length > 1 && (
          <ul className="geocode-field__results" aria-label="Places found">
            {results.map((r) => (
              <li key={`${r.lat},${r.lon}`}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => choose(r)}
                >
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {located && !results && (
          <small className="field__help">
            <Icon name="check" size={12} /> Pinned at {data.lat.toFixed(4)},{" "}
            {data.lon.toFixed(4)}. Search again after changing the address.
          </small>
        )}
        {!located && !results && !error && (
          <small className="field__help">
            Press Find to place the pin. Search by OpenStreetMap (Nominatim).
          </small>
        )}
        {error && <p className="field__error">{error}</p>}
      </div>
    </div>
  );
}
