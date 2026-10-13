import { useEffect, useState } from 'react';
import { backdropOf, cssVars, gradientTone, withAppearanceDefaults } from '../lib/appearance.js';

const query = () => window.matchMedia('(prefers-color-scheme: dark)');

/**
 * Apply the page's theme and appearance to <html>:
 *   - data-theme  ("light" | "dark"; "auto" follows the visitor's OS; a
 *     clearly light or dark gradient background decides it instead)
 *   - data-cards  card style (solid | glass | outline | flat)
 *   - data-anim   animation level (none | subtle | lively)
 *   - data-backdrop  "busy" over an animated effect or photo, else "plain"
 *   - CSS custom properties for accent, colours, radius and font
 *
 * In production the server applies the same values before first paint;
 * this hook keeps them in sync with live edits in the editor.
 *
 * @param {import('../lib/types.js').Settings} settings
 * @returns {'light' | 'dark'} the theme actually in effect
 */
export function useTheme(settings) {
  const [systemDark, setSystemDark] = useState(() => query().matches);

  useEffect(() => {
    const mq = query();
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const appearance = withAppearanceDefaults(settings.appearance);
  // A clearly light or dark gradient decides the theme (see gradientTone).
  const resolved = gradientTone(appearance) || (settings.theme === 'auto' ? (systemDark ? 'dark' : 'light') : settings.theme);
  const vars = cssVars(settings);
  const varsKey = JSON.stringify(vars);
  const backdrop = backdropOf(appearance);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.cards = appearance.cardStyle;
    root.dataset.anim = appearance.animation;
    root.dataset.buttonShape = appearance.buttonShape || 'card';
    root.dataset.buttonFill = appearance.buttonFill || 'card';
    root.dataset.backdrop = backdrop;
    root.dataset.avatar = appearance.avatarEffect || 'auto';
    root.dataset.icons = appearance.iconStyle || 'brand';
    root.dataset.avatarTone = appearance.avatarTone || 'color';
    for (const [name, value] of Object.entries(JSON.parse(varsKey))) {
      if (value) root.style.setProperty(name, value);
      else root.style.removeProperty(name);
    }
  }, [resolved, appearance.cardStyle, appearance.animation, appearance.buttonShape, appearance.buttonFill, appearance.avatarEffect, appearance.iconStyle, appearance.avatarTone, backdrop, varsKey]);

  return resolved;
}
