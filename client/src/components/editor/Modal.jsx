import { useEffect, useId, useRef } from 'react';
import { Icon } from '../Icons.jsx';

/**
 * Accessible modal built on the native <dialog> element: focus trapping,
 * Esc-to-close and the backdrop come for free from the browser. On top of
 * that it names itself after its title, gives focus back to whatever opened
 * it, and only closes on a backdrop click that also *started* on the
 * backdrop (so selecting text and releasing outside doesn't close it).
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   title: import('react').ReactNode,
 *   children: import('react').ReactNode,
 *   footer?: import('react').ReactNode,
 *   className?: string,
 * }} props
 */
export default function Modal({ open, onClose, title, children, footer, className = '' }) {
  const ref = useRef(null);
  const titleId = useId();
  const opener = useRef(null);
  const downOnBackdrop = useRef(false);
  /** Set when we close the dialog ourselves on unmount: that's not the user closing it. */
  const ignoreNextClose = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
    if (!open) restoreFocus();
  }, [open]);

  // Close properly if the component disappears while open. (React's dev
  // mode also runs this once on mount and then re-opens the dialog; the
  // resulting "close" event must not be mistaken for the user closing it.)
  useEffect(() => {
    const dialog = ref.current;
    return () => {
      if (dialog?.open) {
        ignoreNextClose.current = true;
        dialog.close();
      }
      restoreFocus();
    };
  }, []);

  function restoreFocus() {
    const el = opener.current;
    opener.current = null;
    if (el && el !== document.body && document.contains(el)) requestAnimationFrame(() => el.focus({ preventScroll: true }));
  }

  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-labelledby={titleId}
      onClose={() => {
        if (ignoreNextClose.current) {
          ignoreNextClose.current = false;
          return;
        }
        onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (e.target === ref.current && downOnBackdrop.current) onClose();
        downOnBackdrop.current = false;
      }}
    >
      {open && (
        <div className="modal__inner">
          <header className="modal__header">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          </header>
          <div className="modal__body">{children}</div>
          {footer && <footer className="modal__footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
