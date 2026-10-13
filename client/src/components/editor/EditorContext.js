import { createContext, useContext } from 'react';

/**
 * Gives editor components access to the page editor (state + actions from
 * hooks/usePageEditor.js) and UI helpers like opening the tile dialog.
 *
 * @typedef {ReturnType<typeof import('../../hooks/usePageEditor.js').usePageEditor> & {
 *   openTileEditor: (id: string) => void,
 *   selectedId: string | null,
 *   setSelectedId: (id: string | null) => void,
 * }} EditorApi
 */
export const EditorContext = createContext(/** @type {EditorApi | null} */ (null));

/** @returns {EditorApi} */
export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used inside <EditorContext.Provider>');
  return ctx;
}
