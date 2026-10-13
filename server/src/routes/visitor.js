/**
 * Things visitors do on the live page, plus their editor counterparts:
 *
 *   POST   /api/unlock/:tileId          public: reveal a code-locked card ({ code })
 *   POST   /api/forms/:tileId/contact   public: send a contact-form message
 *   POST   /api/forms/:tileId/subscribe public: newsletter sign-up
 *   GET    /api/inbox                   editor: contact messages
 *   PATCH  /api/inbox/:id               editor: { read }
 *   DELETE /api/inbox/:id               editor: delete one message
 *   DELETE /api/inbox                   editor: delete all messages
 *   POST   /api/geocode                 editor: address -> coordinates (map card)
 *
 * Public form endpoints are rate limited, ignore bots, and have a hidden
 * "trellis_hp" field (a honeypot real visitors never fill in).
 */
import crypto from "node:crypto";
import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import {
  addMessage,
  clearMessages,
  deleteMessage,
  listMessages,
  markRead,
} from "../lib/inbox.js";
import { subscribe } from "../lib/newsletter.js";
import { notificationsEnabled, notifyContactMessage } from "../lib/notify.js";
import { rateLimit } from "../lib/rateLimit.js";
import { isBot } from "../lib/robots.js";
import { safeFetchJson } from "../lib/safeFetch.js";
import { findLiveTile, getPage } from "../lib/store.js";
import { siteName } from "../lib/html.js";

const router = Router();

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const text = (v, max) =>
  typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim().slice(0, max) : "";
const noStore = (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
};

/** Same check for every public form: a live card of the right type, a human. */
function liveCard(type) {
  return (req, res, next) => {
    const tile = findLiveTile(req.params.tileId);
    if (!tile || tile.type !== type)
      return res
        .status(404)
        .json({ error: "This form is no longer available." });
    if (isBot(req.get("User-Agent"), req.headers))
      return res
        .status(403)
        .json({ error: "Automated requests are not accepted." });
    req.tile = tile;
    next();
  };
}

/* -------------------------------- Unlock -------------------------------- */

const sameSecret = (a, b) => {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

router.post(
  "/unlock/:tileId",
  noStore,
  rateLimit({
    max: 10,
    windowMs: 15 * 60_000,
    message: "Too many tries. Please wait 15 minutes.",
  }),
  (req, res) => {
    const tile = findLiveTile(req.params.tileId);
    if (!tile || tile.lock?.type !== "code")
      return res.status(404).json({ error: "Not found" });
    const code = text(req.body?.code, 64);
    // Codes are compared ignoring case and surrounding spaces.
    if (
      !code ||
      !sameSecret(code.toLowerCase(), tile.lock.code.trim().toLowerCase())
    )
      return res.status(403).json({ error: "That code isn’t right." });
    res.json({ data: tile.data });
  },
);

/* --------------------------------- Forms -------------------------------- */

const formLimit = rateLimit({
  max: 5,
  windowMs: 10 * 60_000,
  message: "Too many messages. Please try again in a few minutes.",
});

router.post(
  "/forms/:tileId/contact",
  noStore,
  liveCard("contact"),
  formLimit,
  (req, res) => {
    const b = req.body || {};
    // Honeypot filled in: pretend it worked.
    if (text(b.trellis_hp, 200)) return res.status(204).end();
    const name = text(b.name, 100).replace(/\s+/g, " ");
    const email = text(b.email, 200);
    const phone = text(b.phone, 40).replace(/[^\d+\s().-]/g, "");
    const message = text(b.message, 5000);
    // Refused for a typo: the visitor fixes it and tries again, so that
    // attempt doesn't count towards the limit.
    const refuse = (error, field) => {
      req.refundRateLimit?.();
      return res.status(400).json({ error, field });
    };
    if (!name) return refuse("Please enter your name.", "name");
    if (!EMAIL_RE.test(email))
      return refuse("Please enter a valid email address.", "email");
    if (message.length < 2) return refuse("Please write a message.", "message");
    addMessage({ tile: req.tile.id, name, email, phone, message });
    notifyContactMessage(
      { name, email, phone, message },
      { siteName: siteName(getPage()) },
    );
    res.status(204).end();
  },
);

router.post(
  "/forms/:tileId/subscribe",
  noStore,
  liveCard("newsletter"),
  formLimit,
  async (req, res) => {
    const b = req.body || {};
    if (text(b.trellis_hp, 200)) return res.status(204).end();
    const email = text(b.email, 200);
    if (!EMAIL_RE.test(email)) {
      req.refundRateLimit?.();
      return res
        .status(400)
        .json({ error: "Please enter a valid email address.", field: "email" });
    }
    try {
      await subscribe(email, { referrer: req.get("Referer") || "" });
      res.status(204).end();
    } catch (err) {
      res.status(err.status || 502).json({ error: err.message });
    }
  },
);

/* --------------------------------- Inbox -------------------------------- */

router.get("/inbox", requireAuth, noStore, (req, res) =>
  res.json({ ...listMessages(), notifications: notificationsEnabled() }),
);

router.patch("/inbox/:id", requireAuth, noStore, (req, res) => {
  if (!markRead(req.params.id, req.body?.read !== false))
    return res.status(404).json({ error: "Not found" });
  res.json(listMessages());
});

router.delete("/inbox/:id", requireAuth, noStore, (req, res) => {
  if (!deleteMessage(req.params.id))
    return res.status(404).json({ error: "Not found" });
  res.json(listMessages());
});

router.delete("/inbox", requireAuth, noStore, (req, res) => {
  clearMessages();
  res.json(listMessages());
});

/* -------------------------------- Geocode ------------------------------- */

/**
 * Address search for the map card, via OpenStreetMap's Nominatim (their
 * usage policy: identify the app, at most one request a second, cache).
 */
const geocodeCache = new Map();
let lastGeocode = 0;

router.post("/geocode", requireAuth, noStore, async (req, res) => {
  const q = text(req.body?.q, 200);
  if (q.length < 3)
    return res.status(400).json({ error: "Type an address or place name." });
  const key = q.toLowerCase();
  if (geocodeCache.has(key)) return res.json(geocodeCache.get(key));
  const wait = lastGeocode + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeocode = Date.now();
  try {
    const results = await safeFetchJson(
      `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: "jsonv2", limit: "5" })}`,
      {
        headers: {
          "User-Agent":
            "Trellis link-in-bio (self-hosted; https://github.com/londonwebnerd/Trellis)",
          "Accept-Language": req.get("Accept-Language") || "en",
        },
        timeoutMs: 8000,
        maxBytes: 300_000,
      },
    );
    const out = {
      results: (Array.isArray(results) ? results : [])
        .slice(0, 5)
        .map((r) => ({
          name: String(r.display_name || "").slice(0, 200),
          lat: Number(r.lat),
          lon: Number(r.lon),
        }))
        .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon)),
    };
    if (geocodeCache.size > 500) geocodeCache.clear();
    geocodeCache.set(key, out);
    res.json(out);
  } catch (err) {
    res.status(502).json({
      error: `Address search is unavailable right now (${err.message}).`,
    });
  }
});

export default router;
