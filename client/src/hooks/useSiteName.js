import { useEffect } from 'react';

/**
 * The site's name (Settings → Site name, stored as settings.pageTitle),
 * falling back to the profile name. Mirrors siteName() in
 * server/src/lib/html.js, which uses it for <title>, link previews,
 * the home-screen icon label and the web app manifest.
 * @param {import('../lib/types.js').Page} page
 */
export const siteName = (page) => page.settings.pageTitle || page.profile.name || 'About me';

/**
 * Keep the browser tab title in sync with the site name while it's being
 * edited (the server sets it for visitors).
 * @param {string} title
 */
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
