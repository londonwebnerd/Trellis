#!/usr/bin/env node
/**
 * Build docs/Trellis-Documentation.pdf from the Markdown guides in docs/.
 *
 *   npm run docs:pdf
 *
 * How it works: the guides are converted to one HTML book (marked), laid
 * out into A4 pages by Paged.js (page numbers, running chapter titles and a
 * contents page with page numbers), and printed to PDF by a headless
 * Chrome/Chromium via playwright-core. Links between guides become links
 * inside the PDF.
 *
 * Needs Google Chrome or Chromium installed. It looks for, in order:
 * the CHROME_PATH environment variable, Playwright's Chromium, then your
 * regular Chrome installation.
 *
 * Re-run it whenever you edit the docs; the release zip includes the PDF.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Marked } from 'marked';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const OUT = path.join(DOCS, 'Trellis-Documentation.pdf');
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/** Chapters, in reading order. `intro` is taken from the root README. */
const PARTS = [
  { title: 'Using Trellis', docs: ['intro', 'getting-started', 'editor-guide', 'cards', 'design', 'customising', 'site-settings', 'visitors', 'privacy-and-crawlers'] },
  { title: 'Running Trellis', docs: ['deployment', 'configuration', 'data-and-backups', 'multiple-sites', 'security', 'troubleshooting'] },
  { title: 'Changing Trellis', docs: ['development'] },
];

const GITHUB_SLUG = (text) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Markdown source for a chapter. */
function source(doc) {
  if (doc !== 'intro') return fs.readFileSync(path.join(DOCS, `${doc}.md`), 'utf8');
  // Intro = the README's "What it is" and "Features" sections.
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const start = readme.indexOf('## What it is');
  const end = readme.indexOf('## Quick start');
  const body = readme
    .slice(start, end)
    .replace(/<p align="center">[\s\S]*?<\/p>/g, '')
    .replace(/^## /gm, '## ');
  return `# Introduction\n\n![A Trellis page](images/page-glacier.jpg)\n\n${body}`;
}

/** Turn a Markdown link target into a link inside the PDF (or keep it external). */
function rewriteHref(href, doc) {
  if (/^(https?:|mailto:)/.test(href)) return href;
  if (href.startsWith('#')) return `#${doc}--${href.slice(1)}`;
  const m = href.match(/^(?:\.\/|docs\/)?([\w-]+)\.md(?:#(.*))?$/);
  if (m) return m[2] ? `#${m[1]}--${m[2]}` : `#${m[1]}`;
  if (/^(?:\.\.\/)?README\.md$/.test(href)) return '#intro';
  return null; // links to repository files: show as plain text
}

/** Render one chapter to HTML with ids that are unique across the book. */
function renderChapter(doc) {
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth, text }) {
        const inner = this.parser.parseInline(tokens);
        if (depth === 1) return `<h1 class="chapter-title" id="${doc}">${inner}</h1>\n`;
        return `<h${depth} id="${doc}--${GITHUB_SLUG(text)}">${inner}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const target = rewriteHref(href, doc);
        if (!target) return `<span class="file-ref">${inner}</span>`;
        const external = !target.startsWith('#');
        return `<a href="${escapeHtml(target)}"${title ? ` title="${escapeHtml(title)}"` : ''}${external ? ' class="external"' : ''}>${inner}</a>`;
      },
      image({ href, text }) {
        const file = path.join(DOCS, href.replace(/^docs\//, ''));
        if (!fs.existsSync(file)) return '';
        return `<figure><img src="${pathToFileURL(file)}" alt="${escapeHtml(text)}"></figure>`;
      },
    },
  });
  return `<section class="chapter" data-doc="${doc}">\n${marked.parse(source(doc))}</section>`;
}

/** The chapter's title (first "# " line). */
const chapterTitle = (doc) => (source(doc).match(/^# (.+)$/m)?.[1] || doc).trim();

function buildHtml() {
  const interDir = path.dirname(require.resolve('@fontsource-variable/inter/package.json', { paths: [path.join(ROOT, 'client')] }));
  const interFile = pathToFileURL(path.join(interDir, 'files', 'inter-latin-wght-normal.woff2'));
  const logo = fs.readFileSync(path.join(ROOT, 'client', 'public', 'favicon.svg'), 'utf8');
  const date = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });

  const toc = PARTS.map(
    (part) => `<li class="toc-part">${part.title}<ol>${part.docs.map((d) => `<li><a href="#${d}">${escapeHtml(chapterTitle(d))}</a></li>`).join('')}</ol></li>`,
  ).join('');

  const body = PARTS.map((part) => part.docs.map(renderChapter).join('\n')).join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Trellis documentation</title>
<style>
@font-face { font-family: 'Inter'; src: url('${interFile}') format('woff2'); font-weight: 100 900; }
:root { --accent: #0a9396; --text: #17181a; --muted: #5d6168; --border: #dfe2e6; --soft: #f4f6f7; }
@page {
  size: A4;
  margin: 20mm 18mm 20mm 18mm;
  @top-left { content: 'Trellis ${version}'; font: 500 8pt Inter, sans-serif; color: #9aa0a6; }
  @top-right { content: string(chapter); font: 500 8pt Inter, sans-serif; color: #9aa0a6; }
  @bottom-center { content: counter(page); font: 500 8.5pt Inter, sans-serif; color: #6b7076; }
}
@page cover { margin: 0; @top-left { content: none; } @top-right { content: none; } @bottom-center { content: none; } }
@page toc { @top-right { content: 'Contents'; } }
html { font-family: Inter, -apple-system, 'Segoe UI', sans-serif; font-size: 9.6pt; line-height: 1.55; color: var(--text); }
body { margin: 0; }
.cover { page: cover; height: 297mm; box-sizing: border-box; padding: 62mm 24mm 24mm; display: flex; flex-direction: column;
  background: linear-gradient(160deg, #e8f7ef 0%, #e3f1f6 55%, #f2ecfb 100%); }
.cover svg { width: 26mm; height: 26mm; }
.cover h1 { font-size: 44pt; letter-spacing: -0.03em; margin: 10mm 0 2mm; line-height: 1; }
.cover .tagline { font-size: 15pt; color: #3b4148; margin: 0; }
.cover .what { font-size: 11pt; color: var(--muted); max-width: 120mm; margin-top: 10mm; }
.cover .meta { margin-top: auto; font-size: 9.5pt; color: var(--muted); }
.toc { page: toc; break-after: page; }
.toc h2 { font-size: 20pt; margin: 0 0 8mm; border: 0; }
.toc ol { list-style: none; padding: 0; margin: 0; }
.toc-part { font-weight: 700; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); margin: 6mm 0 2mm; }
.toc-part ol li { text-transform: none; letter-spacing: 0; font-size: 11pt; font-weight: 500; color: var(--text); padding: 1.6mm 0; border-bottom: 0.5pt solid var(--border); }
.toc a { color: inherit; text-decoration: none; display: flex; }
.toc a::after { content: target-counter(attr(href), page); margin-left: auto; color: var(--muted); font-variant-numeric: tabular-nums; }
.chapter { break-before: page; }
h1.chapter-title { string-set: chapter content(text); font-size: 24pt; letter-spacing: -0.02em; line-height: 1.15; margin: 0 0 6mm; padding-bottom: 4mm; border-bottom: 2pt solid var(--accent); }
h2 { font-size: 14pt; margin: 8mm 0 2.5mm; letter-spacing: -0.01em; break-after: avoid; }
h3 { font-size: 11pt; margin: 6mm 0 2mm; break-after: avoid; }
h4 { font-size: 10pt; margin: 4mm 0 1.5mm; break-after: avoid; }
p, li { orphans: 3; widows: 3; }
p { margin: 0 0 2.6mm; }
ul, ol { margin: 0 0 3mm; padding-left: 5.5mm; }
li { margin: 0.8mm 0; }
a { color: var(--accent); text-decoration: none; }
a.external::after { content: ''; }
.file-ref { font-weight: 500; }
code { font-family: 'JetBrains Mono', 'DejaVu Sans Mono', Menlo, Consolas, monospace; font-size: 0.86em; background: var(--soft); padding: 0.2mm 1mm; border-radius: 1mm; overflow-wrap: anywhere; }
pre { background: #101418; color: #e6edf3; padding: 3.5mm 4mm; border-radius: 2mm; font-size: 8pt; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; break-inside: avoid; margin: 0 0 3.5mm; }
pre code { background: none; padding: 0; color: inherit; font-size: inherit; }
table { width: 100%; border-collapse: collapse; margin: 1mm 0 4mm; font-size: 8.4pt; line-height: 1.45; }
th { text-align: left; font-weight: 650; background: var(--soft); }
th, td { border-bottom: 0.5pt solid var(--border); padding: 1.6mm 2mm; vertical-align: top; }
tr { break-inside: avoid; }
td code, th code { white-space: normal; }
blockquote { margin: 0 0 3mm; padding: 2mm 4mm; border-left: 2pt solid var(--accent); background: var(--soft); color: #33383e; }
figure { margin: 2mm 0 5mm; break-inside: avoid; }
figure img { width: 100%; border-radius: 2mm; border: 0.5pt solid var(--border); }
td figure { margin: 0; }
details { margin: 0 0 3mm; }
summary { font-weight: 600; margin-bottom: 2mm; }
hr { border: 0; border-top: 0.5pt solid var(--border); margin: 6mm 0; }
</style></head>
<body>
<section class="cover">
  ${logo}
  <h1>Trellis</h1>
  <p class="tagline">Your corner of the web, tile by tile.</p>
  <p class="what">A lightweight, self-hosted link-in-bio homepage with a drag-and-drop editor. This book collects every guide: using the editor, designing and customising pages, deploying to your server and changing the code.</p>
  <p class="meta">Documentation for version ${version} · ${date}</p>
</section>
<nav class="toc"><h2>Contents</h2><ol>${toc}</ol></nav>
${body}
</body></html>`;
}

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_BROWSERS_PATH && path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile()) || null;
}

async function main() {
  const executablePath = findBrowser();
  if (!executablePath) throw new Error('No Chrome or Chromium found. Install Google Chrome, or set CHROME_PATH to its executable.');

  const html = buildHtml();
  const tmp = path.join(DOCS, '.docs-book.html');
  const polyfill = path.join(path.dirname(require.resolve('pagedjs')), '..', 'dist', 'paged.polyfill.js');
  fs.writeFileSync(tmp, html.replace('</body>', `<script>window.PagedConfig = { auto: true, after: () => { window.__pagedDone = true; } };</script><script src="${pathToFileURL(polyfill)}"></script></body>`));

  const browser = await chromium.launch({ executablePath });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('[docs:pdf] page error:', e.message));
    await page.goto(pathToFileURL(tmp).href);
    await page.waitForFunction(() => window.__pagedDone === true, null, { timeout: 120_000 });
    await page.pdf({ path: OUT, preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });
    const pages = await page.evaluate(() => document.querySelectorAll('.pagedjs_page').length);
    console.log(`[docs:pdf] Wrote ${path.relative(ROOT, OUT)} (${pages} pages, ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MB)`);
  } finally {
    await browser.close();
    fs.rmSync(tmp, { force: true });
  }
}

main().catch((err) => {
  console.error(`[docs:pdf] ${err.message}`);
  process.exit(1);
});
