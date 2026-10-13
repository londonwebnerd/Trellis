/**
 * Entry point for the editor, served at the secret editor URL
 * (lazy-loaded from App.jsx).
 *
 * 1. Checks the session; shows <LoginScreen> if not signed in.
 * 2. Renders the same layout as the public page, but with the editable
 *    profile, the drag-and-drop grid, the toolbar and dialogs.
 * 3. If the session expires while editing, the editor stays open (with all
 *    unsaved changes and undo history) under a sign-in overlay; after signing
 *    in again the pending changes are saved.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, SESSION_LOST_EVENT } from '../../api/client.js';
import { ViewContext } from '../../context/ViewContext.js';
import { usePageEditor } from '../../hooks/usePageEditor.js';
import { useFavicon } from '../../hooks/useFavicon.js';
import { siteName, useDocumentTitle } from '../../hooks/useSiteName.js';
import { useTheme } from '../../hooks/useTheme.js';
import PageBackground from '../PageBackground.jsx';
import SiteFooter from '../SiteFooter.jsx';
import AddTileMenu from './AddTileMenu.jsx';
import DesignPanel from './DesignPanel.jsx';
import EditableGrid from './EditableGrid.jsx';
import EditableProfile from './EditableProfile.jsx';
import EditorErrorBoundary from './EditorErrorBoundary.jsx';
import HistoryDialog from './HistoryDialog.jsx';
import ConflictDialog from './ConflictDialog.jsx';
import InboxDialog from './InboxDialog.jsx';
import SecurityDialog from './SecurityDialog.jsx';
import ShortLinksDialog from './ShortLinksDialog.jsx';
import StatsDialog from './StatsDialog.jsx';
import { EditorContext } from './EditorContext.js';
import LoginScreen from './LoginScreen.jsx';
import SettingsDialog from './SettingsDialog.jsx';
import TileEditor from './TileEditor.jsx';
import Toolbar from './Toolbar.jsx';
import '../../styles/editor.css';

/** True when a keyboard event comes from a text field (don't hijack undo there). */
const isTyping = (e) => e.target.closest('input, textarea, select, [contenteditable="true"]');

/** Scroll an element into view, without animation for reduced-motion users. */
const scrollIntoViewGently = (el) =>
  el?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });

/** The editor itself, once signed in. */
function Editor({ initialPage, published, revision, onSessionLost, onLogout, retryRef }) {
  const refreshedRef = useRef(null);
  const onRefreshed = useCallback(() => refreshedRef.current?.(), []);
  const editor = usePageEditor(initialPage, { onUnauthorized: onSessionLost, published, revision, onRefreshed });
  const { page, actions } = editor;
  // Lets the parent save pending changes after signing in again.
  useEffect(() => {
    retryRef.current = editor.retrySave;
  });
  const theme = useTheme(page.settings);
  useFavicon(page.settings.favicon);
  useDocumentTitle(`Editor · ${siteName(page)}`);

  const [editingTileId, setEditingTileId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [phonePreview, setPhonePreview] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  /** Touch devices: the tile whose controls are showing (tap to select, tap again to edit). */
  const [selectedId, setSelectedId] = useState(null);

  /** Small notification with an optional action button (e.g. Undo). */
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((message, action) => {
    clearTimeout(toastTimer.current);
    setToast({ message, action, armed: false });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  // An "Undo" toast only makes sense until the next edit: the first page
  // change after it appears is the deletion itself, the second one hides it
  // (otherwise its Undo would undo the newer edit instead).
  useEffect(() => {
    setToast((t) => (!t?.action ? t : t.armed ? null : { ...t, armed: true }));
  }, [page]);

  /** Deleting shows an "Undo" toast instead of asking for confirmation. */
  const editorActions = useMemo(
    () => ({
      ...actions,
      removeTile: (id) => {
        actions.removeTile(id);
        setEditingTileId((current) => (current === id ? null : current));
        showToast('Tile deleted', { label: 'Undo', onClick: actions.undo });
      },
    }),
    [actions, showToast],
  );

  // Undo / redo keyboard shortcuts.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!(e.metaKey || e.ctrlKey) || isTyping(e)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) actions.undo();
      else if ((key === 'z' && e.shiftKey) || key === 'y') actions.redo();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions]);

  /** The conflict dialog was closed without choosing (the toolbar can reopen it). */
  const [conflictHidden, setConflictHidden] = useState(false);
  useEffect(() => {
    if (editor.conflict) setConflictHidden(false);
  }, [editor.conflict]);

  /** Which side dialog is open: 'history' | 'stats' | 'inbox' | 'shortlinks' | 'security' | null. */
  const [panel, setPanel] = useState(null);
  const [inboxCount, setInboxCount] = useState(0);

  // Unread contact-form messages, for the badge in the "More" menu.
  useEffect(() => {
    api
      .getInbox()
      .then((r) => setInboxCount(r.unread || 0))
      .catch(() => {});
  }, []);

  // A newer version saved in another tab was loaded when this one got focus.
  refreshedRef.current = () => showToast('Updated with changes made in another tab or device.', { label: 'Undo', onClick: actions.undo });

  const publishNow = async () => {
    const result = await editor.publish();
    if (result === 'conflict') return; // the conflict dialog explains
    if (result) showToast('Published: your page is live.', { label: 'View', href: '/' });
    else showToast('Couldn’t publish. Check your connection and try again.');
  };

  const discardChanges = async () => {
    try {
      if ((await editor.discard()) === 'conflict') return;
      showToast('Back to the published version.', { label: 'Undo', onClick: actions.undo });
    } catch (err) {
      showToast(`Couldn’t discard: ${err.message}`);
    }
  };

  // Ctrl/⌘+S out of habit: the draft saves itself, so just say so (and
  // don't let the browser open its "Save page as" dialog). Publishing is
  // always a deliberate click.
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        showToast('Your draft saves automatically. Press Publish to make it live.');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showToast]);

  const addTile = (tile, openEditor) => {
    actions.addTile(tile);
    setAddOpen(false);
    if (openEditor) setEditingTileId(tile.id);
    // Scroll the new tile into view once it has rendered.
    requestAnimationFrame(() => scrollIntoViewGently(document.querySelector(`[data-tile-id="${CSS.escape(tile.id)}"]`)));
  };

  const contextValue = { ...editor, actions: editorActions, openTileEditor: setEditingTileId, selectedId, setSelectedId };

  return (
    <EditorContext.Provider value={contextValue}>
      <ViewContext.Provider value={{ editing: true, theme }}>
        <EditorErrorBoundary page={page} onUndo={actions.undo}>
          <PageBackground appearance={page.settings.appearance} />
          <main className={`layout layout--editing ${phonePreview ? 'layout--phone' : ''} ${designOpen ? 'layout--with-panel' : ''}`}>
            <h1 className="visually-hidden">Edit your page</h1>
            <EditableProfile />
            <EditableGrid />
            <SiteFooter settings={page.settings} />
          </main>
        </EditorErrorBoundary>
        <Toolbar
          onAdd={() => setAddOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          designOpen={designOpen}
          onToggleDesign={() => setDesignOpen((v) => !v)}
          onLogout={onLogout}
          phonePreview={phonePreview}
          onTogglePhonePreview={() => setPhonePreview((v) => !v)}
          onHistory={() => setPanel('history')}
          onStats={() => setPanel('stats')}
          onInbox={() => setPanel('inbox')}
          onShortLinks={() => setPanel('shortlinks')}
          onSecurity={() => setPanel('security')}
          onShowConflict={() => setConflictHidden(false)}
          inboxCount={inboxCount}
          onPublish={publishNow}
          onDiscard={discardChanges}
        />
        <EditorErrorBoundary page={page} onUndo={actions.undo} compact>
          <AddTileMenu open={addOpen} onClose={() => setAddOpen(false)} onAdd={addTile} />
          <TileEditor
            tileId={editingTileId}
            onClose={() => setEditingTileId(null)}
            onDuplicated={(id) => {
              setEditingTileId(id);
              showToast('Tile duplicated');
            }}
          />
        </EditorErrorBoundary>
        {toast && (
          <div className="toast" role="status">
            <span>{toast.message}</span>
            {toast.action?.href && (
              <a href={toast.action.href} target="_blank" rel="noopener noreferrer" onClick={() => setToast(null)}>
                {toast.action.label}
              </a>
            )}
            {toast.action?.onClick && (
              <button
                type="button"
                onClick={() => {
                  toast.action.onClick();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
        <EditorErrorBoundary page={page} onUndo={actions.undo} compact>
          <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
          {designOpen && <DesignPanel onClose={() => setDesignOpen(false)} />}
          <HistoryDialog open={panel === 'history'} onClose={() => setPanel(null)} onRestored={(label) => showToast(`Restored the ${label}. Publish to make it live.`, { label: 'Undo', onClick: actions.undo })} />
          <StatsDialog open={panel === 'stats'} onClose={() => setPanel(null)} />
          <InboxDialog open={panel === 'inbox'} onClose={() => setPanel(null)} onCountChange={setInboxCount} />
          <ShortLinksDialog open={panel === 'shortlinks'} onClose={() => setPanel(null)} />
          <SecurityDialog open={panel === 'security'} onClose={() => setPanel(null)} />
          <ConflictDialog
            conflict={editor.conflict}
            open={!conflictHidden}
            onClose={() => setConflictHidden(true)}
            onKeepTheirs={() => {
              editor.resolveConflict('theirs');
              showToast('Loaded the other version. Undo brings yours back.', { label: 'Undo', onClick: actions.undo });
            }}
            onKeepMine={() => editor.resolveConflict('mine')}
          />
        </EditorErrorBoundary>
      </ViewContext.Provider>
    </EditorContext.Provider>
  );
}

/**
 * @param {{ initialPage: import('../../lib/types.js').Page }} props
 *   initialPage: the public page inlined in the HTML (only used for the
 *   look of the sign-in screen; the editor itself loads the draft)
 */
export default function EditorApp({ initialPage }) {
  /** null while loading, then { authenticated, passwordSet } */
  const [session, setSession] = useState(null);
  /** The working copy and the live page, loaded after signing in. */
  const [draft, setDraft] = useState(null);
  const [loadError, setLoadError] = useState(null);
  /** True once the editor has been shown: from then on it stays mounted. */
  const [started, setStarted] = useState(false);
  const retryRef = useRef(null);
  // (The sign-in screen already has the page's colours: the server applies
  // them before the first paint, from the inlined public page.)
  void initialPage;

  const refreshSession = useCallback(() => api.getSession().then(setSession).catch(() => setSession({ authenticated: false, passwordSet: true })), []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const loadDraft = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await api.getDraft();
      setDraft({ page: res.page, published: res.published, revision: res.revision });
    } catch (err) {
      if (err.status !== 401) setLoadError(err.message);
    }
  }, []);

  // Signed in and nothing loaded yet: fetch the draft.
  useEffect(() => {
    if (session?.authenticated && !draft) loadDraft();
  }, [session, draft, loadDraft]);

  useEffect(() => {
    if (session?.authenticated && draft) setStarted(true);
  }, [session, draft]);

  const onLogin = async () => {
    // After an expired session: keep the open editor (and its unsaved
    // changes), then save them. First sign-in: the effect above loads the draft.
    setSession((s) => ({ ...s, authenticated: true }));
    if (started) retryRef.current?.();
  };

  const onLogout = async () => {
    await api.logout().catch(() => {});
    window.location.href = '/';
  };

  const onSessionLost = useCallback(() => setSession((s) => (s && { ...s, authenticated: false })), []);

  // Any API call that finds the session gone (save, upload, import…).
  useEffect(() => {
    window.addEventListener(SESSION_LOST_EVENT, onSessionLost);
    return () => window.removeEventListener(SESSION_LOST_EVENT, onSessionLost);
  }, [onSessionLost]);

  if (!session) return <div className="app-message" aria-busy="true" />;
  if (!session.authenticated && !started) return <LoginScreen passwordSet={session.passwordSet} onLogin={onLogin} />;
  if (!draft) {
    return loadError ? (
      <div className="app-message" role="alert">
        <p>Couldn’t load your page: {loadError}</p>
        <button type="button" className="button button--primary" onClick={loadDraft}>
          Try again
        </button>
      </div>
    ) : (
      <div className="app-message" aria-busy="true" />
    );
  }
  return (
    <>
      <Editor initialPage={draft.page} published={draft.published} revision={draft.revision} onSessionLost={onSessionLost} onLogout={onLogout} retryRef={retryRef} />
      {!session.authenticated && <LoginScreen passwordSet={session.passwordSet} onLogin={onLogin} overlay />}
    </>
  );
}
