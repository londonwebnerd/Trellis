/**
 * Statistics dashboard: visits and clicks counted by the server without
 * cookies (server/src/lib/analytics.js).
 *
 * Range filter in one row, four headline numbers, a views/clicks line chart
 * (crosshair tooltip, legend, table view) and ranked lists for cards,
 * referrers, countries, devices and campaigns. Everything can be exported
 * as CSV.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { useEditor } from './EditorContext.js';
import Modal from './Modal.jsx';

const RANGES = [
  [7, '7 days'],
  [30, '30 days'],
  [90, '90 days'],
  [365, '1 year'],
];

const SERIES = [
  { key: 'views', label: 'Views', className: 'stats-series--1' },
  { key: 'clicks', label: 'Clicks', className: 'stats-series--2' },
];

const nf = new Intl.NumberFormat();
const pct = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(part / whole < 0.1 ? 1 : 0)}%` : '–');
const dayLabel = (iso, long = false) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString([], long ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });

/** Names for country codes and languages, in the editor's language. */
const regionNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames([], { type: 'region' }) : null;
const languageNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames([], { type: 'language' }) : null;
const safeName = (names, code) => {
  try {
    return names?.of(code) || code;
  } catch {
    return code;
  }
};

/** "Nice" upper bound and ticks for the y axis. */
function niceTicks(max) {
  if (max <= 4) return [0, 1, 2, 3, 4].slice(0, Math.max(2, max + 1));
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

/** Width of an element, kept up to date. */
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/* --------------------------------- Chart -------------------------------- */

function LineChart({ daily }) {
  const [wrap, width] = useWidth();
  const [hover, setHover] = useState(null);
  const height = 200;
  const pad = { top: 12, right: 12, bottom: 26, left: 36 };
  const innerW = Math.max(10, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...daily.flatMap((d) => [d.views, d.clicks]));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const x = (i) => pad.left + (daily.length <= 1 ? innerW / 2 : (i / (daily.length - 1)) * innerW);
  const y = (v) => pad.top + innerH - (v / top) * innerH;
  const path = (key) => daily.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join('');
  // About 5 date labels along the bottom, never overlapping.
  const every = Math.max(1, Math.ceil(daily.length / Math.max(2, Math.floor(innerW / 90))));

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left - pad.left;
    const i = Math.round((px / innerW) * (daily.length - 1));
    setHover(Math.min(daily.length - 1, Math.max(0, i)));
  };

  const h = hover != null ? daily[hover] : null;
  return (
    <div className="stats-chart" ref={wrap}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Views and clicks per day" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="stats-chart__grid" x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} />
              <text className="stats-chart__tick" x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {nf.format(t)}
              </text>
            </g>
          ))}
          {daily.map((d, i) =>
            i % every === 0 ? (
              <text key={d.date} className="stats-chart__tick" x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : 'middle'}>
                {dayLabel(d.date)}
              </text>
            ) : null,
          )}
          {SERIES.map((s) => (
            <path key={s.key} className={`stats-chart__line ${s.className}`} d={path(s.key)} />
          ))}
          {h && (
            <g>
              <line className="stats-chart__crosshair" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} />
              {SERIES.map((s) => (
                <circle key={s.key} className={`stats-chart__dot ${s.className}`} cx={x(hover)} cy={y(h[s.key])} r="4.5" />
              ))}
            </g>
          )}
          {/* Hit area over the whole plot. */}
          <rect x={pad.left} y={pad.top} width={innerW} height={innerH} fill="transparent" />
        </svg>
      )}
      {h && (
        <div className="stats-tooltip" style={{ left: Math.min(Math.max(x(hover), 80), width - 80) }} role="status">
          <b>{dayLabel(h.date, true)}</b>
          {SERIES.map((s) => (
            <span key={s.key}>
              <i className={`stats-swatch ${s.className}`} /> {s.label} <b>{nf.format(h[s.key])}</b>
            </span>
          ))}
          <span className="stats-tooltip__muted">Visitors {nf.format(h.visitors)}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Bar lists ------------------------------ */

function BarList({ title, rows, total, empty = 'Nothing yet', extra }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="stats-list">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="stats-list__empty">{empty}</p>
      ) : (
        <ol>
          {rows.map((r) => (
            <li key={r.key} title={`${r.label ?? r.key}: ${nf.format(r.count)}`}>
              <span className="stats-list__label" dir="auto">
                {r.label ?? r.key}
              </span>
              <span className="stats-list__value">
                {nf.format(r.count)}
                {total ? <small> {pct(r.count, total)}</small> : null}
                {extra ? <small> {extra(r)}</small> : null}
              </span>
              <span className="stats-list__bar" style={{ '--w': `${(r.count / max) * 100}%` }} aria-hidden="true" />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ---------------------------------- CSV --------------------------------- */

const csvCell = (v) => {
  const s = String(v ?? '');
  // Leading = + - @ would be run as formulas by spreadsheet apps.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

function toCsv(data) {
  const lines = [['date', 'views', 'visitors', 'clicks'], ...data.daily.map((d) => [d.date, d.views, d.visitors, d.clicks]), [], ['breakdown', 'item', 'count']];
  const add = (name, rows, label = (r) => r.key) => rows.forEach((r) => lines.push([name, label(r), r.count]));
  add('card', data.tiles, (r) => r.title);
  add('short_link', data.shortLinks || [], (r) => `/${r.key}`);
  add('referrer', data.referrers);
  add('country', data.countries);
  add('language', data.languages);
  add('device', data.devices);
  add('browser', data.browsers);
  add('os', data.os);
  add('utm_source', data.utm.source);
  add('utm_medium', data.utm.medium);
  add('utm_campaign', data.utm.campaign);
  return lines.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function download(name, text) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* -------------------------------- Dialog -------------------------------- */

/** @param {{ open: boolean, onClose: () => void }} props */
export default function StatsDialog({ open, onClose }) {
  const { page } = useEditor();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [table, setTable] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setError(null);
    api
      .getStats(days)
      .then((d) => live && setData(d))
      .catch((err) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, [open, days, reload]);

  useEffect(() => {
    if (!open) setConfirmReset(false);
  }, [open]);

  const reset = async () => {
    try {
      await api.resetStats();
      setConfirmReset(false);
      setReload((n) => n + 1);
    } catch (err) {
      setError(err.message);
    }
  };

  const views = data?.totals.views || 0;
  const clicks = data?.totals.clicks || 0;
  const places = useMemo(() => {
    if (!data) return [];
    return data.geo ? data.countries.map((r) => ({ ...r, label: safeName(regionNames, r.key) })) : data.languages.map((r) => ({ ...r, label: safeName(languageNames, r.key) }));
  }, [data]);

  return (
    <Modal open={open} onClose={onClose} title="Statistics" className="modal--stats">
      <div className="stats-filters">
        <div className="segmented" role="group" aria-label="Period">
          {RANGES.map(([value, label]) => (
            <button key={value} type="button" className={days === value ? 'is-active' : ''} aria-pressed={days === value} onClick={() => setDays(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {page.settings.analytics === false && (
        <p className="stats-note">Counting is switched off in Settings → Statistics, so no new visits are being recorded.</p>
      )}
      {error && <p className="field__error">{error}</p>}
      {!data && !error && <p className="field__help">Loading…</p>}

      {data && (
        <>
          <div className="stats-tiles">
            <div className="stats-tile">
              <span>Views</span>
              <b>{nf.format(views)}</b>
            </div>
            <div className="stats-tile">
              <span>Visitors</span>
              <b>{nf.format(data.totals.visitors)}</b>
            </div>
            <div className="stats-tile">
              <span>Clicks</span>
              <b>{nf.format(clicks)}</b>
            </div>
            <div className="stats-tile">
              <span>Click rate</span>
              <b>{pct(clicks, views)}</b>
            </div>
          </div>

          <section className="stats-panel">
            <div className="stats-panel__head">
              <h3>Per day</h3>
              <ul className="stats-legend" aria-label="Legend">
                {SERIES.map((s) => (
                  <li key={s.key}>
                    <i className={`stats-swatch ${s.className}`} /> {s.label}
                  </li>
                ))}
              </ul>
              <button type="button" className="button button--secondary stats-panel__toggle" onClick={() => setTable((t) => !t)} aria-pressed={table}>
                {table ? 'Show chart' : 'Show table'}
              </button>
            </div>
            {table ? (
              <div className="stats-table-wrap">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th scope="col">Day</th>
                      <th scope="col">Views</th>
                      <th scope="col">Visitors</th>
                      <th scope="col">Clicks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.daily].reverse().map((d) => (
                      <tr key={d.date}>
                        <th scope="row">{dayLabel(d.date, true)}</th>
                        <td>{nf.format(d.views)}</td>
                        <td>{nf.format(d.visitors)}</td>
                        <td>{nf.format(d.clicks)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <LineChart daily={data.daily} />
            )}
          </section>

          <div className="stats-grid">
            <BarList
              title="Top cards"
              rows={data.tiles.slice(0, 12).map((r) => ({ ...r, label: r.title }))}
              empty="No clicks yet"
              extra={(r) => (views ? `· ${pct(r.count, views)} of views` : '')}
            />
            {data.shortLinks?.length > 0 && <BarList title="Short links" rows={data.shortLinks.map((r) => ({ ...r, label: `/${r.key}` }))} empty="No visits yet" />}
            <BarList title="Referrers" rows={data.referrers} total={views} empty="No referring sites yet (direct visits aren’t listed)" />
            <BarList title={data.geo ? 'Countries' : 'Languages'} rows={places} total={views} />
            <BarList title="Devices" rows={data.devices} total={views} />
            <BarList title="Browsers" rows={data.browsers} total={views} />
            <BarList title="Operating systems" rows={data.os} total={views} />
            <BarList title="Campaigns (utm_source)" rows={data.utm.source} empty="Add ?utm_source=… to the links you share to see them here" />
            <BarList title="Campaign names (utm_campaign)" rows={data.utm.campaign} empty="None yet" />
          </div>

          {!data.geo && (
            <p className="field__help">
              Countries appear when your proxy tells the server where visitors are (Cloudflare does this automatically; see “Statistics” in the deployment guide). Until then,
              browser languages are shown.
            </p>
          )}

          <div className="stats-actions">
            <button type="button" className="button button--secondary" onClick={() => download(`trellis-stats-${days}d-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(data))}>
              Export CSV
            </button>
            {confirmReset ? (
              <span className="stats-confirm">
                Delete all statistics?
                <button type="button" className="button button--danger" onClick={reset}>
                  Delete
                </button>
                <button type="button" className="button button--secondary" onClick={() => setConfirmReset(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" className="button button--secondary" onClick={() => setConfirmReset(true)}>
                Reset statistics
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
