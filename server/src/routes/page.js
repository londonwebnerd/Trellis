/**
 * Page routes:
 *   GET /api/page   -> the published page as visitors get it (hidden and
 *                      scheduled cards filtered, lock codes removed)
 *   PUT /api/page   -> replace *and publish* the page in one go (admin only,
 *                      validated). The editor uses /api/draft instead.
 *   POST /api/page/validate -> the cleaned version of a page, without saving
 *                              (the editor checks imported backups with it)
 */
import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { getPublicPage, savePage } from '../lib/store.js';
import { sanitizePage } from '../lib/validate.js';

const router = Router();

router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json(getPublicPage());
});

router.put('/', requireAuth, async (req, res, next) => {
  try {
    const saved = await savePage(sanitizePage(req.body));
    res.json(saved);
  } catch (err) {
    next(err);
  }
});

router.post('/validate', requireAuth, (req, res, next) => {
  try {
    res.json(sanitizePage(req.body));
  } catch (err) {
    next(err);
  }
});

export default router;
