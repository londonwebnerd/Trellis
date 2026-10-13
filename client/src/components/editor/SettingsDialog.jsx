/**
 * Page settings: SEO fields, privacy (search engines / AI crawlers), the
 * "Powered by Trellis" footer, integrations (Instagram) and JSON backup/restore.
 * Colours, backgrounds and fonts live in the Design panel (DesignPanel.jsx).
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { Icon } from '../Icons.jsx';
import { TRELLIS_URL } from '../SiteFooter.jsx';
import { useEditor } from './EditorContext.js';
import FaviconSection from './FaviconSection.jsx';
import IntegrationsSection from './IntegrationsSection.jsx';
import Modal from './Modal.jsx';
import SiteNameSection from './SiteNameSection.jsx';
import { ImageField } from './TileEditor.jsx';

const MAX_BACKUP_BYTES = 2 * 1024 * 1024;

/** Offer the page as a JSON file download. */
function downloadJson(page) {
  const blob = new Blob([JSON.stringify(page, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `trellis-backup-${new Date().toISOString().slice(0, 10)}.json`,
  });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const ago = (iso) => {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return new Date(iso).toLocaleDateString([], { dateStyle: 'medium' });
};
const mb = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Status of the server's automatic backups, and "Back up now". */
function ServerBackups({ open }) {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) api.getBackups().then(setInfo, () => setInfo(null));
  }, [open]);
  if (!info) return null;
  const latest = info.backups[0];
  const offsite = [info.copyDir && 'a second folder', info.s3 && 'S3 storage'].filter(Boolean).join(' and ');
  const now = async () => {
    setBusy(true);
    setError(null);
    try {
      setInfo(await api.backupNow());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const lastFailed = info.last && !info.last.ok;
  const offsiteFailed = info.last && ((info.last.copy && !info.last.copy.ok) || (info.last.s3 && !info.last.s3.ok));
  return (
    <div className="server-backups">
      <p className={`server-backups__status ${lastFailed ? 'is-failed' : ''}`}>
        <Icon name={lastFailed ? 'alert' : 'shield'} size={16} />
        {latest ? (
          <span>
            Last backup {ago(latest.at)} ({mb(latest.size)}), {info.backups.length} kept on the server
            {offsite && `, also copied to ${offsite}`}.
          </span>
        ) : (
          <span>No backups on the server yet.</span>
        )}
      </p>
      {lastFailed && <p className="field__error">The last backup failed: {info.last.error}</p>}
      {offsiteFailed && <p className="field__error">The off-site copy failed: {info.last.copy?.error || info.last.s3?.error}</p>}
      {error && <p className="field__error">{error}</p>}
      <div className="button-row">
        <button type="button" className="button button--secondary" onClick={now} disabled={busy}>
          {busy ? 'Backing up…' : 'Back up now'}
        </button>
      </div>
      <small className="field__help">
        {info.enabled ? `Everything (page, photos, statistics, inbox, settings) is backed up every night at ${info.time}, keeping the last ${info.keep}.` : 'Nightly backups are turned off (BACKUP=off).'} To
        restore one, run <code>npm run restore</code> on the server.
      </small>
    </div>
  );
}

/** @param {{ open: boolean, onClose: () => void }} props */
export default function SettingsDialog({ open, onClose }) {
  const { page, actions } = useEditor();
  const { settings } = page;
  const fileInput = useRef(null);
  const [importError, setImportError] = useState(null);

  const set = (name) => (value) => actions.updateSettings({ [name]: value }, name);

  const importJson = async (file) => {
    setImportError(null);
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('That file is too large to be a Trellis backup.');
      let data;
      try {
        data = JSON.parse(await file.text());
      } catch {
        throw new Error('That file isn’t valid JSON.');
      }
      if (!data || typeof data !== 'object' || !Array.isArray(data.tiles) || !data.profile) throw new Error('That file isn’t a Trellis backup.');
      // The server cleans it with the same rules as a save, so a damaged or
      // hand-edited file can't break the editor.
      actions.replacePage(await api.validatePage(data));
      onClose();
    } catch (err) {
      setImportError(err.message);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Page settings">
      <div className="form">
        <SiteNameSection />

        <div className="field">
          <label htmlFor="share-image">Link preview image</label>
          <ImageField id="share-image" value={settings.shareImage || ''} onChange={set('shareImage')} purpose="share" />
          <small className="field__help">
            Shown when your link is shared on WhatsApp, iMessage, LinkedIn, X, Slack… (1200 × 630). Without one, your profile photo is used.
          </small>
        </div>

        <FaviconSection />

        <div className="field">
          <span className="field__label">Privacy</span>
          <label className="field field--checkbox privacy-option">
            <input type="checkbox" checked={settings.noindex === true} onChange={(e) => set('noindex')(e.target.checked)} />
            <span>
              Hide from search engines and all crawlers
              <small>
                Google, Bing, DuckDuckGo and every other search engine, SEO tools, web archives, AI bots and automated scripts are told not to index the page and are
                refused (403). People visiting with a normal browser are unaffected.
              </small>
            </span>
          </label>
          {settings.noindex && (
            <label className="field field--checkbox privacy-option privacy-option--nested">
              <input type="checkbox" checked={settings.allowPreviews === true} onChange={(e) => set('allowPreviews')(e.target.checked)} />
              <span>
                Still allow link previews in chat apps
                <small>Lets iMessage, WhatsApp, Slack, Discord, Telegram and social networks show a preview card when someone shares your link. They don’t index the page.</small>
              </span>
            </label>
          )}
          <label className="field field--checkbox privacy-option">
            <input type="checkbox" checked={settings.blockAI === true} onChange={(e) => set('blockAI')(e.target.checked)} />
            <span>
              Block AI crawlers and assistants
              <small>
                Opts out of AI training and AI search (OpenAI, Anthropic, Google AI, Perplexity, Meta, Common Crawl…) and refuses requests from their bots. Already
                included when the page is hidden from all crawlers.
              </small>
            </span>
          </label>
          <small className="field__help">
            Applied through robots.txt, page tags, response headers and by refusing bots outright, and takes effect when you publish. The editor itself is always hidden from all crawlers. Reputable crawlers respect these signals; nothing can stop a scraper that disguises itself. Pages already indexed disappear from results as engines re-crawl them.
          </small>
        </div>

        <div className="field">
          <span className="field__label">Statistics</span>
          <label className="field field--checkbox privacy-option">
            <input type="checkbox" checked={settings.analytics !== false} onChange={(e) => set('analytics')(e.target.checked)} />
            <span>
              Count visits and clicks
              <small>
                Counted by your own server: no cookies, no Google, no IP addresses stored, so no cookie banner is needed. Visitors whose browser asks not to be tracked are
                skipped, and so are you while signed in. See them under More → Statistics.
              </small>
            </span>
          </label>
          <label className="field field--checkbox privacy-option">
            <input type="checkbox" checked={settings.utmTags === true} onChange={(e) => set('utmTags')(e.target.checked)} />
            <span>
              Tag outgoing links
              <small>Adds utm_source=your-site and utm_medium=link-in-bio to links to other sites, so their own statistics show the visits came from you.</small>
            </span>
          </label>
        </div>

        <div className="field">
          <span className="field__label">Visitors</span>
          <label className="field field--checkbox privacy-option">
            <input type="checkbox" checked={settings.embedConsent !== false} onChange={(e) => set('embedConsent')(e.target.checked)} />
            <span>
              Load videos, players and maps only after a click
              <small>
                Embedded YouTube, Spotify, maps and similar players show a preview with a “Load” button, so nothing is sent to those companies until the visitor agrees.
                Recommended in the EU (GDPR). Visitors can choose to remember their choice.
              </small>
            </span>
          </label>
          <label className="field field--checkbox privacy-option">
            <input type="checkbox" checked={settings.shareButton !== false} onChange={(e) => set('shareButton')(e.target.checked)} />
            <span>
              Show a share button
              <small>A small button in the corner to copy the page link or show a QR code.</small>
            </span>
          </label>
        </div>

        <div className="field">
          <span className="field__label">Footer</span>
          <label className="field field--checkbox privacy-option">
            <input type="checkbox" checked={settings.showPoweredBy !== false} onChange={(e) => set('showPoweredBy')(e.target.checked)} />
            <span>
              Show “Powered by Trellis”
              <small>A small credit with a link to {TRELLIS_URL.replace('https://', '')} at the bottom of the page. Turn it off for a completely unbranded page.</small>
            </span>
          </label>
        </div>

        <IntegrationsSection />

        <div className="field">
          <span className="field__label">Backup</span>
          <ServerBackups open={open} />
          <div className="button-row">
            <button type="button" className="button button--secondary" onClick={() => downloadJson(page)}>
              <Icon name="download" size={16} /> Export JSON
            </button>
            <button type="button" className="button button--secondary" onClick={() => fileInput.current.click()}>
              <Icon name="upload" size={16} /> Import JSON
            </button>
            <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files[0] && importJson(e.target.files[0])} />
          </div>
          {importError && <p className="field__error">{importError}</p>}
          <small className="field__help">Export JSON downloads just the page and design (no photos), handy before big changes. Importing replaces the current page; you can undo it with ⌘/Ctrl+Z.</small>
        </div>
      </div>
    </Modal>
  );
}
