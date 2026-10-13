import { lazy, memo, Suspense } from 'react';
import { withAppearanceDefaults } from '../lib/appearance.js';
import { safeHref } from '../lib/richText.js';

// Only the Retro grid backdrop needs this (a canvas engine), so it's loaded
// on demand rather than in every visitor's bundle.
const TronGrid = lazy(() => import('./TronGrid.jsx'));

/** Escape a URL for use inside CSS url("…"). */
const cssUrl = (url) => `url("${url.replace(/["\\\n\r]/g, (c) => encodeURIComponent(c))}")`;

/** Only local uploads or https images (http is upgraded) may be used as backgrounds. */
const safeImage = (src = '') => (typeof src !== 'string' ? '' : /^\/uploads\/[\w.-]+$/.test(src) ? src : /^https?:/i.test(src) ? safeHref(src.replace(/^http:/i, 'https:')) : '');

/** Small seeded random generator so star/orb positions are stable across renders. */
function seeded(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = seeded(42);
const STARS = Array.from({ length: 70 }, () => ({ x: rand() * 100, y: rand() * 100, s: 1 + rand() * 2, d: rand() * 6, t: 2.5 + rand() * 4 }));
const ORBS = Array.from({ length: 14 }, () => ({ x: rand() * 100, s: 24 + rand() * 120, d: -rand() * 30, t: 22 + rand() * 26, o: 0.12 + rand() * 0.25 }));
const FIREFLIES = Array.from({ length: 34 }, () => ({ x: rand() * 100, y: 10 + rand() * 90, s: 3 + rand() * 3, dx: -60 + rand() * 120, dy: -50 + rand() * 100, t: 9 + rand() * 10, d: -rand() * 20 }));
const SNOW = Array.from({ length: 60 }, () => ({ x: rand() * 100, s: 2 + rand() * 5, sway: 10 + rand() * 30, t: 12 + rand() * 16, d: -rand() * 28 }));
const RIPPLES = Array.from({ length: 6 }, (_, i) => ({ x: 10 + rand() * 80, y: 10 + rand() * 80, d: -i * 1.5 }));

/**
 * Wave path spanning two screen widths (viewBox 2000 wide) made of identical
 * 500-unit segments, so sliding it by half its width loops seamlessly.
 */
const WAVE = `M0 60 ${[0, 500, 1000, 1500].map((x) => `C ${x + 125} 20, ${x + 375} 100, ${x + 500} 60`).join(' ')} V 120 H 0 Z`;

/**
 * Animated effect layer. All motion is CSS transform/opacity only (cheap on
 * phones) and switches off for visitors with "reduce motion" enabled.
 */
const Effect = memo(function Effect({ effect, speed }) {
  switch (effect) {
    case 'aurora':
      return (
        <div className="fx fx-aurora">
          <span />
          <span />
          <span />
        </div>
      );
    case 'flow':
      return <div className="fx fx-flow" />;
    case 'orbs':
      return (
        <div className="fx fx-orbs">
          {ORBS.map((o, i) => (
            <span key={i} style={{ left: `${o.x}%`, width: o.s, height: o.s, opacity: o.o, animationDuration: `calc(${o.t}s * var(--fx-speed))`, animationDelay: `${o.d}s` }} />
          ))}
        </div>
      );
    case 'waves':
      return (
        <div className="fx fx-waves">
          {[0, 1, 2].map((i) => (
            <svg key={i} className={`fx-wave fx-wave--${i}`} viewBox="0 0 2000 120" preserveAspectRatio="none">
              <path d={WAVE} />
            </svg>
          ))}
        </div>
      );
    case 'stars':
      return (
        <div className="fx fx-stars">
          {STARS.map((s, i) => (
            <span key={i} style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, animationDelay: `${s.d}s`, animationDuration: `calc(${s.t}s * var(--fx-speed))` }} />
          ))}
          <i className="fx-shooting" />
        </div>
      );
    case 'fireflies':
      return (
        <div className="fx fx-fireflies">
          {FIREFLIES.map((f, i) => (
            <span
              key={i}
              style={{ left: `${f.x}%`, top: `${f.y}%`, width: f.s, height: f.s, '--dx': `${f.dx}px`, '--dy': `${f.dy}px`, '--t': `calc(${f.t}s * var(--fx-speed))`, animationDelay: `${f.d}s` }}
            />
          ))}
        </div>
      );
    case 'snow':
      return (
        <div className="fx fx-snow">
          {SNOW.map((f, i) => (
            <span key={i} style={{ left: `${f.x}%`, width: f.s, height: f.s, opacity: 0.35 + f.s / 10, '--sway': `${f.sway}px`, animationDuration: `calc(${f.t}s * var(--fx-speed))`, animationDelay: `${f.d}s` }} />
          ))}
        </div>
      );
    case 'ripples':
      return (
        <div className="fx fx-ripples">
          {RIPPLES.map((r, i) => (
            <span key={i} style={{ left: `${r.x}%`, top: `${r.y}%`, animationDelay: `calc(${r.d}s * var(--fx-speed))` }} />
          ))}
        </div>
      );
    case 'grid':
      // Neon light-grid floor with light cycles; reacts to taps (TronGrid.jsx).
      return (
        <Suspense fallback={null}>
          <TronGrid speed={speed} />
        </Suspense>
      );
    default:
      return null;
  }
});

/**
 * Fixed, full-viewport layer behind the page: a gradient or photo
 * (optionally blurred and dimmed), an optional dot/grid pattern, and an
 * optional animated effect (aurora, flow, orbs, waves, stars, fireflies,
 * snow, ripples, retro light grid).
 * Renders nothing for the plain background, which is just --bg on <body>.
 *
 * @param {{ appearance: object }} props
 */
export default function PageBackground({ appearance }) {
  const { background: bg } = withAppearanceDefaults(appearance);
  const image = bg.type === 'image' ? safeImage(bg.image) : '';
  const effect = bg.effect || 'none';
  if (bg.type === 'none' && bg.pattern === 'none' && effect === 'none') return null;

  let style = {};
  if (bg.type === 'gradient') style = { backgroundImage: `linear-gradient(${bg.angle}deg, ${bg.color1}, ${bg.color2})` };
  else if (image) style = { backgroundImage: cssUrl(image), filter: bg.blur ? `blur(${bg.blur}px)` : undefined };

  const speed = { slow: 1.7, normal: 1, fast: 0.55 }[bg.speed] || 1;

  return (
    <div className={`page-bg page-bg--${bg.type}`} aria-hidden="true" style={{ '--fx-a': bg.color1, '--fx-b': bg.color2, '--fx-speed': speed }}>
      {(bg.type === 'gradient' || image) && <div className="page-bg__fill" style={style} />}
      {image && bg.dim > 0 && <div className="page-bg__dim" style={{ opacity: bg.dim / 100 }} />}
      <Effect effect={effect} speed={speed} />
      {bg.pattern !== 'none' && <div className={`page-bg__pattern page-bg__pattern--${bg.pattern}`} />}
    </div>
  );
}
