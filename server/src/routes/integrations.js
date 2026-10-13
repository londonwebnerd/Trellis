/**
 * Integration settings (admin only):
 *   GET    /api/integrations             -> connection status (no secrets)
 *   PUT    /api/integrations/instagram   -> { token } validate + save
 *   DELETE /api/integrations/instagram   -> disconnect
 *   PUT    /api/integrations/newsletter  -> { provider, apiKey, listId } check + save
 *   DELETE /api/integrations/newsletter  -> disconnect
 */
import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { connectInstagram, disconnectInstagram, disconnectNewsletter, getStatus } from '../lib/integrations.js';
import { connectNewsletter } from '../lib/newsletter.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store').json(getStatus());
});

router.put('/instagram', async (req, res) => {
  try {
    res.json(await connectInstagram(req.body?.token));
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

router.delete('/instagram', (req, res) => {
  res.json(disconnectInstagram());
});

router.put('/newsletter', async (req, res) => {
  try {
    res.json(await connectNewsletter(req.body || {}));
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

router.delete('/newsletter', (req, res) => {
  res.json(disconnectNewsletter());
});

export default router;
