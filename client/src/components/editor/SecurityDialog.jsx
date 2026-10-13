/**
 * Sign-in & security: two-step sign-in with an authenticator app, the
 * devices that are signed in (sign out one, or all others), and recent
 * sign-in attempts.
 */
import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { Icon } from '../Icons.jsx';
import { qrSvg } from '../ShareButton.jsx';
import Modal from './Modal.jsx';

const when = (iso) => {
  const t = Date.parse(iso);
  if (!t) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  return new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

/** "Safari on iPhone" from a User-Agent (coarse on purpose). */
export function deviceName(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\/|FxiOS/.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /curl|node|python/i.test(ua) ? 'A script' : 'A browser';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

const STEP_TEXT = { password: 'Wrong password', code: 'Wrong code' };

/** Offer the recovery codes as a text file. */
function downloadCodes(codes) {
  const text = `Trellis recovery codes (${window.location.host})\nEach code works once. Keep them somewhere safe.\n\n${codes.join('\n')}\n`;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: 'trellis-recovery-codes.txt' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function RecoveryCodes({ codes, onDone }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="security-codes">
      <p>
        <b>Save these recovery codes.</b> If you lose your phone, each one lets you sign in once. They won’t be shown again.
      </p>
      <ol className="security-codes__list">
        {codes.map((c) => (
          <li key={c}>
            <code>{c}</code>
          </li>
        ))}
      </ol>
      <div className="button-row">
        <button type="button" className="button button--secondary" onClick={() => downloadCodes(codes)}>
          <Icon name="download" size={16} /> Download
        </button>
        <button
          type="button"
          className="button button--secondary"
          onClick={() =>
            navigator.clipboard?.writeText(codes.join('\n')).then(
              () => setCopied(true),
              () => {},
            )
          }
        >
          <Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="button button--primary" onClick={onDone}>
          I’ve saved them
        </button>
      </div>
    </div>
  );
}

/** Turning two-step sign-in on: scan, then confirm with a code and the password. */
function SetupTwoFactor({ onEnabled, onCancel }) {
  const [setup, setSetup] = useState(null);
  const [svg, setSvg] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .startTwoFactor()
      .then((s) => {
        setSetup(s);
        return qrSvg(s.uri, { margin: 2 }).then(setSvg);
      })
      .catch((err) => setError(err.message));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onEnabled(await api.enableTwoFactor(password, code));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="security-setup" onSubmit={submit}>
      <ol className="security-setup__steps">
        <li>
          Open your authenticator app (1Password, Google Authenticator, Authy, Bitwarden, Microsoft Authenticator…) and add an account by scanning this code:
          {svg ? <div className="security-setup__qr" role="img" aria-label="QR code for your authenticator app" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="security-setup__qr" aria-busy="true" />}
          {setup && (
            <details className="security-setup__manual">
              <summary>Can’t scan it? Enter this key instead</summary>
              <code className="security-setup__secret">{setup.secret.match(/.{1,4}/g).join(' ')}</code>
            </details>
          )}
        </li>
        <li>
          <label htmlFor="setup-code">Enter the 6-digit code the app shows</label>
          <input id="setup-code" className="input login__code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123 456" value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))} />
        </li>
        <li>
          <label htmlFor="setup-password">Your password, to confirm it’s you</label>
          <input id="setup-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </li>
      </ol>
      {error && <p className="field__error">{error}</p>}
      <div className="button-row">
        <button type="button" className="button button--secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={busy || !setup || code.replace(/\s/g, '').length !== 6 || !password}>
          {busy ? 'Checking…' : 'Turn on'}
        </button>
      </div>
    </form>
  );
}

/** Password (+ code) prompt for turning it off or making new recovery codes. */
function Confirm({ withCode, label, danger, onSubmit, onCancel }) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(password, code);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <form className="security-confirm" onSubmit={submit}>
      <label className="field">
        <span className="field__label">Password</span>
        <input className="input" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {withCode && (
        <label className="field">
          <span className="field__label">Code from the app (or a recovery code)</span>
          <input className="input" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
      )}
      {error && <p className="field__error">{error}</p>}
      <div className="button-row">
        <button type="button" className="button button--secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={`button ${danger ? 'button--danger' : 'button--primary'}`} disabled={busy || !password || (withCode && !code.trim())}>
          {label}
        </button>
      </div>
    </form>
  );
}

/** @param {{ open: boolean, onClose: () => void }} props */
export default function SecurityDialog({ open, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  /** null | 'setup' | 'disable' | 'recovery' */
  const [mode, setMode] = useState(null);
  const [codes, setCodes] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!open) {
      setMode(null);
      setCodes(null);
      setNotice(null);
      return;
    }
    setError(null);
    api.getSecurity().then(setData, (err) => setError(err.message));
  }, [open]);

  const run = async (fn, message) => {
    setError(null);
    try {
      const res = await fn();
      setData(res);
      if (message) setNotice(typeof message === 'function' ? message(res) : message);
    } catch (err) {
      setError(err.message);
    }
  };

  const tf = data?.twoFactor;
  const others = data?.sessions.filter((s) => !s.current).length || 0;

  return (
    <Modal open={open} onClose={onClose} title="Sign-in & security" className="modal--wide">
      {error && <p className="field__error">{error}</p>}
      {!data && !error && <p className="field__help">Loading…</p>}
      {data && (
        <div className="form">
          <section className="field" aria-labelledby="sec-2fa">
            <h3 id="sec-2fa" className="field__label">
              Two-step sign-in
            </h3>
            {codes ? (
              <RecoveryCodes
                codes={codes}
                onDone={() => {
                  setCodes(null);
                  setMode(null);
                }}
              />
            ) : mode === 'setup' ? (
              <SetupTwoFactor
                onCancel={() => setMode(null)}
                onEnabled={(res) => {
                  setData(res);
                  setCodes(res.recoveryCodes);
                }}
              />
            ) : mode === 'disable' ? (
              <Confirm
                withCode
                danger
                label="Turn off"
                onCancel={() => setMode(null)}
                onSubmit={async (password, code) => {
                  setData(await api.disableTwoFactor(password, code));
                  setMode(null);
                  setNotice('Two-step sign-in is off.');
                }}
              />
            ) : mode === 'recovery' ? (
              <Confirm
                label="Make new codes"
                onCancel={() => setMode(null)}
                onSubmit={async (password) => {
                  const res = await api.newRecoveryCodes(password);
                  setData(res);
                  setCodes(res.recoveryCodes);
                }}
              />
            ) : tf.enabled ? (
              <>
                <p className="security-status security-status--on">
                  <Icon name="shield" size={18} /> On since {new Date(tf.enabledAt).toLocaleDateString([], { dateStyle: 'medium' })}. Signing in needs your password and a
                  code from your authenticator app.
                </p>
                <p className={`field__help ${tf.recoveryLeft <= 2 ? 'field__error' : ''}`}>
                  {tf.recoveryLeft} of 10 recovery codes left{tf.recoveryLeft <= 2 ? ': make new ones soon.' : '.'}
                </p>
                <div className="button-row">
                  <button type="button" className="button button--secondary" onClick={() => setMode('recovery')}>
                    New recovery codes
                  </button>
                  <button type="button" className="button button--secondary" onClick={() => setMode('disable')}>
                    Turn off
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  Ask for a 6-digit code from an authenticator app on your phone as well as your password. Someone who learns your password still can’t get in.
                </p>
                <button type="button" className="button button--primary" onClick={() => setMode('setup')}>
                  <Icon name="shield" size={16} /> Turn on two-step sign-in
                </button>
              </>
            )}
          </section>

          <section className="field" aria-labelledby="sec-devices">
            <h3 id="sec-devices" className="field__label">
              Signed-in devices
            </h3>
            <ul className="security-list">
              {data.sessions.map((s) => (
                <li key={s.id} className="security-list__item">
                  <span className="security-list__main">
                    <b>{deviceName(s.ua)}</b>
                    {s.current && <span className="security-badge">This device</span>}
                    <small>
                      {s.current ? 'Active now' : `Last active ${when(s.lastSeen)}`}
                      {s.ip && ` · ${s.ip}`} · signed in {when(s.created)}
                      {s.method !== 'password' && ` with ${s.method}`}
                    </small>
                  </span>
                  {!s.current && (
                    <button type="button" className="button button--secondary button--small" onClick={() => run(() => api.signOutDevice(s.id), 'Signed out.')}>
                      Sign out
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="button-row">
              <button
                type="button"
                className="button button--secondary"
                disabled={!others}
                onClick={() => run(() => api.signOutOthers(), (res) => `Signed out ${res.signedOut} other ${res.signedOut === 1 ? 'device' : 'devices'}.`)}
              >
                <Icon name="logout" size={16} /> Sign out all other devices
              </button>
            </div>
            <small className="field__help">Sign-ins last 30 days. Changing the password (npm run set-password) signs out every device.</small>
          </section>

          <section className="field" aria-labelledby="sec-recent">
            <h3 id="sec-recent" className="field__label">
              Recent sign-ins
            </h3>
            {data.signIns.length === 0 ? (
              <p className="field__help">None yet.</p>
            ) : (
              <ul className="security-list security-list--compact">
                {data.signIns.slice(0, 12).map((e, i) => (
                  <li key={`${e.at}-${i}`} className={`security-list__item ${e.ok ? '' : 'is-failed'}`}>
                    <span className="security-list__main">
                      <b>{e.ok ? (e.step.startsWith('turned') ? e.step.charAt(0).toUpperCase() + e.step.slice(1) : 'Signed in') : STEP_TEXT[e.step] || 'Failed'}</b>
                      <small>
                        {when(e.at)} · {deviceName(e.ua)}
                        {e.ip && ` · ${e.ip}`}
                        {e.ok && !e.step.startsWith('turned') && e.step !== 'password' && ` · ${e.step}`}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <small className="field__help">Only attempts made on your secret editor page are listed. Repeated failures from one address are blocked for 15 minutes.</small>
          </section>
          {notice && (
            <p className="field__help" role="status">
              {notice}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
