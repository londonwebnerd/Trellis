import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

/** Results shared across components for the life of the page. */
const cache = new Map();

/** Run `callback` once the tile's card is within 300px of the viewport. */
function whenNearViewport(tileId, callback) {
  const el = document.querySelector(`[data-tile-id="${CSS.escape(tileId)}"]`);
  if (!el || typeof IntersectionObserver === 'undefined') {
    callback();
    return () => {};
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      callback();
    },
    { rootMargin: '300px' },
  );
  observer.observe(el);
  return () => observer.disconnect();
}

/**
 * Load live feed data for a tile from /api/feeds/:id.
 *
 * `version` should change whenever the tile's settings change (the editor
 * passes a JSON string of the tile data) so an edited handle refetches.
 * `delay` lets the editor wait for autosave to reach the server first.
 * Feeds load when their card comes near the viewport, so a long page doesn't
 * fire every request at once.
 *
 * @param {string} tileId
 * @param {{ enabled?: boolean, version?: string, delay?: number }} [options]
 * @returns {{ data: any, error: string | null, loading: boolean }}
 */
export function useFeed(tileId, { enabled = true, version = '', delay = 0 } = {}) {
  const key = `${tileId}:${version}`;
  const [state, setState] = useState(() => cache.get(key) || { data: null, error: null, loading: enabled });

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, error: null, loading: false });
      return undefined;
    }
    if (cache.has(key)) {
      setState(cache.get(key));
      return undefined;
    }
    let cancelled = false;
    let timer;
    setState((s) => ({ ...s, loading: true }));
    const stopWatching = whenNearViewport(tileId, () => {
      timer = setTimeout(() => {
        api
          .getFeed(tileId)
          .then((data) => ({ data, error: null, loading: false }))
          .catch((err) => ({ data: null, error: err.message, loading: false }))
          .then((next) => {
            // The editor (delay > 0) doesn't share results: a fetch can race
            // the autosave and return data for the previous settings.
            if (!next.error && !delay) cache.set(key, next);
            if (!cancelled) setState(next);
          });
      }, delay);
    });
    return () => {
      cancelled = true;
      stopWatching();
      clearTimeout(timer);
    };
  }, [key, tileId, enabled, delay]);

  return state;
}
