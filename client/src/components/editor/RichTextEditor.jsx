/**
 * Lightweight WYSIWYG editor for rich-text tiles — no editor library needed.
 *
 * It's a contentEditable area driven by the browser's built-in editing
 * commands (bold, lists, links…). After every change the HTML is run
 * through `cleanRichHtml()` so only the allowed subset is ever stored, and
 * pasted content (e.g. from Word or a web page) is cleaned before insertion.
 *
 * Shortcuts: ⌘/Ctrl+B, I, U (built in) and ⌘/Ctrl+K for links.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { cleanPastedHtml, cleanRichHtml, safeHref } from '../../lib/richText.js';
import { Icon } from '../Icons.jsx';

/** Run a built-in editing command. (execCommand is deprecated but remains the only dependency-free way to do this and works in all browsers.) */
const exec = (command, value = null) => document.execCommand(command, false, value);

const INLINE = [
  { cmd: 'bold', icon: 'bold', label: 'Bold (⌘B)' },
  { cmd: 'italic', icon: 'italic', label: 'Italic (⌘I)' },
  { cmd: 'underline', icon: 'underline', label: 'Underline (⌘U)' },
  { cmd: 'strikeThrough', icon: 'strike', label: 'Strikethrough' },
];

const BLOCKS = [
  { block: 'h3', icon: 'h', label: 'Heading' },
  { cmd: 'insertUnorderedList', icon: 'list', label: 'Bulleted list' },
  { cmd: 'insertOrderedList', icon: 'ol', label: 'Numbered list' },
  { block: 'blockquote', icon: 'quote', label: 'Quote' },
];

/**
 * @param {{ value: string, onChange: (html: string) => void, placeholder?: string, id?: string }} props
 */
export default function RichTextEditor({ value, onChange, placeholder, id }) {
  const ref = useRef(null);
  const savedRange = useRef(null);
  const [active, setActive] = useState({});
  const [linkMode, setLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  // Uncontrolled: load the initial value once, then the DOM is the source of
  // truth while typing (re-rendering innerHTML would reset the caret).
  useEffect(() => {
    ref.current.innerHTML = cleanRichHtml(value || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = useCallback(() => onChange(cleanRichHtml(ref.current.innerHTML)), [onChange]);

  /** Highlight toolbar buttons for the formatting at the caret. */
  const refreshActive = useCallback(() => {
    const sel = document.getSelection();
    if (!sel?.anchorNode || !ref.current?.contains(sel.anchorNode)) return;
    const block = String(document.queryCommandValue('formatBlock') || '').toLowerCase();
    setActive({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
      h3: block === 'h3',
      blockquote: block === 'blockquote',
    });
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', refreshActive);
    return () => document.removeEventListener('selectionchange', refreshActive);
  }, [refreshActive]);

  const run = (item) => {
    ref.current.focus();
    exec('defaultParagraphSeparator', 'p');
    if (item.block) exec('formatBlock', active[item.block] ? 'p' : item.block);
    else exec(item.cmd);
    emit();
    refreshActive();
  };

  /* -------------------------------- Links ------------------------------- */

  const openLink = () => {
    const sel = document.getSelection();
    if (sel.rangeCount && ref.current.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange();
    const existing = sel.anchorNode?.parentElement?.closest('a');
    setLinkUrl(existing?.getAttribute('href') || '');
    setLinkMode(true);
  };

  const applyLink = (e) => {
    e?.preventDefault();
    const href = safeHref(linkUrl);
    ref.current.focus();
    const sel = document.getSelection();
    if (savedRange.current) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    if (!href) exec('unlink');
    else if (sel.isCollapsed) exec('insertHTML', `<a href="${href.replace(/"/g, '&quot;')}">${linkUrl.replace(/[<>&]/g, '')}</a>`);
    else exec('createLink', href);
    setLinkMode(false);
    emit();
  };

  /* ---------------------------- Input events ---------------------------- */

  const onPaste = (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    if (html) exec('insertHTML', cleanPastedHtml(html));
    else exec('insertText', e.clipboardData.getData('text/plain'));
    emit();
  };

  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openLink();
    }
  };

  /** Keep the selection when clicking toolbar buttons. */
  const keepSelection = (e) => e.preventDefault();

  return (
    <div className="rte">
      <div className="rte__toolbar" role="toolbar" aria-label="Formatting">
        {[...INLINE, null, ...BLOCKS, null].map((item, i) =>
          item ? (
            <button
              key={item.icon}
              type="button"
              className={`rte__button ${active[item.cmd || item.block] ? 'is-active' : ''}`}
              onMouseDown={keepSelection}
              onClick={() => run(item)}
              title={item.label}
              aria-label={item.label}
              aria-pressed={Boolean(active[item.cmd || item.block])}
            >
              <Icon name={item.icon} size={16} />
            </button>
          ) : (
            <span key={`sep-${i}`} className="rte__sep" />
          ),
        )}
        <button type="button" className="rte__button" onMouseDown={keepSelection} onClick={openLink} title="Link (⌘K)" aria-label="Link">
          <Icon name="link" size={16} />
        </button>
        <button
          type="button"
          className="rte__button"
          onMouseDown={keepSelection}
          onClick={() => run({ cmd: 'removeFormat' })}
          title="Clear formatting"
          aria-label="Clear formatting"
        >
          <Icon name="eraser" size={16} />
        </button>
      </div>

      {linkMode && (
        <div className="rte__link">
          <input
            className="input"
            autoFocus
            placeholder="https://… (leave empty to remove the link)"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyLink(e);
              if (e.key === 'Escape') {
                e.preventDefault(); // close the link box, not the whole dialog
                e.stopPropagation();
                setLinkMode(false);
              }
            }}
          />
          <button type="button" className="button button--primary" onClick={applyLink}>
            Apply
          </button>
        </div>
      )}

      <div
        ref={ref}
        id={id}
        className="rte__content rich-text input"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={emit}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        onKeyUp={refreshActive}
        onMouseUp={refreshActive}
      />
    </div>
  );
}
