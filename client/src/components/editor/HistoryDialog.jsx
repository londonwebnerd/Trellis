/**
 * Version history: every publish and an autosave every ~10 minutes, kept on
 * the server (server/src/lib/versions.js). Restoring loads a version into
 * the editor like any other change: it can be undone, and visitors only see
 * it after you publish.
 */
import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useEditor } from './EditorContext.js';
import Modal from './Modal.jsx';

const KIND_LABEL = { published: 'Published', autosave: 'Autosave', restore: 'Before a restore' };

/** "Today, 14:05" / "Yesterday, 09:30" / "3 Oct 2026, 18:12" */
function when(iso) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const yesterday = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}, ${time}`;
}

/** @param {{ open: boolean, onClose: () => void, onRestored: (label: string) => void }} props */
export default function HistoryDialog({ open, onClose, onRestored }) {
  const { actions } = useEditor();
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!open) return;
    setVersions(null);
    setError(null);
    api
      .listVersions()
      .then((r) => setVersions(r.versions))
      .catch((err) => setError(err.message));
  }, [open]);

  const restore = async (v) => {
    setBusy(v.id);
    setError(null);
    try {
      const { page } = await api.getVersion(v.id, { forRestore: true });
      actions.checkpoint();
      actions.replacePage(page);
      actions.checkpoint();
      onRestored(`${KIND_LABEL[v.kind]} version from ${when(v.createdAt)}`);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const shown = (versions || []).filter((v) => filter === 'all' || (filter === 'published' ? v.kind === 'published' : v.kind !== 'published'));

  return (
    <Modal open={open} onClose={onClose} title="Version history" className="modal--history">
      <p className="field__help">
        Restoring puts that version in the editor. Your current version is kept in the history, you can undo the restore, and visitors only see it once you
        publish.
      </p>
      <div className="segmented history__filter" role="group" aria-label="Show">
        {[
          ['all', 'All'],
          ['published', 'Published'],
          ['autosave', 'Autosaves'],
        ].map(([value, label]) => (
          <button key={value} type="button" className={filter === value ? 'is-active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {label}
          </button>
        ))}
      </div>
      {error && <p className="field__error">{error}</p>}
      {!versions && !error && <p className="field__help">Loading…</p>}
      {versions && shown.length === 0 && <p className="field__help">No versions yet. They appear here as you edit and publish.</p>}
      {shown.length > 0 && (
        <ol className="history">
          {shown.map((v) => (
            <li key={v.id} className={`history__item history__item--${v.kind}`}>
              <span className="history__dot" aria-hidden="true" />
              <span className="history__text">
                <b>{when(v.createdAt)}</b>
                <small>
                  {KIND_LABEL[v.kind]}
                  {v.tiles != null && ` · ${v.tiles} ${v.tiles === 1 ? 'card' : 'cards'}`}
                </small>
              </span>
              <button type="button" className="button button--secondary" onClick={() => restore(v)} disabled={busy !== null}>
                {busy === v.id ? 'Restoring…' : 'Restore'}
              </button>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
