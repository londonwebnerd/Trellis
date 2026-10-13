/**
 * Locked cards on the live page (Linktree-style):
 *
 *   sensitive  "This may contain sensitive content" + Show
 *   age        "You must be N or older" + I'm N or older
 *   code       a code field; the server checks it and sends the card's
 *              content (POST /api/unlock/:id), which isn't on the page before
 *
 * The overlay covers the card until the visitor gets past it. Sensitive and
 * age gates are a courtesy (nothing is verified); code locks are enforced.
 */
import { useId, useState } from 'react';
import { Icon } from './Icons.jsx';

export default function LockGate({ tile, onUnlocked }) {
  const { lock } = tile;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputId = useId();

  if (lock.type === 'sensitive' || lock.type === 'age') {
    const age = lock.type === 'age';
    return (
      <div className="lock-gate tile-interactive" role="group" aria-label={age ? 'Age-restricted card' : 'Sensitive content'}>
        <Icon name={age ? 'lock' : 'alert'} size={20} />
        <p>{age ? `You must be ${lock.age} or older to view this.` : 'This may contain sensitive content.'}</p>
        <button type="button" className="lock-gate__button" onClick={() => onUnlocked(null)}>
          {age ? `I’m ${lock.age} or older` : 'Show'}
        </button>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    const code = new FormData(e.currentTarget).get('code');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/unlock/${encodeURIComponent(tile.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'That code isn’t right.');
      onUnlocked(body.data);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="lock-gate lock-gate--code tile-interactive" onSubmit={submit}>
      <Icon name="lock" size={20} />
      <label htmlFor={inputId} dir="auto">
        {tile.data.title ? <b>{tile.data.title}</b> : null}
        <span>{lock.hint || 'Enter the code to unlock'}</span>
      </label>
      <span className="lock-gate__row">
        <input id={inputId} name="code" required maxLength={64} autoComplete="off" aria-invalid={error ? true : undefined} placeholder="Code" />
        <button type="submit" className="lock-gate__button" disabled={busy}>
          {busy ? '…' : 'Unlock'}
        </button>
      </span>
      {error && (
        <small className="lock-gate__error" role="alert">
          {error}
        </small>
      )}
    </form>
  );
}
