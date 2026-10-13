/**
 * Image optimisation before upload, done in the browser (no native image
 * library needed on the server).
 *
 * Photos are decoded (which also applies the camera's rotation), optionally
 * cropped, scaled down to a size that suits where they're used, and saved
 * as WebP (JPEG/PNG where the browser can't write WebP). Re-encoding also
 * drops every bit of metadata (GPS, camera, dates). The server still checks
 * and cleans whatever it receives (server/src/lib/imageMeta.js).
 *
 * GIFs (may be animated), ICO and SVG files are uploaded unchanged.
 */

/** Where an image is used: longest side in pixels, crop shape, format. */
export const IMAGE_PURPOSES = {
  avatar: { max: 640, aspect: 1, crop: true },
  tile: { max: 1600, aspect: null, crop: true },
  thumb: { max: 320, aspect: 1, crop: true },
  share: { max: 1200, aspect: 1200 / 630, crop: true, exact: [1200, 630] },
  background: { max: 2560, aspect: null, crop: false },
  favicon: { max: 256, aspect: 1, crop: false, png: true },
};

const PASS_THROUGH = /^image\/(gif|x-icon|vnd\.microsoft\.icon|svg\+xml)$/;

/** True if this file is re-encoded (and can be cropped) before upload. */
export const canProcess = (file) => /^image\//.test(file.type) && !PASS_THROUGH.test(file.type);

/** Decode a file to an ImageBitmap, upright. */
export async function decode(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This browser can’t read that image. Try a JPEG, PNG or WebP (iPhone HEIC photos: share them as JPEG).');
  }
}

function canvasToBlob(canvas, type, quality) {
  if (canvas.convertToBlob) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save the image'))), type, quality));
}

/** Does the bitmap have see-through pixels? (Sampled, on a small copy.) */
function hasAlpha(bitmap) {
  const w = Math.min(64, bitmap.width);
  const h = Math.min(64, bitmap.height);
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
  return false;
}

/**
 * Crop, scale and re-encode an image.
 *
 * @param {File} file
 * @param {keyof IMAGE_PURPOSES} purpose
 * @param {{ x: number, y: number, w: number, h: number } | null} [crop] in source pixels
 * @returns {Promise<File | Blob>} the file to upload (the original if that's smaller and needs no change)
 */
export async function processImage(file, purpose = 'tile', crop = null) {
  if (!canProcess(file)) return file;
  const spec = IMAGE_PURPOSES[purpose] || IMAGE_PURPOSES.tile;
  const bitmap = await decode(file);
  try {
    const src = crop || { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
    let [w, h] = spec.exact || [src.w, src.h];
    if (!spec.exact) {
      const scale = Math.min(1, spec.max / Math.max(src.w, src.h));
      w = Math.max(1, Math.round(src.w * scale));
      h = Math.max(1, Math.round(src.h * scale));
    }
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, src.x, src.y, src.w, src.h, 0, 0, w, h);

    let blob;
    if (spec.png) blob = await canvasToBlob(canvas, 'image/png');
    else {
      blob = await canvasToBlob(canvas, 'image/webp', 0.86);
      // Some browsers can't write WebP and quietly return PNG instead.
      if (blob.type !== 'image/webp') blob = hasAlpha(bitmap) ? await canvasToBlob(canvas, 'image/png') : await canvasToBlob(canvas, 'image/jpeg', 0.88);
    }
    // Nothing to crop or shrink and the original is already smaller: keep it
    // (the server still removes its metadata).
    const unchanged = !crop && !spec.exact && w === bitmap.width && h === bitmap.height;
    if (unchanged && file.size <= blob.size && /^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    return blob;
  } finally {
    bitmap.close?.();
  }
}
