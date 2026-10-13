import { createContext, useContext } from 'react';

/**
 * Page-wide view state that tiles may need without prop drilling.
 * @typedef {{ editing: boolean, theme: 'light' | 'dark', embedConsent?: boolean }} ViewState
 *   embedConsent: embeds wait for a click before loading (visitors only)
 */
export const ViewContext = createContext(/** @type {ViewState} */ ({ editing: false, theme: 'light' }));

/** @returns {ViewState} */
export const useView = () => useContext(ViewContext);
