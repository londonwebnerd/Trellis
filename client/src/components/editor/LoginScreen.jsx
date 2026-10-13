import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';

/**
 * Password prompt shown at the secret editor URL. With `overlay`, it's shown
 * on top of the open editor after the session expired, so nothing is lost.
 * The overlay is a modal <dialog>, so it sits above any dialog that was
 * already open (a tile editor, settings) instead of being stuck behind it.
 * @param {{ passwordSet: boolean, onLogin: () => (void | Promise<void>), overlay?: boolean }} props
 */
export default function LoginScreen({ passwordSet, onLogin, overlay = false }) {
  const [password, setPassword] = useState('');
  /** Two-step sign-in: shown once the password was right. */
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (overlay && dialog && !dialog.open) dialog.showModal();
    return () => dialog?.open && dialog.close();
  }, [overlay]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.login(password, needsCode ? code : undefined);
      if (res?.recoveryLeft !== undefined) {
        setNotice(`Signed in with a recovery code. ${res.recoveryLeft} left: make new ones in More → Sign-in & security.`);
        await new Promise((r) => setTimeout(r, 2500));
      }
      await onLogin();
    } catch (err) {
      if (err.code === 'code_required') {
        setNeedsCode(true);
      } else {
        setError(err.message);
        if (err.code === 'code_invalid') setCode('');
      }
    } finally {
      setBusy(false);
    }
  };

  const screen = (
    <main className={`login ${overlay ? 'login--overlay' : ''}`} aria-labelledby="login-title">
      <form className="login__card" onSubmit={submit}>
        <h1 id="login-title">{overlay ? 'Please sign in again' : 'Edit your page'}</h1>
        {overlay && <p className="login__note">You were signed out, but your changes are still here. Sign in to save them.</p>}
        {passwordSet && needsCode ? (
          <>
            <label htmlFor="login-code">{useRecovery ? 'Recovery code' : 'Code from your authenticator app'}</label>
            {useRecovery ? (
              <input id="login-code" key="recovery" className="input" autoComplete="off" autoCapitalize="none" spellCheck={false} autoFocus placeholder="xxxx-xxxx-xxxx" value={code} onChange={(e) => setCode(e.target.value)} />
            ) : (
              <input
                id="login-code"
                key="otp"
                className="input login__code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]*"
                maxLength={7}
                autoFocus
                placeholder="123 456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
              />
            )}
            {error && <p className="field__error" role="alert">{error}</p>}
            {notice && <p className="login__note" role="status">{notice}</p>}
            <button type="submit" className="button button--primary" disabled={busy || code.replace(/\s/g, '').length < 6}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setUseRecovery((v) => !v);
                setCode('');
                setError(null);
              }}
            >
              {useRecovery ? 'Use a code from the app instead' : 'Lost your phone? Use a recovery code'}
            </button>
          </>
        ) : passwordSet ? (
          <>
            {/* Password managers save a password with a username: this one
                names the site, so the editor password is easy to find. */}
            <input className="visually-hidden" type="text" name="username" autoComplete="username" value={window.location.host} readOnly tabIndex={-1} aria-hidden="true" />
            <label htmlFor="password">Password</label>
            <input id="password" className="input" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? 'login-error' : undefined} />
            {error && (
              <p id="login-error" className="field__error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="button button--primary" disabled={busy || !password}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </>
        ) : (
          <p>
            No password has been set for this site yet. Whoever runs the server can set one with <code>npm run set-password</code>; then reload this page.
          </p>
        )}
        {!overlay && (
          <a href="/" className="link-button">
            ← Back to the page
          </a>
        )}
      </form>
    </main>
  );

  if (!overlay) return screen;
  return (
    <dialog
      ref={dialogRef}
      className="login-dialog"
      aria-labelledby="login-title"
      // Escape mustn't dismiss it: there's nothing to go back to without signing in.
      onCancel={(e) => e.preventDefault()}
    >
      {screen}
    </dialog>
  );
}
