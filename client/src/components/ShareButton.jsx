/**
 * Share button for visitors (Settings → Visitors → "Show a share button"):
 * copy the page link, the phone's share sheet, and a QR code that can be
 * downloaded for flyers, business cards or a slide.
 */
import { useEffect, useState } from 'react';
import { Icon } from './Icons.jsx';
import VisitorDialog from './VisitorDialog.jsx';

/**
 * QR code as an SVG path (one square per dark module), with a quiet zone.
 * The generator is loaded only when the share sheet is opened.
 */
export async function qrSvg(text, { margin = 4 } = {}) {
  const { default: qrcode } = await import('qrcode-generator');
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) if (qr.isDark(y, x)) d += `M${x + margin},${y + margin}h1v1h-1z`;
  const size = n + margin * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

function download(name, href) {
  const a = Object.assign(document.createElement('a'), { href, download: name });
  document.body.append(a);
  a.click();
  a.remove();
}

/** Render the SVG to a 1024 px PNG for people who need a picture file. */
async function downloadPng(svg, name) {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const canvas = Object.assign(document.createElement('canvas'), { width: 1024, height: 1024 });
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, 1024, 1024);
    download(name, canvas.toDataURL('image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** @param {{ title: string }} props */
export default function ShareButton({ title }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/` : '';
  const [svg, setSvg] = useState('');
  useEffect(() => {
    if (open && !svg) qrSvg(url).then(setSvg).catch(() => {});
  }, [open, svg, url]);
  const slug = (title || window.location.hostname).replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'page';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: the link is shown and selectable anyway */
    }
  };

  return (
    <>
      <button type="button" className="share-fab" onClick={() => setOpen(true)} aria-label="Share this page" title="Share">
        <Icon name="share" size={18} />
      </button>
      <VisitorDialog open={open} onClose={() => setOpen(false)} title="Share this page" className="share-dialog">
        <div className="share-dialog__qr" role="img" aria-label={`QR code for ${url}`} dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="share-dialog__url">
          <span dir="ltr">{url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
        </p>
        <div className="share-dialog__actions">
          <button type="button" className="visitor-button" onClick={copy}>
            <Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? 'Copied' : 'Copy link'}
          </button>
          {typeof navigator !== 'undefined' && navigator.share && (
            <button type="button" className="visitor-button visitor-button--secondary" onClick={() => navigator.share({ title, url }).catch(() => {})}>
              <Icon name="share" size={16} /> Share…
            </button>
          )}
        </div>
        <div className="share-dialog__downloads">
          <span>Download QR code:</span>
          <button type="button" className="share-dialog__link" onClick={() => downloadPng(svg, `${slug}-qr.png`)}>
            PNG
          </button>
          <button type="button" className="share-dialog__link" onClick={() => download(`${slug}-qr.svg`, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)}>
            SVG
          </button>
        </div>
      </VisitorDialog>
    </>
  );
}
