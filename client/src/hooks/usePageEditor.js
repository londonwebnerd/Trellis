/**
 * Editor state: the page document + undo/redo history + autosave.
 *
 * All edits go through a reducer, which makes undo/redo trivial: every
 * action pushes the previous page onto `past`. Actions carrying the same
 * `coalesce` key in a row (e.g. typing into one field, or one drag gesture
 * that reorders several times) are merged into a single history entry.
 *
 * Changes are saved automatically ~800 ms after the last edit. Only one save
 * is in flight at a time (newer changes wait and go next), so saves can't
 * reach the server out of order.
 *
 * Two tabs or devices: every save sends the revision this tab last saw. If
 * someone else saved in between, the server refuses (409) and `conflict`
 * holds their version until the user picks one (resolveConflict). When the
 * tab comes back into focus with nothing unsaved, a newer version from
 * elsewhere is loaded quietly instead (and can be undone).
 *
 * The server cleans what it stores (trims text, normalises URLs). That copy
 * is deliberately *not* pushed back into the editor: doing so mid-typing
 * would eat the space you just typed or rewrite a half-typed URL. The
 * editor's inputs use the same length limits, and links are checked again
 * when rendered, so what you see matches what visitors get.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { newTileId } from '../lib/format.js';
import { normalizePage } from '../lib/layout.js';
import { TILE_TYPES } from '../lib/tileRegistry.js';

const HISTORY_LIMIT = 100;
const SAVE_DELAY_MS = 800;

/* ---------------------------- Pure helpers ---------------------------- */

const mapTile = (page, id, fn) => ({ ...page, tiles: page.tiles.map((t) => (t.id === id ? fn(t) : t)) });

/** Apply an edit action to a page (no history handling). */
function applyEdit(page, action) {
  switch (action.type) {
    case 'profile/update':
      return { ...page, profile: { ...page.profile, ...action.patch } };
    case 'settings/update':
      return { ...page, settings: { ...page.settings, ...action.patch } };
    case 'tile/add': {
      const tiles = [...page.tiles];
      tiles.splice(action.index ?? tiles.length, 0, action.tile);
      return { ...page, tiles };
    }
    case 'tile/update':
      return mapTile(page, action.id, (t) => ({ ...t, data: { ...t.data, ...action.patch } }));
    case 'tile/props': {
      // Card-level settings next to `data`: visibility, lock, style.
      return mapTile(page, action.id, (t) => {
        const next = { ...t, ...action.patch };
        for (const [k, v] of Object.entries(action.patch)) if (v === undefined) delete next[k];
        return next;
      });
    }
    case 'tile/resize':
      return mapTile(page, action.id, (t) => (t.w === action.w && t.h === action.h ? t : { ...t, w: action.w, h: action.h }));
    case 'tile/duplicate': {
      const index = page.tiles.findIndex((t) => t.id === action.id);
      if (index < 0) return page;
      const copy = { ...structuredClone(page.tiles[index]), id: action.newId };
      const tiles = [...page.tiles];
      tiles.splice(index + 1, 0, copy);
      return { ...page, tiles };
    }
    case 'tile/remove':
      return { ...page, tiles: page.tiles.filter((t) => t.id !== action.id) };
    case 'tile/move': {
      const from = page.tiles.findIndex((t) => t.id === action.activeId);
      const to = page.tiles.findIndex((t) => t.id === action.overId);
      if (from < 0 || to < 0 || from === to) return page;
      const tiles = [...page.tiles];
      tiles.splice(to, 0, tiles.splice(from, 1)[0]);
      return { ...page, tiles };
    }
    case 'page/replace':
      return normalizePage(action.page, TILE_TYPES);
    case 'page/load':
      // A version that's already on the server (already normalised).
      return action.page;
    default:
      return page;
  }
}

/** Reducer wrapping applyEdit with undo/redo history. */
function historyReducer(state, action) {
  switch (action.type) {
    case 'history/undo': {
      if (!state.past.length) return state;
      const previous = state.past[state.past.length - 1];
      return { page: previous, past: state.past.slice(0, -1), future: [state.page, ...state.future], coalesce: null };
    }
    case 'history/redo': {
      if (!state.future.length) return state;
      const [next, ...future] = state.future;
      return { page: next, past: [...state.past, state.page], future, coalesce: null };
    }
    case 'history/break':
      return { ...state, coalesce: null };
    default: {
      const page = applyEdit(state.page, action);
      if (page === state.page) return state;
      const merge = action.coalesce && action.coalesce === state.coalesce;
      return {
        page,
        past: merge ? state.past : [...state.past, state.page].slice(-HISTORY_LIMIT),
        future: [],
        coalesce: action.coalesce || null,
      };
    }
  }
}

/* -------------------------------- Hook -------------------------------- */

/** Comparable form of a page: normalised, without timestamps. */
const comparable = (page) => JSON.stringify({ ...normalizePage(page, TILE_TYPES), updatedAt: undefined });

/**
 * @param {import('../lib/types.js').Page} initialPage the working copy (draft)
 * @param {{ onUnauthorized?: () => void, published?: import('../lib/types.js').Page, revision?: string, onRefreshed?: () => void }} [options]
 *   `published`: the live page, to tell what's still unpublished;
 *   `revision`: the draft revision the page was loaded at;
 *   `onRefreshed`: called after a newer version from another tab was loaded
 */
export function usePageEditor(initialPage, { onUnauthorized, published, revision: initialRevision, onRefreshed } = {}) {
  const [state, dispatch] = useReducer(historyReducer, initialPage, (page) => ({ page: normalizePage(page, TILE_TYPES), past: [], future: [], coalesce: null }));

  /** 'saved' | 'pending' | 'saving' | 'error' */
  const [saveStatus, setSaveStatus] = useState('saved');
  const [saveError, setSaveError] = useState(null);
  const lastSaved = useRef(state.page);
  const inFlight = useRef(false);
  /** A publish is on its way: autosaves wait (it saves the page too). */
  const publishingRef = useRef(false);
  /** Settles when the save in flight ends (publish/discard wait for it). */
  const saveDone = useRef(Promise.resolve());
  /** A retry was requested while a save was in flight: run it when that one ends. */
  const retryRequested = useRef(false);
  const saveRef = useRef(null);
  /** The page as currently shown, for checks after an async save. */
  const latest = useRef(state.page);
  latest.current = state.page;
  /** The server revision this tab's page is based on. */
  const revision = useRef(initialRevision || null);
  /** Someone saved elsewhere: { page, published, revision } until resolved. */
  const [conflict, setConflict] = useState(null);
  const conflictRef = useRef(null);
  conflictRef.current = conflict;

  const onConflict = useCallback((err) => {
    if (err?.status !== 409 || !err.data?.page) return false;
    setConflict({ page: err.data.page, published: err.data.published, revision: err.data.revision });
    setSaveStatus('conflict');
    return true;
  }, []);

  const save = useCallback(
    async (page) => {
      // One save at a time: whatever is newest goes when this one finishes.
      // Nothing is saved while a conflict waits for an answer.
      if (inFlight.current || publishingRef.current || page === lastSaved.current || conflictRef.current) return;
      inFlight.current = true;
      let settle;
      saveDone.current = new Promise((resolve) => (settle = resolve));
      setSaveStatus('saving');
      let ok = false;
      try {
        const res = await api.saveDraft(page, revision.current);
        if (res?.revision) revision.current = res.revision;
        ok = true;
        lastSaved.current = page;
        setSaveError(null);
      } catch (err) {
        if (!onConflict(err)) {
          setSaveStatus('error');
          setSaveError(err.message);
          if (err.status === 401) onUnauthorized?.();
        }
      } finally {
        inFlight.current = false;
        settle();
      }
      if (!ok) {
        // e.g. signed in again while this save was failing: try once more.
        if (retryRequested.current) {
          retryRequested.current = false;
          saveRef.current(latest.current);
        }
        return;
      }
      retryRequested.current = false;
      // Anything that changed meanwhile (more typing, an undo back to an
      // older version…) is saved straight away, so the server always ends up
      // with exactly what the editor shows.
      if (latest.current !== lastSaved.current) saveRef.current(latest.current);
      else setSaveStatus('saved');
    },
    [onUnauthorized, onConflict],
  );
  saveRef.current = save;

  // Debounced autosave whenever the page changes.
  useEffect(() => {
    if (state.page === lastSaved.current) {
      // e.g. undo back to the saved version before the autosave fired.
      // (If a save is in flight, it re-checks against the latest page when done.)
      if (!inFlight.current) setSaveStatus((s) => (s === 'pending' ? 'saved' : s));
      return undefined;
    }
    setSaveStatus('pending');
    const timer = setTimeout(() => save(state.page), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.page, save]);

  /** Show a version that's already saved on the server, without saving it again. */
  const loadServerPage = useCallback((serverPage) => {
    const page = normalizePage(serverPage, TILE_TYPES);
    lastSaved.current = page;
    dispatch({ type: 'page/load', page });
  }, []);

  /**
   * Back in this tab: has the page been saved elsewhere meanwhile? With
   * nothing unsaved here, load that version (undoable); otherwise ask.
   */
  useEffect(() => {
    let checking = false;
    const check = async () => {
      if (document.visibilityState !== 'visible' || checking || inFlight.current || conflictRef.current || !revision.current) return;
      checking = true;
      try {
        const { revision: current } = await api.getDraftRevision();
        if (!current || current === revision.current || inFlight.current) return;
        const res = await api.getDraft();
        if (latest.current === lastSaved.current) {
          revision.current = res.revision;
          loadServerPage(res.page);
          setPublishedKey(comparable(res.published));
          onRefreshed?.();
        } else {
          setConflict({ page: res.page, published: res.published, revision: res.revision });
          setSaveStatus('conflict');
        }
      } catch {
        // offline or signed out: the next save will tell
      } finally {
        checking = false;
      }
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [onRefreshed, loadServerPage]);

  /**
   * Answer a conflict: 'theirs' loads the other version (undoable, so this
   * tab's version is one ⌘Z away); 'mine' saves this tab's version over it.
   */
  const resolveConflict = useCallback((choice) => {
    const c = conflictRef.current;
    if (!c) return;
    revision.current = c.revision;
    conflictRef.current = null;
    setConflict(null);
    if (choice === 'theirs') {
      loadServerPage(c.page);
      if (c.published) setPublishedKey(comparable(c.published));
      setSaveStatus('saved');
    } else {
      setSaveStatus('pending');
      lastSaved.current = null; // force a save of what's shown
      saveRef.current(latest.current);
    }
  }, [loadServerPage]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (saveStatus === 'saved') return undefined;
    const onBeforeUnload = (e) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [saveStatus]);

  /* ----------------------------- Publishing ----------------------------- */

  /** What's live, in comparable form, to show "Unpublished changes". */
  const [publishedKey, setPublishedKey] = useState(() => comparable(published || initialPage));
  const currentKey = useMemo(() => comparable(state.page), [state.page]);
  const hasUnpublished = currentKey !== publishedKey;
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState(null);

  /** Make the current page live. The latest page goes along with the request. */
  const publish = useCallback(async () => {
    setPublishing(true);
    publishingRef.current = true;
    setPublishError(null);
    // An autosave still on its way would move the revision on, and the
    // publish (based on the old one) would look like an edit from another
    // tab. Wait for it; the publish then carries whatever is newest.
    while (inFlight.current) await saveDone.current;
    const page = latest.current;
    try {
      const res = await api.publish(page, revision.current);
      if (res?.revision) revision.current = res.revision;
      lastSaved.current = page; // the publish saved it too
      setSaveStatus('saved');
      setPublishedKey(comparable(page));
      return true;
    } catch (err) {
      if (onConflict(err)) return 'conflict';
      setPublishError(err.message);
      if (err.status === 401) onUnauthorized?.();
      return false;
    } finally {
      publishingRef.current = false;
      setPublishing(false);
      // Typed while publishing: save that now (it stays unpublished).
      if (latest.current !== lastSaved.current && !conflictRef.current) saveRef.current(latest.current);
    }
  }, [onUnauthorized, onConflict]);

  /** Go back to the live page (undoable: it's an ordinary page replacement). */
  const discard = useCallback(async () => {
    while (inFlight.current) await saveDone.current;
    let res;
    try {
      res = await api.discardDraft(revision.current);
    } catch (err) {
      if (onConflict(err)) return 'conflict';
      throw err;
    }
    if (res.revision) revision.current = res.revision;
    dispatch({ type: 'page/replace', page: res.page });
    setPublishedKey(comparable(res.page));
    return true;
  }, [onConflict]);

  /** Stable, named action creators for components. */
  const actions = useMemo(
    () => ({
      updateProfile: (patch, field = 'any') => dispatch({ type: 'profile/update', patch, coalesce: `profile:${field}` }),
      updateSettings: (patch, field = 'any') => dispatch({ type: 'settings/update', patch, coalesce: `settings:${field}` }),
      addTile: (tile, index) => dispatch({ type: 'tile/add', tile, index }),
      updateTile: (id, patch, field = 'any') => dispatch({ type: 'tile/update', id, patch, coalesce: `tile:${id}:${field}` }),
      /** Card-level settings (visibility, lock, style); `undefined` removes one. */
      updateTileProps: (id, patch, field = 'any') => dispatch({ type: 'tile/props', id, patch, coalesce: `tileprops:${id}:${field}` }),
      /** Set a tile's size; `gestureId` merges a drag-resize into one undo step. */
      resizeTile: (id, w, h, gestureId) => dispatch({ type: 'tile/resize', id, w, h, coalesce: gestureId ? `resize:${gestureId}` : undefined }),
      /** Insert a copy right after the tile; returns the new id. */
      duplicateTile: (id) => {
        const newId = newTileId();
        dispatch({ type: 'tile/duplicate', id, newId });
        return newId;
      },
      removeTile: (id) => dispatch({ type: 'tile/remove', id }),
      /** Reorder during a drag gesture; `gestureId` groups it into one undo step. */
      moveTile: (activeId, overId, gestureId) => dispatch({ type: 'tile/move', activeId, overId, coalesce: `drag:${gestureId}` }),
      replacePage: (page) => dispatch({ type: 'page/replace', page }),
      undo: () => dispatch({ type: 'history/undo' }),
      redo: () => dispatch({ type: 'history/redo' }),
      /** End the current coalescing group (e.g. when a dialog closes). */
      checkpoint: () => dispatch({ type: 'history/break' }),
    }),
    [],
  );

  return {
    page: state.page,
    actions,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    saveStatus,
    saveError,
    retrySave: () => {
      if (inFlight.current) retryRequested.current = true;
      else saveRef.current(latest.current);
    },
    hasUnpublished,
    publish,
    publishing,
    publishError,
    discard,
    conflict,
    resolveConflict,
  };
}
