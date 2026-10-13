import { useEffect, useId, useRef } from 'react';
import { Icon } from './Icons.jsx';

/**
 * Small modal for visitors (contact form, newsletter on small cards, share
 * sheet, locked-card prompts). Native <dialog>: focus trap, Escape and the
 * backdrop come from the browser; focus goes back to the opener on close.
 *
 * @param {{ open: boolean, onClose: () => void, title: string, children: import('react').ReactNode, className?: string }} props
 */
export default function VisitorDialog({ open, onClose, title, children, className = '' }) {
  const ref = useRef(null);
  const opener = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
    if (!open && opener.current) {
      const el = opener.current;
      opener.current = null;
      if (document.contains(el)) el.focus({ preventScroll: true });
    }
  }, [open]);

  useEffect(() => () => ref.current?.open && ref.current.close(), []);

  return (
    <dialog
      ref={ref}
      className={`visitor-dialog ${className}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <div className="visitor-dialog__inner">
          <header className="visitor-dialog__header">
            <h2 id={titleId} dir="auto">
              {title}
            </h2>
            <button type="button" className="visitor-dialog__close" onClick={onClose} aria-label="Close">
              <Icon name="close" size={18} />
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}
