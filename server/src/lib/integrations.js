/**
 * Third-party integrations configured from the editor: Instagram (live
 * feed) and a newsletter service (sign-up cards, see newsletter.js).
 *
 * Secrets are stored in DATA_DIR/integrations.json (mode 600) and are never
 * sent back to the browser: the API only exposes connection status.
 *
 * Instagram long-lived tokens expire after 60 days but can be refreshed once
 * they're at least 24 hours old, so a timer refreshes a stored token about
 * once a week — once connected, the feed keeps working indefinitely as long
 * as the server is running at least occasionally.
 */
import fs from 'node:fs';
import { config, dataPath } from '../config.js';
import { writeFileAtomicSync } from './files.js';
import { safeFetch } from './safeFetch.js';

const FILE = dataPath('integrations.json');
const GRAPH = 'https://graph.instagram.com';
const DAY = 24 * 60 * 60 * 1000;
const REFRESH_AFTER_MS = 7 * DAY;

/** @type {{ instagram?: { token: string, username: string, refreshedAt: string, expiresAt: string | null } }} */
let store = {};
const listeners = new Set();

function load() {
  try {
    store = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    store = {};
  }
}

function persist() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  writeFileAtomicSync(FILE, JSON.stringify(store, null, 2), 0o600);
  listeners.forEach((fn) => fn());
}

/** Notify (e.g. the feed cache) when an integration changes. */
export const onIntegrationChange = (fn) => listeners.add(fn);

async function graph(path) {
  const res = await safeFetch(`${GRAPH}${path}`, { headers: { Accept: 'application/json' }, timeoutMs: 8000 });
  let body = {};
  try {
    body = JSON.parse(res.body);
  } catch {
    /* keep {} */
  }
  if (!res.ok) throw new Error(body?.error?.message || `Instagram API error ${res.status}`);
  return body;
}

/** Token in use: one connected from the editor wins over the env var. */
export function getInstagramToken() {
  return store.instagram?.token || config.instagramToken || null;
}

/** Public, secret-free status for the editor. */
export function getStatus() {
  const ig = store.instagram;
  return {
    instagram: ig
      ? { connected: true, source: 'settings', username: ig.username, refreshedAt: ig.refreshedAt, expiresAt: ig.expiresAt }
      : { connected: Boolean(config.instagramToken), source: config.instagramToken ? 'env' : null },
    newsletter: store.newsletter
      ? { connected: true, provider: store.newsletter.provider, listId: store.newsletter.listId || '', connectedAt: store.newsletter.connectedAt }
      : { connected: false },
  };
}

/** Newsletter service settings (with the API key), or null. Server-side only. */
export const getNewsletterConfig = () => store.newsletter || null;

/** Save newsletter settings (already validated by newsletter.js). */
export function saveNewsletterConfig(value) {
  store.newsletter = { ...value, connectedAt: new Date().toISOString() };
  persist();
  return getStatus();
}

export function disconnectNewsletter() {
  delete store.newsletter;
  persist();
  return getStatus();
}

/** Validate a token against the API, then save it. */
export async function connectInstagram(token) {
  if (typeof token !== 'string' || token.trim().length < 20) throw Object.assign(new Error('That does not look like an Instagram access token'), { status: 400 });
  const clean = token.trim();
  let me;
  try {
    me = await graph(`/me?fields=user_id,username&access_token=${encodeURIComponent(clean)}`);
  } catch (err) {
    throw Object.assign(new Error(`Instagram rejected the token: ${err.message}`), { status: 400 });
  }
  store.instagram = { token: clean, username: me.username, refreshedAt: new Date().toISOString(), expiresAt: null };
  persist();
  // Refresh straight away so we know the real expiry date (fails harmlessly
  // if the token is less than 24 hours old).
  refreshInstagram().catch(() => {});
  return getStatus();
}

export function disconnectInstagram() {
  delete store.instagram;
  persist();
  return getStatus();
}

/** Exchange the stored long-lived token for a fresh one (another 60 days). */
export async function refreshInstagram() {
  const ig = store.instagram;
  if (!ig) return;
  const res = await graph(`/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(ig.token)}`);
  store.instagram = {
    ...ig,
    token: res.access_token,
    refreshedAt: new Date().toISOString(),
    expiresAt: res.expires_in ? new Date(Date.now() + res.expires_in * 1000).toISOString() : ig.expiresAt,
  };
  persist();
  console.log(`[integrations] Instagram token refreshed for @${ig.username}`);
}

/** Load stored integrations and start the refresh timer. Called at boot. */
export function initIntegrations() {
  load();
  const check = () => {
    const ig = store.instagram;
    if (ig && Date.now() - new Date(ig.refreshedAt).getTime() > REFRESH_AFTER_MS) {
      refreshInstagram().catch((err) => console.warn(`[integrations] Instagram refresh failed: ${err.message}`));
    }
  };
  check();
  setInterval(check, 12 * 60 * 60 * 1000).unref();
}
