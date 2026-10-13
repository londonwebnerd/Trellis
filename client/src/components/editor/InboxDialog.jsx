/**
 * Inbox: messages sent with contact-form cards (stored on your server in
 * DATA_DIR/inbox.json). Read, reply by email, delete, or export as CSV.
 */
import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { Icon } from '../Icons.jsx';
import Modal from './Modal.jsx';

const when = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

const csvCell = (v) => {
  const s = String(v ?? '');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

function exportCsv(messages) {
  const rows = [['date', 'name', 'email', 'phone', 'message'], ...messages.map((m) => [m.at, m.name, m.email, m.phone, m.message])];
  const blob = new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `trellis-messages-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** @param {{ open: boolean, onClose: () => void, onCountChange: (n: number) => void }} props */
export default function InboxDialog({ open, onClose, onCountChange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [notifications, setNotifications] = useState(null);

  const apply = (d) => {
    setData(d);
    if (typeof d.notifications === 'boolean') setNotifications(d.notifications);
    onCountChange?.(d.unread);
  };

  // Unread count for the toolbar badge, on load and every few minutes.
  useEffect(() => {
    const load = () => api.getInbox().then(apply).catch(() => {});
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) {
      setConfirmClear(false);
      return;
    }
    setError(null);
    api
      .getInbox()
      .then(apply)
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const run = async (fn) => {
    setError(null);
    try {
      apply(await fn());
    } catch (err) {
      setError(err.message);
    }
  };

  const toggle = (m) => {
    setOpenId(openId === m.id ? null : m.id);
    if (!m.read) run(() => api.markMessage(m.id, true));
  };

  const messages = data?.messages || [];
  return (
    <Modal open={open} onClose={onClose} title="Inbox" className="modal--wide">
      {error && <p className="field__error">{error}</p>}
      {!data && !error && <p className="field__help">Loading…</p>}
      {data && messages.length === 0 && (
        <p className="field__help">No messages yet. Add a “Contact form” card to your page and visitors’ messages arrive here.</p>
      )}
      {messages.length > 0 && (
        <ul className="inbox">
          {messages.map((m) => (
            <li key={m.id} className={`inbox__item ${m.read ? '' : 'is-unread'} ${openId === m.id ? 'is-open' : ''}`}>
              <button type="button" className="inbox__summary" onClick={() => toggle(m)} aria-expanded={openId === m.id}>
                {!m.read && <span className="inbox__dot" aria-label="Unread" />}
                <span className="inbox__from">
                  <b>{m.name}</b>
                  <small>{when(m.at)}</small>
                </span>
                <span className="inbox__preview">{m.message}</span>
              </button>
              {openId === m.id && (
                <div className="inbox__body">
                  <p className="inbox__meta">
                    <a href={`mailto:${m.email}?subject=${encodeURIComponent('Re: your message')}`}>{m.email}</a>
                    {m.phone && (
                      <>
                        {' · '}
                        <a href={`tel:${m.phone.replace(/[^\d+]/g, '')}`}>{m.phone}</a>
                      </>
                    )}
                  </p>
                  <p className="inbox__message" dir="auto">
                    {m.message}
                  </p>
                  <div className="button-row">
                    <a className="button button--primary" href={`mailto:${m.email}?subject=${encodeURIComponent('Re: your message')}`}>
                      <Icon name="mail" size={16} /> Reply
                    </a>
                    <button type="button" className="button button--secondary" onClick={() => run(() => api.markMessage(m.id, false))}>
                      Mark unread
                    </button>
                    <button type="button" className="button button--danger" onClick={() => run(() => api.deleteMessage(m.id))}>
                      <Icon name="trash" size={16} /> Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {notifications !== null && (
        <p className="field__help">
          {notifications
            ? 'You also get an email for each new message.'
            : 'Want an email for each new message? Set SMTP_URL and NOTIFY_EMAIL in the server’s .env (see “Contact form and inbox” in the docs).'}
        </p>
      )}
      {messages.length > 0 && (
        <div className="stats-actions">
          <button type="button" className="button button--secondary" onClick={() => exportCsv(messages)}>
            Export CSV
          </button>
          {confirmClear ? (
            <span className="stats-confirm">
              Delete all {messages.length} messages?
              <button type="button" className="button button--danger" onClick={() => run(() => api.clearInbox()).then(() => setConfirmClear(false))}>
                Delete all
              </button>
              <button type="button" className="button button--secondary" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" className="button button--secondary" onClick={() => setConfirmClear(true)}>
              Delete all
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
