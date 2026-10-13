/**
 * Short links (editor only; the redirects themselves are in index.js).
 *
 *   GET    /api/shortlinks          all links with their click counts
 *   POST   /api/shortlinks          { slug, url, note }
 *   PUT    /api/shortlinks/:slug    { slug?, url?, note? }
 *   DELETE /api/shortlinks/:slug
 */
import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { addShortLink, deleteShortLink, listShortLinks, updateShortLink } from '../lib/shortlinks.js';

const router = Router();
router.use(requireAuth, (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/', (req, res) => res.json({ links: listShortLinks() }));

router.post('/', (req, res) => {
  const link = addShortLink(req.body);
  res.status(201).json({ link, links: listShortLinks() });
});

router.put('/:slug', (req, res) => {
  const link = updateShortLink(req.params.slug, req.body);
  if (!link) return res.status(404).json({ error: 'That short link no longer exists.' });
  res.json({ link, links: listShortLinks() });
});

router.delete('/:slug', (req, res) => {
  if (!deleteShortLink(req.params.slug)) return res.status(404).json({ error: 'That short link no longer exists.' });
  res.json({ links: listShortLinks() });
});

export default router;
