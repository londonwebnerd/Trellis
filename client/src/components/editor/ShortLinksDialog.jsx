/**
 * Short links: yoursite.com/cv → anywhere, with a visit count. They work as
 * soon as they're saved (no need to publish).
 */
import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { Icon } from '../Icons.jsx';
import Modal from './Modal.jsx';

const origin = () => window.location.origin;
const host = () => window.location.host;
const pretty = (url) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

function LinkForm({ initial, onSave, onCancel, submitLabel }) {
  const [slug, setSlug] = useState(initial?.slug || '');
  const [url, setUrl] = useState(initial?.url || '');
  const [note, setNote] = useState(initial?.note || '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave({ slug, url, note });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <form className="shortlink-form" onSubmit={submit}>
      <label className="field">
        <span className="field__label">Short address</span>
        <span className="shortlink-form__slug">
          <span className="shortlink-form__prefix" aria-hidden="true">
            {host()}/
          </span>
          <input
            className="input"
            aria-label={`Short address, after ${host()}/`}
            autoCapitalize="none"
            spellCheck={false}
            maxLength={64}
            placeholder="cv"
            autoFocus={!initial}
            value={slug}
            onChange={(e) => setSlug(e.target.value.replace(/\s/g, '-').toLowerCase())}
          />
        </span>
      </label>
      <label className="field">
        <span className="field__label">Goes to</span>
        <input className="input" type="text" inputMode="url" autoCapitalize="none" spellCheck={false} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">Note (only you see it)</span>
        <input className="input" maxLength={200} placeholder="e.g. printed on business cards" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && <p className="field__error">{error}</p>}
      <div className="button-row">
        {onCancel && (
          <button type="button" className="button button--secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="button button--primary" disabled={busy || !slug.trim() || !url.trim()}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

/** @param {{ open: boolean, onClose: () => void }} props */
export default function ShortLinksDialog({ open, onClose }) {
  const [links, setLinks] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // slug, or 'new'
  const [copied, setCopied] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    if (!open) {
      setEditing(null);
      setConfirmDelete(null);
      return;
    }
    setError(null);
    api.listShortLinks().then(
      (r) => setLinks(r.links),
      (err) => setError(err.message),
    );
  }, [open]);

  const copy = (slug) =>
    navigator.clipboard?.writeText(`${origin()}/${slug}`).then(
      () => {
        setCopied(slug);
        setTimeout(() => setCopied((c) => (c === slug ? null : c)), 1500);
      },
      () => {},
    );

  return (
    <Modal open={open} onClose={onClose} title="Short links" className="modal--wide">
      <p className="field__help">
        Short, memorable addresses on your own domain, like <b>{host()}/cv</b>, that send people anywhere: a CV, a booking page, a video. Change where one goes at any time; it
        works straight away, no need to publish. Visits are counted in Statistics too.
      </p>
      {error && <p className="field__error">{error}</p>}
      {links === null && !error && <p className="field__help">Loading…</p>}
      {links && (
        <>
          {links.length > 0 && (
            <ul className="shortlinks">
              {links.map((l) =>
                editing === l.slug ? (
                  <li key={l.slug} className="shortlinks__item is-editing">
                    <LinkForm
                      initial={l}
                      submitLabel="Save"
                      onCancel={() => setEditing(null)}
                      onSave={async (patch) => {
                        const res = await api.updateShortLink(l.slug, patch);
                        setLinks(res.links);
                        setEditing(null);
                      }}
                    />
                  </li>
                ) : (
                  <li key={l.slug} className="shortlinks__item">
                    <span className="shortlinks__main">
                      <a href={`${origin()}/${l.slug}`} target="_blank" rel="noopener noreferrer" className="shortlinks__slug">
                        {host()}/{l.slug}
                      </a>
                      <small className="shortlinks__target" title={l.url}>
                        → {pretty(l.url)}
                      </small>
                      {l.note && <small className="shortlinks__note">{l.note}</small>}
                    </span>
                    <span className="shortlinks__count" title={l.lastClick ? `Last visit: ${new Date(l.lastClick).toLocaleString()}` : 'No visits yet'}>
                      <b>{l.clicks}</b> {l.clicks === 1 ? 'visit' : 'visits'}
                    </span>
                    <span className="shortlinks__actions">
                      <button type="button" className="icon-button" aria-label={`Copy ${host()}/${l.slug}`} title="Copy link" onClick={() => copy(l.slug)}>
                        <Icon name={copied === l.slug ? 'check' : 'copy'} size={16} />
                      </button>
                      <button type="button" className="icon-button" aria-label={`Edit /${l.slug}`} title="Edit" onClick={() => setEditing(l.slug)}>
                        <Icon name="pencil" size={16} />
                      </button>
                      {confirmDelete === l.slug ? (
                        <button
                          type="button"
                          className="button button--danger button--small"
                          onClick={async () => {
                            try {
                              setLinks((await api.deleteShortLink(l.slug)).links);
                            } catch (err) {
                              setError(err.message);
                            }
                            setConfirmDelete(null);
                          }}
                        >
                          Delete
                        </button>
                      ) : (
                        <button type="button" className="icon-button" aria-label={`Delete /${l.slug}`} title="Delete" onClick={() => setConfirmDelete(l.slug)}>
                          <Icon name="trash" size={16} />
                        </button>
                      )}
                    </span>
                  </li>
                ),
              )}
            </ul>
          )}
          {editing === 'new' ? (
            <div className="shortlinks__new">
              <LinkForm
                submitLabel="Add short link"
                onCancel={() => setEditing(null)}
                onSave={async (link) => {
                  const res = await api.addShortLink(link);
                  setLinks(res.links);
                  setEditing(null);
                }}
              />
            </div>
          ) : (
            <button type="button" className="button button--primary" onClick={() => setEditing('new')}>
              <Icon name="plus" size={16} /> New short link
            </button>
          )}
        </>
      )}
    </Modal>
  );
}
