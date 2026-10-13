/**
 * Draft, publishing and version history (editor only):
 *
 *   GET  /api/draft                 the working copy + whether it's published
 *   PUT  /api/draft                 autosave the working copy (validated)
 *   POST /api/draft/publish         make the working copy live
 *   POST /api/draft/discard         throw away unpublished changes
 *   GET  /api/draft/revision        the working copy's revision (cheap check)
 *   GET  /api/versions              history list (newest first)
 *   GET  /api/versions/:id          one snapshot (validated, for preview/restore)
 *
 * Restoring is done in the editor: it loads a snapshot into the draft like
 * any other edit (so it can be undone) and then publishes when you're ready.
 * Before handing a snapshot out for restoring, the current draft is saved as
 * a "restore" snapshot, so restoring can never lose work either.
 */
import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { ConflictError, discardDraft, draftRevision, getDraft, getPage, hasUnpublishedChanges, publish, saveDraft } from '../lib/store.js';
import { sanitizePage } from '../lib/validate.js';
import { getVersion, listVersions, recordVersion } from '../lib/versions.js';

const router = Router();

/** Every route here is editor-only and never cached. (Applied per route:
 *  this router is mounted on /api, next to public routes.) */
const editorOnly = [
  requireAuth,
  (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  },
];

const status = () => ({ hasChanges: hasUnpublishedChanges(), publishedAt: getPage().updatedAt || null, revision: draftRevision() });

/**
 * Two tabs (or devices) editing at once: the editor sends the revision it
 * last saw in `X-Base-Revision`. If someone saved since, the save is refused
 * with 409 and the current version, and the editor asks what to do instead
 * of silently overwriting. Without the header (scripts, old editors) saves
 * go through as before.
 */
const baseOf = (req) => req.get('X-Base-Revision');

/** Answer a ConflictError with 409 and the current version; anything else goes on. */
function conflictOr(next, res) {
  return (err) => {
    if (!(err instanceof ConflictError)) return next(err);
    res.status(409).json({ error: err.message, code: 'conflict', page: getDraft(), published: getPage(), ...status() });
  };
}

router.get('/draft', editorOnly, (req, res) => {
  // `published` lets the editor tell exactly what's still unpublished.
  res.json({ page: getDraft(), published: getPage(), ...status() });
});

// Cheap check the editor makes when its tab gets focus again.
router.get('/draft/revision', editorOnly, (req, res) => {
  res.json({ revision: draftRevision() });
});

router.put('/draft', editorOnly, async (req, res, next) => {
  try {
    const saved = await saveDraft(sanitizePage(req.body), { base: baseOf(req) });
    // The revision of *this* save (another may already have followed it).
    res.json({ ...status(), revision: saved.updatedAt });
  } catch (err) {
    conflictOr(next, res)(err);
  }
});

router.post('/draft/publish', editorOnly, async (req, res, next) => {
  try {
    // The editor sends its latest page along, so nothing typed in the last
    // moment before clicking "Publish" is left behind.
    const body = req.body && Array.isArray(req.body.tiles) ? sanitizePage(req.body) : undefined;
    const published = await publish(body, { base: baseOf(req) });
    res.json({ ...status(), revision: published.updatedAt });
  } catch (err) {
    conflictOr(next, res)(err);
  }
});

router.post('/draft/discard', editorOnly, async (req, res, next) => {
  try {
    const page = await discardDraft({ base: baseOf(req) });
    res.json({ page, ...status() });
  } catch (err) {
    conflictOr(next, res)(err);
  }
});

router.get('/versions', editorOnly, (req, res) => {
  res.json({ versions: listVersions() });
});

router.get('/versions/:id', editorOnly, (req, res, next) => {
  try {
    const stored = getVersion(req.params.id);
    if (!stored) return res.status(404).json({ error: 'That version no longer exists' });
    if (req.query.restore === '1') recordVersion(getDraft(), 'restore');
    res.json({ page: sanitizePage(stored) });
  } catch (err) {
    next(err);
  }
});

export default router;
