/**
 * Shown when the page was saved in another tab or on another device since
 * this tab last saved. Nothing more is saved until one version is chosen:
 * the other one (this tab's stays one Undo away) or this tab's (replacing
 * the other). Closing it just postpones the choice; the toolbar's
 * "Edited elsewhere" button brings it back.
 */
import { Icon } from '../Icons.jsx';
import Modal from './Modal.jsx';

const when = (iso) => {
  const t = Date.parse(iso);
  if (!t) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

/**
 * @param {{ conflict: { page: any, revision: string } | null, open: boolean, onClose: () => void, onKeepTheirs: () => void, onKeepMine: () => void }} props
 */
export default function ConflictDialog({ conflict, open, onClose, onKeepTheirs, onKeepMine }) {
  return (
    <Modal
      open={Boolean(conflict) && open}
      onClose={onClose}
      title="Edited in another tab"
      footer={
        <>
          <button type="button" className="button button--secondary" onClick={onKeepMine}>
            Keep this tab’s version
          </button>
          <button type="button" className="button button--primary" onClick={onKeepTheirs}>
            <Icon name="download" size={16} /> Load the other version
          </button>
        </>
      }
    >
      <p>
        Your page was saved somewhere else {conflict ? when(conflict.revision) : ''}: in another browser tab, or on another device. To avoid overwriting those changes,
        this tab has stopped saving.
      </p>
      <ul className="conflict-options">
        <li>
          <b>Load the other version</b> shows what was saved there. Your edits in this tab aren’t lost: Undo brings them back.
        </li>
        <li>
          <b>Keep this tab’s version</b> saves what you see here, replacing the other one. (It’s still in Version history.)
        </li>
      </ul>
      <p className="field__help">Tip: edit in one tab at a time.</p>
    </Modal>
  );
}
