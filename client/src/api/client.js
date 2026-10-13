/**
 * Thin wrapper around fetch() for the backend API.
 *
 * Every request sends the session cookie (same origin) and the
 * `X-Requested-With: trellis` header the server requires for writes (CSRF
 * guard). Errors are thrown as ApiError with the HTTP status attached.
 */

export class ApiError extends Error {
  /** `data`: the error response's JSON (e.g. `code`, or the current page on a 409). */
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = data?.code || null;
    this.data = data;
  }
}

/** Fired on window when an API call finds the session has ended. */
export const SESSION_LOST_EVENT = 'trellis:session-lost';

async function request(method, path, { json, body, headers = {} } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      'X-Requested-With': 'trellis',
      ...(json !== undefined && { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : body,
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  // Signed out (session expired or ended elsewhere): let the editor show its
  // sign-in overlay, whichever request noticed it first.
  if (res.status === 401 && path !== '/api/auth/login') window.dispatchEvent(new Event(SESSION_LOST_EVENT));
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data);
  return data;
}

const revisionHeader = (revision) => (revision ? { 'X-Base-Revision': revision } : {});

export const api = {
  /** Public page document. */
  getPage: () => request('GET', '/api/page'),
  /** Save the full page (admin). Returns the sanitised, stored page. */
  savePage: (page) => request('PUT', '/api/page', { json: page }),

  /** The editor's working copy: { page, hasChanges, publishedAt }. */
  getDraft: () => request('GET', '/api/draft'),
  /**
   * Autosave the working copy (doesn't change the live page). `revision` is
   * the one this tab last saw: if someone saved since, it fails with 409.
   */
  saveDraft: (page, revision) => request('PUT', '/api/draft', { json: page, headers: revisionHeader(revision) }),
  /** Make the working copy live (sends the latest page along). */
  publish: (page, revision) => request('POST', '/api/draft/publish', { json: page, headers: revisionHeader(revision) }),
  /** Throw away unpublished changes; returns { page } = the published page. */
  discardDraft: (revision) => request('POST', '/api/draft/discard', { headers: revisionHeader(revision) }),
  /** The working copy's current revision: { revision }. */
  getDraftRevision: () => request('GET', '/api/draft/revision'),
  /** Contact-form messages: { messages, unread }. */
  getInbox: () => request('GET', '/api/inbox'),
  markMessage: (id, read = true) => request('PATCH', `/api/inbox/${encodeURIComponent(id)}`, { json: { read } }),
  deleteMessage: (id) => request('DELETE', `/api/inbox/${encodeURIComponent(id)}`),
  clearInbox: () => request('DELETE', '/api/inbox'),
  /** Address search for map cards: { results: [{ name, lat, lon }] }. */
  geocode: (q) => request('POST', '/api/geocode', { json: { q } }),
  /** Statistics for the last `days` days. */
  getStats: (days) => request('GET', `/api/stats?days=${days}`),
  resetStats: () => request('DELETE', '/api/stats'),
  /** Version history. */
  listVersions: () => request('GET', '/api/versions'),
  getVersion: (id, { forRestore = false } = {}) => request('GET', `/api/versions/${encodeURIComponent(id)}${forRestore ? '?restore=1' : ''}`),

  getSession: () => request('GET', '/api/auth/me'),
  /**
   * The editor path is part of the login: the server rejects logins from
   * anywhere else. With two-step sign-in on, the first try (no code) fails
   * with code "code_required".
   */
  login: (password, code) => request('POST', '/api/auth/login', { json: { password, path: window.location.pathname, ...(code && { code }) } }),

  /** Two-step sign-in, signed-in devices and recent sign-ins. */
  getSecurity: () => request('GET', '/api/auth/security'),
  startTwoFactor: () => request('POST', '/api/auth/2fa/setup'),
  enableTwoFactor: (password, code) => request('POST', '/api/auth/2fa/enable', { json: { password, code } }),
  disableTwoFactor: (password, code) => request('POST', '/api/auth/2fa/disable', { json: { password, code } }),
  newRecoveryCodes: (password) => request('POST', '/api/auth/2fa/recovery', { json: { password } }),
  signOutDevice: (id) => request('DELETE', `/api/auth/sessions/${encodeURIComponent(id)}`),
  signOutOthers: () => request('POST', '/api/auth/sessions/others'),

  /** Server backups: status and "back up now". */
  getBackups: () => request('GET', '/api/backups'),
  backupNow: () => request('POST', '/api/backups'),

  /** Short links (example.com/cv). */
  listShortLinks: () => request('GET', '/api/shortlinks'),
  addShortLink: (link) => request('POST', '/api/shortlinks', { json: link }),
  updateShortLink: (slug, patch) => request('PUT', `/api/shortlinks/${encodeURIComponent(slug)}`, { json: patch }),
  deleteShortLink: (slug) => request('DELETE', `/api/shortlinks/${encodeURIComponent(slug)}`),
  logout: () => request('POST', '/api/auth/logout'),

  /** Upload an image File/Blob; resolves to its public URL. */
  /** Upload a PDF (file cards): { url, size }. */
  uploadFile: (file) => request('POST', '/api/uploads', { body: file, headers: { 'Content-Type': 'application/pdf' } }),
  uploadImage: async (file) => {
    const { url } = await request('POST', '/api/uploads', { body: file, headers: { 'Content-Type': file.type || 'image/*' } });
    return url;
  },

  /** Integration status (no secrets) and Instagram token management (admin). */
  getIntegrations: () => request('GET', '/api/integrations'),
  /** Clean an imported backup with the server's rules (nothing is saved). */
  validatePage: (page) => request('POST', '/api/page/validate', { json: page }),
  /** Clean an imported preset file with the server's rules. */
  validatePreset: (preset) => request('POST', '/api/presets/validate', { json: preset }),
  /** Design presets installed as files on the server (presets/ folder). */
  getServerPresets: () => request('GET', '/api/presets'),
  connectInstagram: (token) => request('PUT', '/api/integrations/instagram', { json: { token } }),
  disconnectInstagram: () => request('DELETE', '/api/integrations/instagram'),
  /** Newsletter service for sign-up cards: { provider, apiKey, listId }. */
  connectNewsletter: (config) => request('PUT', '/api/integrations/newsletter', { json: config }),
  disconnectNewsletter: () => request('DELETE', '/api/integrations/newsletter'),

  /** Live data for feed-capable tiles (Bluesky, Mastodon, Instagram). */
  getFeed: (tileId) => request('GET', `/api/feeds/${encodeURIComponent(tileId)}`),
};
