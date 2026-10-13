import { ViewContext } from "../context/ViewContext.js";
import { useFavicon } from "../hooks/useFavicon.js";
import { siteName, useDocumentTitle } from "../hooks/useSiteName.js";
import { useTheme } from "../hooks/useTheme.js";
import PageBackground from "./PageBackground.jsx";
import Avatar from "./Avatar.jsx";

/**
 * "Page not found", shown for any unknown address or query parameter.
 * The server sends it with a real 404 status and noindex headers; this
 * component renders it in the site's own design (theme, colours,
 * background, favicon) so it feels like part of the page.
 *
 * @param {{ page: import('../lib/types.js').Page }} props
 */
export default function NotFoundPage({ page }) {
  const theme = useTheme(page.settings);
  const name = siteName(page);
  useFavicon(page.settings.favicon);
  useDocumentTitle(`Page not found · ${name}`);
  const raw = window.location.pathname + window.location.search;
  let path = raw;
  try {
    path = decodeURIComponent(raw);
  } catch {
    /* malformed escape like %E0%A4%A: show it as typed */
  }

  return (
    <ViewContext.Provider value={{ editing: false, theme }}>
      <PageBackground appearance={page.settings.appearance} />
      <main className="not-found">
        <div className="not-found__card tile-cell">
          <a
            className="not-found__avatar"
            href="/"
            aria-label={`Go to ${name}`}
          >
            <Avatar profile={page.profile} size={72} />
          </a>
          <p className="not-found__code" aria-hidden="true">
            404
          </p>
          <h1>This page doesn’t exist</h1>
          <p className="not-found__text">
            The link may be mistyped, or the page may have moved.
            {path.length > 1 && path.length < 120 && (
              <>
                <br />
                <code>{path}</code>
              </>
            )}
          </p>
          <a className="not-found__home" href="/">
            Go back
          </a>
        </div>
      </main>
    </ViewContext.Provider>
  );
}
