/**
 * Small in-memory rate limiter for public endpoints (statistics beacons,
 * unlock codes, contact and newsletter forms).
 *
 * Counts requests per client (IPv4 address, or IPv6 /64) in a fixed window.
 * Memory is bounded: expired windows are dropped first, then the oldest.
 */
import { clientKey } from './auth.js';

const MAX_TRACKED = 20_000;

/**
 * @param {{ max: number, windowMs: number, message?: string, silent?: boolean }} options
 *   silent: answer 204 instead of 429 (for beacons nobody reads the answer of)
 */
export function rateLimit({ max, windowMs, message = 'Too many requests. Please try again later.', silent = false }) {
  const hits = new Map();
  return function limit(req, res, next) {
    const now = Date.now();
    const key = clientKey(req.ip);
    let entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      if (hits.size >= MAX_TRACKED) {
        for (const [k, e] of hits) if (now - e.start > windowMs) hits.delete(k);
        while (hits.size >= MAX_TRACKED) hits.delete(hits.keys().next().value);
      }
      entry = { start: now, count: 0 };
      hits.set(key, entry);
    }
    entry.count += 1;
    // A route can hand the try back (e.g. a form refused for a typo), so
    // fixing a mistake doesn't use up the visitor's allowance.
    const counted = entry;
    req.refundRateLimit = () => {
      if (counted.count > 0) counted.count -= 1;
    };
    if (entry.count > max) {
      if (silent) return res.status(204).end();
      res.set('Retry-After', String(Math.max(1, Math.ceil((entry.start + windowMs - now) / 1000))));
      return res.status(429).json({ error: message, code: 'rate_limited' });
    }
    next();
  };
}
