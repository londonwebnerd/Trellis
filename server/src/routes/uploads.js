/**
 * Uploads: POST /api/uploads (admin only): images, and PDFs for file
 * download cards (CVs, menus, press kits; up to 10 MB).
 *
 * The client sends the raw file as the request body with its image
 * Content-Type, so no multipart parser (multer etc.) is needed. The file type
 * is decided by sniffing the first bytes, never by the client's header or
 * filename, and SVG is deliberately not accepted (it can carry scripts).
 * ICO is accepted for favicons.
 *
 * Private metadata (GPS location, camera, dates) is removed before saving
 * (lib/imageMeta.js). Files are stored in DATA_DIR/uploads with random names
 * and served from /uploads/<name>.
 */
import express, { Router } from 'express';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import { requireAuth } from '../lib/auth.js';
import { config, dataPath } from '../config.js';
import { stripImageMetadata } from '../lib/imageMeta.js';

const router = Router();

/** Detect image type from magic bytes. Returns a file extension or null. */
function sniffImage(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 6).toString('ascii').startsWith('GIF8')) return 'gif';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buf.subarray(4, 12).toString('ascii').match(/^ftyp(avif|avis)/)) return 'avif';
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return 'ico'; // favicons
  return null;
}

/** PDF documents start with "%PDF-". */
const isPdf = (buf) => buf.length > 8 && buf.subarray(0, 5).toString('latin1') === '%PDF-';

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

router.post(
  '/',
  requireAuth,
  express.raw({ type: (req) => /^(image\/|application\/pdf)/i.test(req.get('Content-Type') || ''), limit: Math.max(config.maxUploadBytes, MAX_PDF_BYTES) }),
  async (req, res) => {
    const body = Buffer.isBuffer(req.body) ? req.body : null;
    const ext = body && (isPdf(body) ? 'pdf' : sniffImage(body));
    if (!ext) return res.status(415).json({ error: 'Upload a JPEG, PNG, GIF, WebP, AVIF or ICO image, or a PDF' });
    if (ext !== 'pdf' && body.length > config.maxUploadBytes) return res.status(413).json({ error: 'That image is too large (5 MB at most).' });

    const name = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    await fsp.writeFile(dataPath('uploads', name), ext === 'pdf' ? body : stripImageMetadata(body, ext));
    res.status(201).json({ url: `/uploads/${name}`, size: body.length });
  },
);

export default router;
