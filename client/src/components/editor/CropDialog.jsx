/**
 * Crop a photo before it's uploaded: drag to move, slider / mouse wheel /
 * pinch to zoom, keyboard arrows and +/- for keyboard users. Returns the
 * chosen rectangle in source pixels (see lib/imageProcess.js).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Modal from './Modal.jsx';

const ASPECTS = [
  ['original', 'Original', null],
  ['square', 'Square', 1],
  ['landscape', '4:3', 4 / 3],
  ['wide', '16:9', 16 / 9],
  ['portrait', '3:4', 3 / 4],
];

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/**
 * @param {{
 *   bitmap: ImageBitmap | null,
 *   url: string,
 *   aspect: number | null,          fixed shape, or null to let the user choose
 *   title?: string,
 *   onCancel: () => void,
 *   onConfirm: (crop: { x: number, y: number, w: number, h: number } | null) => void,
 * }} props
 */
export default function CropDialog({ bitmap, url, aspect: fixedAspect, title = 'Crop photo', onCancel, onConfirm }) {
  const [choice, setChoice] = useState('original');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [vw, setVw] = useState(0);
  const box = useRef(null);
  const drag = useRef(null);
  const pointers = useRef(new Map());

  const iw = bitmap?.width || 1;
  const ih = bitmap?.height || 1;
  const aspect = fixedAspect || ASPECTS.find(([k]) => k === choice)[2] || iw / ih;

  // Viewport: as wide as the dialog allows, never taller than 60% of the screen.
  useLayoutEffect(() => {
    const el = box.current?.parentElement;
    if (!el) return undefined;
    const measure = () => setVw(Math.max(80, Math.min(el.clientWidth - 24, window.innerHeight * 0.6 * aspect)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect, bitmap]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [aspect, bitmap]);

  const vh = vw / aspect;
  const scale = Math.max(vw / iw, vh / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const maxX = Math.max(0, (dw - vw) / 2);
  const maxY = Math.max(0, (dh - vh) / 2);
  const px = clamp(pan.x, -maxX, maxX);
  const py = clamp(pan.y, -maxY, maxY);
  const left = (vw - dw) / 2 + px;
  const top = (vh - dh) / 2 + py;

  const setZoomClamped = (z) => setZoom(clamp(z, 1, 5));

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current = { x: e.clientX, y: e.clientY, pan: { x: px, y: py }, zoom, dist: null };
  };
  const onPointerMove = (e) => {
    if (!drag.current || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      // Pinch to zoom.
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      drag.current.dist ??= dist;
      setZoomClamped((drag.current.zoom * dist) / drag.current.dist);
      return;
    }
    setPan({ x: drag.current.pan.x + e.clientX - drag.current.x, y: drag.current.pan.y + e.clientY - drag.current.y });
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) drag.current = null;
    else drag.current = { ...drag.current, x: e.clientX, y: e.clientY, pan: { x: px, y: py }, zoom, dist: null };
  };
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 40 : 10;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      setPan({ x: px + moves[e.key][0], y: py + moves[e.key][1] });
    } else if (e.key === '+' || e.key === '=') setZoomClamped(zoom + 0.1);
    else if (e.key === '-') setZoomClamped(zoom - 0.1);
  };

  // Mouse wheel zoom (non-passive so the dialog doesn't scroll instead).
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08), 1, 5));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [bitmap]);

  const confirm = () => {
    const full = !fixedAspect && choice === 'original' && zoom === 1;
    if (full) return onConfirm(null);
    onConfirm({
      x: Math.round(clamp(-left / scale, 0, iw)),
      y: Math.round(clamp(-top / scale, 0, ih)),
      w: Math.round(Math.min(iw, vw / scale)),
      h: Math.round(Math.min(ih, vh / scale)),
    });
  };

  return (
    <Modal
      open={Boolean(bitmap)}
      onClose={onCancel}
      title={title}
      className="modal--crop"
      footer={
        <>
          <button type="button" className="button button--secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="button button--primary" onClick={confirm}>
            Use photo
          </button>
        </>
      }
    >
      {!fixedAspect && (
        <div className="segmented crop__aspects" role="group" aria-label="Shape">
          {ASPECTS.map(([key, label]) => (
            <button key={key} type="button" className={choice === key ? 'is-active' : ''} aria-pressed={choice === key} onClick={() => setChoice(key)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="crop__stage">
        <div
          ref={box}
          className="crop__viewport"
          style={{ width: vw, height: vh }}
          tabIndex={0}
          role="application"
          aria-label="Photo crop area. Drag or use the arrow keys to move, plus and minus to zoom."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >
          {url && <img src={url} alt="" draggable={false} style={{ width: dw, height: dh, transform: `translate(${left}px, ${top}px)` }} />}
          <span className="crop__grid" aria-hidden="true" />
        </div>
      </div>
      <label className="field crop__zoom">
        <span className="field__label">Zoom</span>
        <input type="range" min="1" max="5" step="0.01" value={zoom} onChange={(e) => setZoomClamped(Number(e.target.value))} />
      </label>
      <p className="field__help">The photo is resized and saved as a light WebP file, without its location and camera details.</p>
    </Modal>
  );
}
