/**
 * Lazy-loaded, sandboxed third-party iframe, with click-to-load consent.
 *
 * `src` must come from one of the builders in lib/embeds.js. The iframe is
 * marked `.tile-interactive` so it sits above the card's stretched link.
 *
 * With Settings → "Load videos, players and maps only after a click" on
 * (the default), visitors first see a small notice naming the provider and
 * a "Load" button, so nothing is sent to YouTube, Spotify & co. until they
 * agree (GDPR / ePrivacy). "Always load from <provider>" remembers that
 * choice in this browser only (localStorage) and loads every embed from
 * that provider on the page at once. The editor always loads embeds.
 *
 * `extraSandbox` adds sandbox permissions a specific provider documents as
 * required (e.g. Apple Music). `onLoad` gets the iframe element (used for
 * Cal.com's ready handshake).
 *
 * @param {{ src: string, title: string, className?: string, allow?: string, extraSandbox?: string, onLoad?: (frame: HTMLIFrameElement) => void }} props
 */
import { useEffect, useId, useState } from 'react';
import { useView } from '../../context/ViewContext.js';
import { embedProvider } from '../../lib/embeds.js';
import { Icon } from '../Icons.jsx';

const STORAGE_KEY = 'trellis:embeds-allowed';
const CHANGE_EVENT = 'trellis:embeds-allowed';

function allowedProviders() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function rememberProvider(name) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set([...allowedProviders(), name])]));
  } catch {
    /* storage blocked: the choice just isn't remembered */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: name }));
}

export default function EmbedFrame({ src, title, className = '', allow = 'encrypted-media; picture-in-picture; clipboard-write; fullscreen', extraSandbox = '', onLoad }) {
  const { editing, embedConsent } = useView();
  const provider = embedProvider(src);
  const needsConsent = !editing && embedConsent !== false;
  const [loaded, setLoaded] = useState(() => !needsConsent || allowedProviders().includes(provider));
  const [remember, setRemember] = useState(false);
  const checkId = useId();

  // Another card from the same provider was allowed "always": load this one too.
  useEffect(() => {
    if (loaded) return undefined;
    const onChange = (e) => e.detail === provider && setLoaded(true);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, [loaded, provider]);

  if (!loaded) {
    return (
      <div className={`embed-frame embed-consent tile-interactive ${className}`} role="group" aria-label={`${title} (not loaded)`}>
        <div className="embed-consent__body">
          <Icon name="play" size={22} />
          <p>
            <b>{title}</b>
            <span>Loads content from {provider}, which may set cookies and see your IP address.</span>
          </p>
          <button
            type="button"
            className="embed-consent__button"
            onClick={() => {
              if (remember) rememberProvider(provider);
              setLoaded(true);
            }}
          >
            Load {provider}
          </button>
          <label className="embed-consent__remember" htmlFor={checkId}>
            <input id={checkId} type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Always load from {provider}
          </label>
        </div>
      </div>
    );
  }

  return (
    <iframe
      className={`embed-frame tile-interactive ${className}`}
      src={src}
      title={title}
      loading="lazy"
      allow={allow}
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox={`allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation ${extraSandbox}`.trim()}
      onLoad={onLoad ? (e) => onLoad(e.currentTarget) : undefined}
    />
  );
}
