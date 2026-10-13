/**
 * Settings → Integrations: connect Instagram for live feed tiles, and a
 * newsletter service for newsletter sign-up cards.
 *
 * Tokens and API keys are sent to the server once and never comes back to the browser;
 * the server validates it, stores it in DATA_DIR/integrations.json and
 * refreshes it automatically before it expires.
 */
import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { BrandBadge, Icon } from '../Icons.jsx';

const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '');

export default function IntegrationsSection() {
  const [status, setStatus] = useState(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [justConnected, setJustConnected] = useState(false);

  useEffect(() => {
    api.getIntegrations().then(setStatus).catch((err) => setError(err.message));
  }, []);

  const connect = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setStatus(await api.connectInstagram(token));
      setToken('');
      setJustConnected(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      setStatus(await api.disconnectInstagram());
    } finally {
      setBusy(false);
    }
  };

  const ig = status?.instagram;

  return (
    <div className="field">
      <span className="field__label">Integrations</span>
      <div className="integration">
        <BrandBadge platform="instagram" size={36} />
        <div className="integration__body">
          <strong>Instagram feed</strong>
          {!status && !error && <small>Checking…</small>}
          {ig?.connected && ig.source === 'settings' && (
            <small>
              Connected as <b>@{ig.username}</b>
              {ig.expiresAt ? ` · token renews automatically (valid until ${formatDate(ig.expiresAt)})` : ' · token renews automatically'}
            </small>
          )}
          {ig?.connected && ig.source === 'env' && <small>Connected via INSTAGRAM_ACCESS_TOKEN in the server’s .env</small>}
          {ig && !ig.connected && <small>Not connected. Needed for “Instagram feed” tiles.</small>}
        </div>
        {ig?.connected && ig.source === 'settings' && (
          <button type="button" className="button button--danger" onClick={disconnect} disabled={busy}>
            Disconnect
          </button>
        )}
      </div>

      {ig && !(ig.connected && ig.source === 'settings') && (
        <form className="integration__connect" onSubmit={connect}>
          <input
            className="input"
            type="password"
            autoComplete="off"
            placeholder="Paste a long-lived Instagram access token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button type="submit" className="button button--primary" disabled={busy || token.trim().length < 20}>
            {busy ? 'Checking…' : 'Connect'}
          </button>
        </form>
      )}
      {justConnected && <p className="field__note">Connected! Reload the editor to load your feed into Instagram feed tiles.</p>}
      {error && <p className="field__error">{error}</p>}
      <small className="field__help">
        Requires an Instagram Business or Creator account and a token from Meta’s “Instagram API with Instagram Login”. Step-by-step instructions are in the README.
      </small>

      <NewsletterIntegration status={status?.newsletter} onStatus={setStatus} />
    </div>
  );
}

const PROVIDERS = {
  buttondown: { name: 'Buttondown', key: 'API key (Settings → API)', list: null },
  mailchimp: { name: 'Mailchimp', key: 'API key (Profile → Extras → API keys)', list: 'Audience id (Audience → Settings → Unique id)' },
  kit: { name: 'Kit (ConvertKit)', key: 'API key, v4 (Settings → Developer)', list: 'Form id (the number in the form’s address)' },
  mailerlite: { name: 'MailerLite', key: 'API token (Integrations → API)', list: 'Group id (optional)' },
};

/** Connect Buttondown, Mailchimp, Kit or MailerLite for newsletter cards. */
function NewsletterIntegration({ status, onStatus }) {
  const [provider, setProvider] = useState('buttondown');
  const [apiKey, setApiKey] = useState('');
  const [listId, setListId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!status) return null;
  const p = PROVIDERS[provider];

  const connect = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onStatus(await api.connectNewsletter({ provider, apiKey, listId }));
      setApiKey('');
      setListId('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    setBusy(true);
    try {
      onStatus(await api.disconnectNewsletter());
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="integration integration--spaced">
        <span className="ui-badge ui-badge--lg" aria-hidden="true">
          <Icon name="send" size={18} />
        </span>
        <div className="integration__body">
          <strong>Newsletter</strong>
          {status.connected ? (
            <small>
              Connected to <b>{PROVIDERS[status.provider]?.name || status.provider}</b>
              {status.listId ? ` (${status.listId})` : ''}. Sign-up cards send new subscribers there.
            </small>
          ) : (
            <small>Not connected. Needed for “Newsletter sign-up” cards.</small>
          )}
        </div>
        {status.connected && (
          <button type="button" className="button button--danger" onClick={disconnect} disabled={busy}>
            Disconnect
          </button>
        )}
      </div>
      {!status.connected && (
        <form className="integration__connect integration__connect--stack" onSubmit={connect}>
          <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Newsletter service">
            {Object.entries(PROVIDERS).map(([value, x]) => (
              <option key={value} value={value}>
                {x.name}
              </option>
            ))}
          </select>
          <input className="input" type="password" autoComplete="off" placeholder={p.key} aria-label={p.key} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          {p.list && <input className="input" type="text" autoComplete="off" placeholder={p.list} aria-label={p.list} value={listId} onChange={(e) => setListId(e.target.value)} />}
          <button type="submit" className="button button--primary" disabled={busy || apiKey.trim().length < 8}>
            {busy ? 'Checking…' : 'Connect'}
          </button>
        </form>
      )}
      {error && <p className="field__error">{error}</p>}
      <small className="field__help">
        Your page never stores email addresses itself: they go straight to the service, which handles confirmation emails and unsubscribes. Mailchimp always asks new subscribers to confirm; for the others, turn on double opt-in in the service’s settings if you want it.
      </small>
    </>
  );
}
