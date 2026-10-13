/**
 * Newer card types: more players (TikTok, Twitch, SoundCloud, Bandcamp,
 * Pinterest), booking calendars, maps, galleries, countdowns, file
 * downloads, contact and newsletter forms, contact cards (vCard), tip jars
 * and products. Each receives `{ tile, shape }`.
 *
 * Payments: tip jars and products only link out to Stripe, PayPal, Ko-fi,
 * Gumroad… Trellis never sees or handles money.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useView } from '../../context/ViewContext.js';
import {
  bandcampEmbedUrl,
  bookingEmbedUrl,
  bookingProvider,
  osmEmbedUrl,
  osmPageUrl,
  pinterestEmbedUrl,
  soundcloudEmbedUrl,
  tiktokEmbedUrl,
  twitchEmbedUrl,
  twitchPageUrl,
} from '../../lib/embeds.js';
import { isRoomy, hasPreviewRoom } from '../../lib/layout.js';
import { detectPlatform, PLATFORMS } from '../../lib/platforms.js';
import { linkHref } from '../../lib/richText.js';
import { Icon } from '../Icons.jsx';
import VisitorDialog from '../VisitorDialog.jsx';
import EmbedFrame from './EmbedFrame.jsx';
import LinkCard from './LinkCard.jsx';

function EmptyTile({ label }) {
  return <div className="tile-empty">{label}</div>;
}

/* -------------------------------- Players ------------------------------- */

export function TikTokTile({ tile, shape }) {
  const src = tiktokEmbedUrl(tile.data.url);
  if (!src) {
    if (/tiktok\.com\/@/.test(tile.data.url || '')) return <LinkCard href={tile.data.url} platform="tiktok" shape={shape} title={tile.data.title || 'TikTok'} subtitle={tile.data.url.match(/@[\w.-]+/)?.[0]} action="Follow" />;
    return <EmptyTile label="Paste a TikTok video link (tiktok.com/@you/video/…)" />;
  }
  return <EmbedFrame src={src} title={tile.data.title || 'TikTok video'} className="embed-frame--fill" allow="encrypted-media; fullscreen; picture-in-picture" />;
}

export function TwitchTile({ tile, shape }) {
  const src = twitchEmbedUrl(tile.data.channel || '');
  if (!src) return <EmptyTile label="Enter your Twitch channel name" />;
  if (shape === 'bar' || shape === 'sm') {
    return <LinkCard href={twitchPageUrl(tile.data.channel)} platform="twitch" shape={shape} title={tile.data.title || 'Twitch'} subtitle={`twitch.tv/${tile.data.channel}`} action="Watch" />;
  }
  return <EmbedFrame src={src} title={tile.data.title || `${tile.data.channel} on Twitch`} className="embed-frame--fill" allow="autoplay; fullscreen; encrypted-media" />;
}

export function SoundCloudTile({ tile, shape }) {
  const src = soundcloudEmbedUrl(tile.data.url, { visual: shape !== 'bar' });
  if (!src) return <EmptyTile label="Paste a SoundCloud track, playlist or profile link" />;
  return <EmbedFrame src={src} title={tile.data.title || 'SoundCloud player'} className="embed-frame--fill" allow="autoplay; encrypted-media" />;
}

export function BandcampTile({ tile, shape }) {
  const { theme } = useView();
  const src = bandcampEmbedUrl(tile.data.embedId, { theme, tall: isRoomy(shape) });
  if (!src) {
    if (tile.data.url) return <LinkCard href={tile.data.url} platform="bandcamp" shape={shape} title={tile.data.title || 'Bandcamp'} subtitle="Listen on Bandcamp" action="Listen" />;
    return <EmptyTile label="Paste Bandcamp’s embed code (Share / Embed → Embed this album)" />;
  }
  return <EmbedFrame src={src} title={tile.data.title || 'Bandcamp player'} className="embed-frame--fill" allow="autoplay; encrypted-media" />;
}

export function PinterestTile({ tile, shape }) {
  const src = pinterestEmbedUrl(tile.data.url);
  if (!src) {
    if (tile.data.url) return <LinkCard href={tile.data.url} platform="pinterest" shape={shape} title={tile.data.title || 'Pinterest'} action="Follow" />;
    return <EmptyTile label="Paste a Pinterest pin link (pinterest.com/pin/…)" />;
  }
  return <EmbedFrame src={src} title={tile.data.title || 'Pinterest pin'} className="embed-frame--fill embed-frame--pinterest" />;
}

/* -------------------------------- Booking ------------------------------- */

/**
 * Cal.com keeps its embedded page hidden until the host page says it's
 * ready (normally done by Cal's embed script). We send that one message
 * ourselves, so no third-party script runs on the page.
 */
function calHandshake(frame) {
  const send = () => frame.contentWindow?.postMessage({ originator: 'CAL', method: 'parentKnowsIframeReady', arg: {} }, 'https://cal.com');
  send();
  [300, 1000, 2500].forEach((ms) => setTimeout(send, ms));
}

export function BookingTile({ tile, shape }) {
  const { theme } = useView();
  const { url, title, subtitle, showEmbed } = tile.data;
  const provider = bookingProvider(url);
  const platform = provider === 'cal' ? 'caldotcom' : provider === 'calendly' ? 'calendly' : 'website';
  if (!url) return <EmptyTile label="Paste your Cal.com or Calendly booking link" />;
  const src = showEmbed !== false && isRoomy(shape) ? bookingEmbedUrl(url, theme) : null;
  return (
    <LinkCard href={url} platform={platform} uiIcon={platform === 'website' ? 'calendar' : undefined} shape={shape} title={title || 'Book a call'} subtitle={subtitle || (provider ? PLATFORMS[platform].name : '')} action="Book">
      {src && <EmbedFrame src={src} title={title || 'Booking calendar'} className="embed-frame--post embed-frame--booking" onLoad={provider === 'cal' ? calHandshake : undefined} />}
    </LinkCard>
  );
}

/* ---------------------------------- Map --------------------------------- */

export function MapTile({ tile, shape }) {
  const { address, lat, lon, zoom, title, showEmbed } = tile.data;
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lon);
  if (!hasPoint && !address) return <EmptyTile label="Search for an address" />;
  const href = hasPoint ? osmPageUrl(lat, lon, zoom || 15) : `https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`;
  const src = hasPoint && showEmbed !== false && shape !== 'bar' && shape !== 'sm' ? osmEmbedUrl(lat, lon, zoom || 14) : null;
  if (!src) return <LinkCard href={href} platform="openstreetmap" uiIcon="map" shape={shape} title={title || 'Find me here'} subtitle={address} action="Directions" />;
  return (
    <div className="map-tile">
      <EmbedFrame src={src} title={title || `Map: ${address}`} className="embed-frame--fill" />
      <a className="map-tile__label tile-interactive" href={href} target="_blank" rel="noopener noreferrer">
        <Icon name="map" size={16} />
        <span dir="auto">
          <b>{title || 'Find me here'}</b>
          {address && <small>{address}</small>}
        </span>
        <Icon name="arrow" size={14} />
      </a>
    </div>
  );
}

/* -------------------------------- Gallery ------------------------------- */

function GalleryImage({ image, eager }) {
  const img = <img src={image.src} alt={image.caption || ''} loading={eager ? 'eager' : 'lazy'} draggable={false} />;
  const body = (
    <>
      {img}
      {image.caption && <span className="gallery__caption">{image.caption}</span>}
    </>
  );
  return image.url ? (
    <a className="gallery__item tile-interactive" href={linkHref(image.url)} target="_blank" rel="noopener noreferrer">
      {body}
    </a>
  ) : (
    <div className="gallery__item">{body}</div>
  );
}

export function GalleryTile({ tile }) {
  const { images = [], mode, title } = tile.data;
  const track = useRef(null);
  const [index, setIndex] = useState(0);
  const label = useId();

  // Which slide is showing (for the dots and the buttons).
  useEffect(() => {
    const el = track.current;
    if (!el || mode === 'grid') return undefined;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [mode, images.length]);

  if (!images.length) return <EmptyTile label="Add some photos" />;

  if (mode === 'grid') {
    return (
      <div className={`gallery gallery--grid gallery--n${Math.min(images.length, 9)}`} role="group" aria-label={title || 'Photos'}>
        {images.slice(0, 9).map((im, i) => (
          <GalleryImage key={`${im.src}-${i}`} image={im} eager={i < 2} />
        ))}
      </div>
    );
  }

  const go = (i) => {
    const el = track.current;
    if (!el) return;
    const next = (i + images.length) % images.length;
    el.scrollTo({ left: next * el.clientWidth, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  return (
    <div className="gallery gallery--carousel" role="region" aria-roledescription="carousel" aria-labelledby={label}>
      <span id={label} className="visually-hidden">
        {title || 'Photos'}
      </span>
      <div className="gallery__track" ref={track} tabIndex={-1}>
        {images.map((im, i) => (
          <div key={`${im.src}-${i}`} className="gallery__slide" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${images.length}`}>
            <GalleryImage image={im} eager={i === 0} />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <>
          <button type="button" className="gallery__nav gallery__nav--prev tile-interactive" onClick={() => go(index - 1)} aria-label="Previous photo">
            <Icon name="chevron-left" size={18} />
          </button>
          <button type="button" className="gallery__nav gallery__nav--next tile-interactive" onClick={() => go(index + 1)} aria-label="Next photo">
            <Icon name="chevron-right" size={18} />
          </button>
          <div className="gallery__dots" aria-hidden="true">
            {images.map((im, i) => (
              <span key={`${im.src}-${i}`} className={i === index ? 'is-active' : ''} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------- Countdown ------------------------------ */

function remaining(target, now) {
  const ms = Math.max(0, target - now);
  return { ms, d: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, m: Math.floor(ms / 6e4) % 60, s: Math.floor(ms / 1e3) % 60 };
}

export function CountdownTile({ tile, shape }) {
  const { title, date, endText, url, buttonLabel } = tile.data;
  const target = Date.parse(date);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!Number.isFinite(target)) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  if (!Number.isFinite(target)) return <EmptyTile label="Pick a date and time" />;
  const r = remaining(target, now);
  const done = r.ms === 0;
  const when = new Date(target).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const parts = [
    [r.d, r.d === 1 ? 'day' : 'days'],
    [r.h, 'hours'],
    [r.m, 'min'],
    [r.s, 'sec'],
  ];
  return (
    <div className={`countdown countdown--${shape}`}>
      <div className="countdown__head">
        <span className="ui-badge" aria-hidden="true">
          <Icon name="timer" size={16} />
        </span>
        <span className="countdown__title" dir="auto">
          {title || 'Coming soon'}
        </span>
      </div>
      {done ? (
        <p className="countdown__done" dir="auto">
          {endText || 'It’s here!'}
        </p>
      ) : (
        <p className="countdown__clock" role="timer" aria-label={`${r.d} days, ${r.h} hours and ${r.m} minutes to go`}>
          {parts.map(([n, unit]) => (
            <span key={unit}>
              <b>{String(n).padStart(2, '0')}</b>
              <small>{unit}</small>
            </span>
          ))}
        </p>
      )}
      {(shape !== 'bar' || url) && (
        <div className="countdown__foot">
          {shape !== 'bar' && <small className="countdown__when">{when}</small>}
          {url && (
            <a className="tile-pill tile-pill--button tile-interactive countdown__button" href={linkHref(url)} target="_blank" rel="noopener noreferrer">
              {buttonLabel || 'Find out more'}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ File download --------------------------- */

const fileSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : n ? `${n} B` : '');

export function FileTile({ tile, shape }) {
  const { src, fileName, size, title, subtitle } = tile.data;
  if (!src) return <EmptyTile label="Upload a PDF" />;
  return (
    <LinkCard
      href={src}
      download={fileName || 'download.pdf'}
      platform="website"
      uiIcon="file"
      shape={shape}
      title={title || fileName || 'Download'}
      subtitle={subtitle || ['PDF', fileSize(size)].filter(Boolean).join(' · ')}
      action="Download"
    />
  );
}

/* --------------------------------- Forms -------------------------------- */

async function postForm(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
  if (res.ok) return;
  const data = await res.json().catch(() => null);
  throw Object.assign(new Error(data?.error || 'Something went wrong. Please try again.'), { field: data?.field });
}

/** Hidden field that only bots fill in. */
const Honeypot = () => (
  <label className="visually-hidden" aria-hidden="true">
    Leave this empty
    <input type="text" name="trellis_hp" tabIndex={-1} autoComplete="off" data-1p-ignore data-lpignore="true" data-bwignore />
  </label>
);

function ContactForm({ tile, onDone }) {
  const [state, setState] = useState({ busy: false, error: null, field: null, sent: false });
  const { askPhone, buttonLabel, success } = tile.data;
  const submit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState({ busy: true, error: null, field: null, sent: false });
    try {
      await postForm(`/api/forms/${encodeURIComponent(tile.id)}/contact`, Object.fromEntries(f));
      setState({ busy: false, error: null, field: null, sent: true });
    } catch (err) {
      setState({ busy: false, error: err.message, field: err.field, sent: false });
    }
  };
  if (state.sent) {
    return (
      <div className="visitor-form__sent" role="status">
        <Icon name="check" size={22} />
        <p dir="auto">{success || 'Thanks! Your message has been sent.'}</p>
        <button type="button" className="visitor-button" onClick={onDone}>
          Close
        </button>
      </div>
    );
  }
  return (
    <form className="visitor-form" onSubmit={submit}>
      <label>
        Name
        <input name="name" required maxLength={100} autoComplete="name" aria-invalid={state.field === 'name' || undefined} />
      </label>
      <label>
        Email
        <input name="email" type="email" required maxLength={200} autoComplete="email" aria-invalid={state.field === 'email' || undefined} />
      </label>
      {askPhone && (
        <label>
          Phone (optional)
          <input name="phone" type="tel" maxLength={40} autoComplete="tel" />
        </label>
      )}
      <label>
        Message
        <textarea name="message" required rows={5} maxLength={5000} aria-invalid={state.field === 'message' || undefined} />
      </label>
      <Honeypot />
      {state.error && (
        <p className="visitor-form__error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className="visitor-button" disabled={state.busy}>
        {state.busy ? 'Sending…' : buttonLabel || 'Send message'}
      </button>
      <small className="visitor-form__note">Your message goes straight to the owner of this page, and nowhere else.</small>
    </form>
  );
}

export function ContactTile({ tile, shape }) {
  const { editing } = useView();
  const [open, setOpen] = useState(false);
  const { title, subtitle, buttonLabel } = tile.data;
  return (
    <div className={`form-card form-card--${shape}`}>
      <span className="ui-badge ui-badge--lg" aria-hidden="true">
        <Icon name="mail" size={18} />
      </span>
      <div className="form-card__text" dir="auto">
        <b>{title || 'Get in touch'}</b>
        {subtitle && shape !== 'bar' && <small>{subtitle}</small>}
      </div>
      <button type="button" className="tile-pill tile-pill--button tile-interactive form-card__button" onClick={() => !editing && setOpen(true)}>
        {buttonLabel || 'Send a message'}
      </button>
      <VisitorDialog open={open} onClose={() => setOpen(false)} title={title || 'Get in touch'}>
        {subtitle && <p className="visitor-dialog__lead">{subtitle}</p>}
        <ContactForm tile={tile} onDone={() => setOpen(false)} />
      </VisitorDialog>
    </div>
  );
}

function NewsletterForm({ tile, compact }) {
  const { editing } = useView();
  const [state, setState] = useState({ busy: false, error: null, sent: false });
  const { buttonLabel, placeholder, success } = tile.data;
  const submit = async (e) => {
    e.preventDefault();
    if (editing) return;
    setState({ busy: true, error: null, sent: false });
    try {
      await postForm(`/api/forms/${encodeURIComponent(tile.id)}/subscribe`, Object.fromEntries(new FormData(e.currentTarget)));
      setState({ busy: false, error: null, sent: true });
    } catch (err) {
      setState({ busy: false, error: err.message, sent: false });
    }
  };
  if (state.sent) {
    return (
      <p className="newsletter__sent" role="status" dir="auto">
        <Icon name="check" size={16} /> {success || 'Thanks! Check your inbox to confirm.'}
      </p>
    );
  }
  return (
    <form className={`newsletter__form tile-interactive ${compact ? 'newsletter__form--compact' : ''}`} onSubmit={submit}>
      <input name="email" type="email" required maxLength={200} autoComplete="email" placeholder={placeholder || 'you@example.com'} aria-label="Email address" />
      <Honeypot />
      <button type="submit" disabled={state.busy}>
        {state.busy ? '…' : buttonLabel || 'Subscribe'}
      </button>
      {state.error && (
        <p className="newsletter__error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function NewsletterTile({ tile, shape }) {
  const { editing } = useView();
  const [open, setOpen] = useState(false);
  const { title, subtitle, buttonLabel } = tile.data;
  const inline = hasPreviewRoom(shape) || shape === 'bar';
  return (
    <div className={`form-card form-card--${shape} newsletter`}>
      <span className="ui-badge ui-badge--lg" aria-hidden="true">
        <Icon name="send" size={18} />
      </span>
      <div className="form-card__text" dir="auto">
        <b>{title || 'Join my newsletter'}</b>
        {subtitle && shape !== 'bar' && <small>{subtitle}</small>}
      </div>
      {inline ? (
        <NewsletterForm tile={tile} compact={shape === 'bar'} />
      ) : (
        <>
          <button type="button" className="tile-pill tile-pill--button tile-interactive form-card__button" onClick={() => !editing && setOpen(true)}>
            {buttonLabel || 'Subscribe'}
          </button>
          <VisitorDialog open={open} onClose={() => setOpen(false)} title={title || 'Join my newsletter'}>
            {subtitle && <p className="visitor-dialog__lead">{subtitle}</p>}
            <NewsletterForm tile={tile} />
          </VisitorDialog>
        </>
      )}
    </div>
  );
}

/* --------------------------------- vCard -------------------------------- */

/** Escape a vCard text value (RFC 6350 §3.4). */
const vEscape = (s = '') => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);

export function buildVCard(d) {
  const [first, ...rest] = (d.name || '').trim().split(/\s+/);
  const last = rest.pop() || '';
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${vEscape(d.name || d.org || 'Contact')}`,
    `N:${vEscape(last)};${vEscape(first || '')};${vEscape(rest.join(' '))};;`,
    d.org && `ORG:${vEscape(d.org)}`,
    d.role && `TITLE:${vEscape(d.role)}`,
    d.phone && `TEL;TYPE=CELL:${vEscape(d.phone)}`,
    d.email && `EMAIL;TYPE=INTERNET:${vEscape(d.email)}`,
    d.url && `URL:${vEscape(d.url)}`,
    d.address && `ADR;TYPE=WORK:;;${vEscape(d.address)};;;;`,
    d.note && `NOTE:${vEscape(d.note)}`,
    `SOURCE:${vEscape(window.location.origin)}`,
    'END:VCARD',
  ].filter(Boolean);
  return `${lines.join('\r\n')}\r\n`;
}

export function VCardTile({ tile, shape }) {
  const { editing } = useView();
  const d = tile.data;
  const save = () => {
    if (editing) return;
    const blob = new Blob([buildVCard(d)], { type: 'text/vcard;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${(d.name || 'contact').replace(/[^\w -]+/g, '').trim() || 'contact'}.vcf` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  if (!d.name && !d.email && !d.phone) return <EmptyTile label="Add your contact details" />;
  return (
    <div className={`form-card form-card--${shape}`}>
      <span className="ui-badge ui-badge--lg" aria-hidden="true">
        <Icon name="user" size={18} />
      </span>
      <div className="form-card__text" dir="auto">
        <b>{d.title || d.name || 'Save my contact'}</b>
        {shape !== 'bar' && <small>{d.subtitle || [d.role, d.org].filter(Boolean).join(' · ') || 'Add me to your contacts'}</small>}
      </div>
      <button type="button" className="tile-pill tile-pill--button tile-interactive form-card__button" onClick={save}>
        <Icon name="download" size={14} /> Save contact
      </button>
    </div>
  );
}

/* ------------------------------- Payments ------------------------------- */

export function TipJarTile({ tile, shape }) {
  const { title, subtitle, amounts = [] } = tile.data;
  if (!amounts.length) return <EmptyTile label="Add tip amounts with your payment links" />;
  const platform = detectPlatform(amounts[0].url);
  return (
    <div className={`form-card form-card--${shape} tipjar`}>
      <span className="ui-badge ui-badge--lg" aria-hidden="true">
        <Icon name="heart" size={18} />
      </span>
      <div className="form-card__text" dir="auto">
        <b>{title || 'Support my work'}</b>
        {subtitle && shape !== 'bar' && <small>{subtitle}</small>}
      </div>
      <div className="tipjar__amounts">
        {amounts.map((a, i) => (
          <a key={`${a.url}-${i}`} className="tile-pill tile-pill--button tile-interactive" href={linkHref(a.url)} target="_blank" rel="noopener noreferrer">
            {a.label || 'Tip'}
          </a>
        ))}
      </div>
      {shape !== 'bar' && platform !== 'website' && <small className="tipjar__via">Secure payment with {PLATFORMS[platform]?.name}</small>}
    </div>
  );
}

export function ProductTile({ tile, shape }) {
  const { title, subtitle, price, image, url, buttonLabel, badge } = tile.data;
  if (!title && !image) return <EmptyTile label="Add a product" />;
  const showImage = image && shape !== 'bar';
  return (
    <div className={`product product--${shape} ${showImage ? 'product--with-image' : ''}`}>
      {showImage && <img className="product__image" src={image} alt="" loading="lazy" />}
      {badge && <span className="product__badge">{badge}</span>}
      <div className="product__body">
        <div className="product__text" dir="auto">
          {url ? (
            <a className="tile-card__link" href={linkHref(url)} target="_blank" rel="noopener noreferrer">
              {title || 'Product'}
            </a>
          ) : (
            <b>{title}</b>
          )}
          {subtitle && isRoomy(shape) && <small>{subtitle}</small>}
        </div>
        <div className="product__buy">
          {price && <span className="product__price">{price}</span>}
          {url && shape !== 'sm' && (
            <span className="tile-pill product__button" aria-hidden="true">
              <Icon name="bag" size={14} /> {buttonLabel || 'Buy'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
