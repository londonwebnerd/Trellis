import { createElement, useCallback, useRef, useState } from 'react';
import { api } from '../api/client.js';
import CropDialog from '../components/editor/CropDialog.jsx';
import { canProcess, decode, IMAGE_PURPOSES, processImage } from '../lib/imageProcess.js';

/** Same limit as the server (config.maxUploadBytes), after optimising. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Photos straight from a camera can be big: they're shrunk before upload. */
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

/**
 * Upload an image: optionally crop it (CropDialog), resize and convert it
 * to WebP in the browser (lib/imageProcess.js), then send it to the server
 * and hand back its URL.
 *
 * Render `dialog` somewhere in the component: it's the crop dialog, shown
 * only while the user is cropping.
 *
 * @param {(url: string) => void} onUploaded
 * @param {keyof typeof IMAGE_PURPOSES} [purpose]
 * @returns {{ upload: (file: File) => Promise<void>, uploading: boolean, error: string | null, dialog: import('react').ReactNode }}
 */
export function useImageUpload(onUploaded, purpose = 'tile') {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [crop, setCrop] = useState(null);
  const resolver = useRef(null);
  const spec = IMAGE_PURPOSES[purpose] || IMAGE_PURPOSES.tile;

  /** Show the crop dialog; resolves with a rectangle, null (whole photo) or undefined (cancelled). */
  const askCrop = (bitmap, url) =>
    new Promise((resolve) => {
      resolver.current = resolve;
      setCrop({ bitmap, url });
    });
  const finishCrop = (value) => {
    resolver.current?.(value);
    resolver.current = null;
    setCrop((c) => {
      if (c) URL.revokeObjectURL(c.url);
      c?.bitmap.close?.();
      return null;
    });
  };

  const upload = useCallback(
    async (file) => {
      if (!file) return;
      setError(null);
      const processable = canProcess(file);
      if (file.size > (processable ? MAX_SOURCE_BYTES : MAX_UPLOAD_BYTES)) {
        setError(`That image is larger than ${processable ? 40 : 5} MB. Please choose a smaller one.`);
        return;
      }
      try {
        let rect = null;
        if (processable && spec.crop) {
          const bitmap = await decode(file);
          rect = await askCrop(bitmap, URL.createObjectURL(file));
          if (rect === undefined) return; // cancelled
        }
        setUploading(true);
        const blob = processable ? await processImage(file, purpose, rect) : file;
        if (blob.size > MAX_UPLOAD_BYTES) throw new Error('That image is still larger than 5 MB after optimising. Please choose a smaller one.');
        onUploaded(await api.uploadImage(blob));
      } catch (err) {
        setError(err.message);
      } finally {
        setUploading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onUploaded, purpose],
  );

  const dialog = crop
    ? createElement(CropDialog, {
        bitmap: crop.bitmap,
        url: crop.url,
        aspect: spec.aspect,
        title: purpose === 'avatar' ? 'Crop profile photo' : purpose === 'share' ? 'Crop share image' : 'Crop photo',
        onCancel: () => finishCrop(undefined),
        onConfirm: (rect) => finishCrop(rect),
      })
    : null;

  return { upload, uploading, error, dialog };
}
