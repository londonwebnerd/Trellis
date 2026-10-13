/**
 * Rich text helpers.
 *
 * Rich text is stored as a small subset of HTML. It is never injected with
 * `dangerouslySetInnerHTML`: `renderRichText()` parses it with the browser's
 * own HTML parser (DOMParser, which doesn't run scripts or load images) and
 * rebuilds it as React elements from an allowlist of tags. Everything else is
 * unwrapped to plain text, and links are limited to http(s)/mailto/tel.
 *
 * The server applies the same allowlist when saving (validate.js), so the
 * stored HTML is clean either way.
 */
import { createElement } from 'react';

/** Allowed tags (after aliasing). */
const ALLOWED = new Set(['p', 'br', 'strong', 'em', 'u', 's', 'a', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'code']);

/** Tags the browser's editor may produce, mapped onto allowed ones. */
const ALIASES = { b: 'strong', i: 'em', strike: 's', del: 's', h1: 'h3', h2: 'h3', h5: 'h4', h6: 'h4', div: 'p' };

/** Containers whose content is dropped completely. */
const DROP = new Set(['script', 'style', 'iframe', 'object', 'template', 'svg', 'math', 'head', 'title']);

/** Only allow safe link targets. Returns '' for anything else. */
export function safeHref(href = '') {
  if (typeof href !== 'string') return '';
  const s = href.trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(s)) return `https://${s}`; // "example.com/x"
  return '';
}

/** safeHref for an <a href>: '#' when the address isn't allowed. */
export const linkHref = (href) => safeHref(href) || '#';

const parse = (html) => new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html').body;

/** Resolve an element to an allowed tag name, or null to unwrap it. */
function tagOf(el) {
  const raw = el.tagName.toLowerCase();
  const tag = ALIASES[raw] || raw;
  return ALLOWED.has(tag) ? tag : null;
}

/* ----------------------------- To React ------------------------------ */

function toReact(node, key) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const raw = node.tagName.toLowerCase();
  if (DROP.has(raw)) return null;

  const children = Array.from(node.childNodes, (child, i) => toReact(child, i));
  const tag = tagOf(node);
  if (!tag) return createElement('span', { key }, ...children);
  if (tag === 'br') return createElement('br', { key });
  if (tag === 'a') {
    const href = safeHref(node.getAttribute('href') || '');
    if (!href) return createElement('span', { key }, ...children);
    const external = /^https?:/i.test(href);
    return createElement('a', { key, href, ...(external && { target: '_blank', rel: 'noopener noreferrer' }) }, ...children);
  }
  return createElement(tag, { key }, ...children);
}

/**
 * Render stored rich-text HTML as React elements.
 * @param {string} html
 * @returns {import('react').ReactNode[]}
 */
export function renderRichText(html) {
  return Array.from(parse(html).childNodes, (node, i) => toReact(node, i));
}

/* --------------------------- To clean HTML --------------------------- */

const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Blocks that can't contain another paragraph (nested ones are unwrapped). */
const TEXT_BLOCKS = new Set(['p', 'h3', 'h4', 'li']);
/** Block-level tags in the allowed subset. */
const BLOCKS = new Set(['p', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote']);
/** Inline formatting that must never wrap a block (browsers' bold-across-lines does that). */
const INLINE = new Set(['strong', 'em', 'u', 's', 'code', 'a']);

/** Does this element contain a block-level element (after aliasing)? */
const containsBlock = (el) => Array.from(el.querySelectorAll('*')).some((d) => BLOCKS.has(tagOf(d)));

function toHtml(node, parentTag = null) {
  if (node.nodeType === Node.TEXT_NODE) return escapeText(node.nodeValue);
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const raw = node.tagName.toLowerCase();
  if (DROP.has(raw)) return '';
  let tag = tagOf(node);
  if (tag === 'p' && TEXT_BLOCKS.has(parentTag)) tag = null; // e.g. <p><p>…</p></p>
  // <strong><p>…</p></strong>: keep the paragraphs, drop the wrapper.
  if (INLINE.has(tag) && containsBlock(node)) tag = null;
  const inner = Array.from(node.childNodes, (child) => toHtml(child, tag || parentTag)).join('');
  if (!tag) return inner;
  if (tag === 'br') return '<br>';
  // Bold/italic around nothing but spaces is just the spaces.
  if (INLINE.has(tag) && tag !== 'a' && !/\S/.test(node.textContent || '')) return inner;
  if (tag === 'a') {
    const href = safeHref(node.getAttribute('href') || '');
    return href ? `<a href="${href.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">${inner}</a>` : inner;
  }
  return `<${tag}>${inner}</${tag}>`;
}

/**
 * Content as a list of blocks: loose text and inline formatting between
 * blocks is wrapped in its own paragraph. Inline formatting that wraps blocks
 * (what bold-across-lines produces: <strong><p>…</p></strong>) is moved
 * inside each paragraph instead, so the text stays bold.
 */
function blocksToHtml(nodes, wrap = []) {
  const open = wrap.map((t) => `<${t}>`).join('');
  const close = [...wrap].reverse().map((t) => `</${t}>`).join('');
  let out = '';
  let loose = '';
  const flush = () => {
    if (/\S|<br>/.test(loose.replace(/<\/?(strong|em|u|s|code)>/g, ''))) out += `<p>${open}${loose}${close}</p>`;
    loose = '';
  };
  for (const node of nodes) {
    const el = node.nodeType === Node.ELEMENT_NODE ? node : null;
    if (el && DROP.has(el.tagName.toLowerCase())) continue;
    const tag = el && tagOf(el);
    if (el && (!tag || (INLINE.has(tag) && tag !== 'a')) && containsBlock(el)) {
      // Unknown wrapper or formatting around blocks: look inside.
      flush();
      out += blocksToHtml(Array.from(el.childNodes), tag && !wrap.includes(tag) ? [...wrap, tag] : wrap);
    } else if (tag && BLOCKS.has(tag)) {
      flush();
      const html = toHtml(el);
      out += wrap.length && TEXT_BLOCKS.has(tag) && tag !== 'li' ? html.replace(/^<(\w+)>([\s\S]*)<\/\1>$/, (m, t, inner) => (/\S/.test(inner.replace(/<[^>]+>/g, '')) ? `<${t}>${open}${inner}${close}</${t}>` : m)) : html;
    } else {
      loose += toHtml(node);
    }
  }
  flush();
  return out;
}

/**
 * Cleaned HTML for pasting into the editor: a single pasted paragraph is
 * inserted inline (so it doesn't create a nested block).
 */
export function cleanPastedHtml(html) {
  const clean = cleanRichHtml(html);
  const single = clean.match(/^<p>([\s\S]*)<\/p>$/);
  return single && !single[1].includes('<p>') ? single[1] : clean;
}

/**
 * Normalise editor/pasted HTML down to the allowed subset.
 * @param {string} html
 * @returns {string}
 */
export function cleanRichHtml(html) {
  const out = blocksToHtml(Array.from(parse(html).childNodes))
    // drop empty blocks (including ones holding only a line break)
    .replace(/<(p|h3|h4|li|blockquote)>(<br>)?<\/\1>/g, '');
  // An editor that only contains an empty paragraph/line break is empty.
  return /^(<p>)?(<br>)?(<\/p>)?$/.test(out.trim()) ? '' : out;
}

/** Convert legacy plain text (old Text tiles) into rich-text HTML. */
export const plainTextToHtml = (text = '') =>
  text
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeText(para).replace(/\n/g, '<br>')}</p>`)
    .join('');
