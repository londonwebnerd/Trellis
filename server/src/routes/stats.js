/**
 * Statistics.
 *
 *   POST   /api/collect   public: a page view or card click from the live page
 *   GET    /api/stats     editor: totals and breakdowns (?days=7|30|90|365)
 *   DELETE /api/stats     editor: delete all statistics
 *
 * See lib/analytics.js for what is (and isn't) stored.
 */
import express, { Router } from 'express';
import { config } from '../config.js';
import { isAuthenticated, requireAuth } from '../lib/auth.js';
import { recordEvent, resetStats, summary } from '../lib/analytics.js';
import { rateLimit } from '../lib/rateLimit.js';
import { isBot } from '../lib/robots.js';
import { findLiveTile, getDraft, getPage } from '../lib/store.js';

const router = Router();

const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Beacons arrive as text/plain (see client/src/lib/tracking.js). */
function parseBeacon(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  try {
    const parsed = JSON.parse(typeof req.body === 'string' ? req.body : '');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Beacons from other websites are ignored (browsers send Origin on POST).
 * The page's own address is the Host header, the host the proxy forwarded
 * (X-Forwarded-Host, with TRUST_PROXY) or PUBLIC_URL, so statistics still
 * work behind a proxy that doesn't pass the Host header on.
 */
function sameOrigin(req) {
  const origin = req.get('Origin');
  if (!origin) return true;
  let host;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const own = [req.get('Host'), req.get('X-Forwarded-Host') && config.trustProxy ? req.get('X-Forwarded-Host') : null];
  if (config.publicUrl) {
    try {
      own.push(new URL(config.publicUrl).host);
    } catch {
      /* invalid PUBLIC_URL: ignored */
    }
  }
  return own.some((h) => h && h.split(',')[0].trim().toLowerCase() === host);
}

router.post('/collect', express.text({ type: 'text/plain', limit: '4kb' }), rateLimit({ max: 120, windowMs: 60_000, silent: true }), (req, res) => {
  res.set('Cache-Control', 'no-store');
  const body = parseBeacon(req);
  const skip =
    !sameOrigin(req) ||
    getPage().settings?.analytics === false ||
    isBot(req.get('User-Agent'), req.headers) ||
    // The owner looking at their own page isn't a visitor.
    isAuthenticated(req);
  if (!skip) {
    if (body.type === 'view') {
      const utm = body.utm && typeof body.utm === 'object' ? body.utm : {};
      recordEvent(req, {
        type: 'view',
        referrer: str(body.referrer, 2000),
        utm: { source: str(utm.source, 80), medium: str(utm.medium, 80), campaign: str(utm.campaign, 80) },
      });
    } else if (body.type === 'click' && typeof body.tile === 'string' && findLiveTile(body.tile)) {
      recordEvent(req, { type: 'click', tile: body.tile });
    }
  }
  res.status(204).end();
});

const RANGES = [7, 30, 90, 365];

router.get('/stats', requireAuth, (req, res) => {
  const days = RANGES.includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const data = summary(days);
  // Name the cards (from the draft, so recently added ones are named too).
  const byId = new Map(getDraft().tiles.map((t) => [t.id, t]));
  data.tiles = data.tiles.map(({ key, count }) => {
    const tile = byId.get(key);
    const d = tile?.data || {};
    return { key, count, type: tile?.type || null, title: tile ? d.title || d.label || d.name || d.text || d.caption || d.handle || d.username || d.channel || d.email || d.url || tile.type : 'Deleted card' };
  });
  data.enabled = getPage().settings?.analytics !== false;
  res.set('Cache-Control', 'no-store').json(data);
});

router.delete('/stats', requireAuth, (req, res) => {
  resetStats();
  res.status(204).end();
});

export default router;
