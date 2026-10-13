import { lazy, Suspense, useEffect, useState } from "react";
import { api } from "./api/client.js";
import NotFoundPage from "./components/NotFoundPage.jsx";
import PublicPage from "./components/PublicPage.jsx";
const EditorApp = lazy(() => import("./components/editor/EditorApp.jsx"));

/**
 * Is this the editor? The editor lives at a secret, randomly generated path
 * (see server/src/lib/adminPath.js). In production the server tells us via
 * an inlined flag; in development (Vite serves the page) we ask the API.
 * @returns {Promise<boolean>}
 */
async function detectEditor() {
  if (typeof window.__TRELLIS_EDITOR__ === "boolean")
    return window.__TRELLIS_EDITOR__;
  if (window.location.pathname === "/") return false;
  try {
    const res = await fetch(
      `/api/editor-check?path=${encodeURIComponent(window.location.pathname)}`,
    );
    return (await res.json()).editor === true;
  } catch {
    return false;
  }
}

const isNotFound = (isEditor) =>
  typeof window.__TRELLIS_404__ === "boolean"
    ? window.__TRELLIS_404__
    : !isEditor && window.location.pathname !== "/";

/**
 * Root component: gets the page data (inlined by the server in production,
 * fetched from the API in development) and shows the public page, the
 * editor or the 404 page.
 */
export default function App() {
  const [page, setPage] = useState(() => window.__TRELLIS_PAGE__ || null);
  const [isEditor, setIsEditor] = useState(() =>
    typeof window.__TRELLIS_EDITOR__ === "boolean"
      ? window.__TRELLIS_EDITOR__
      : null,
  );
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isEditor === null) detectEditor().then(setIsEditor);
  }, [isEditor]);

  useEffect(() => {
    if (page) return;
    api
      .getPage()
      .then(setPage)
      .catch((err) => setError(err.message));
  }, [page]);

  if (error)
    return <p className="app-message">Couldn’t load this page: {error}</p>;
  if (!page || isEditor === null)
    return <div className="app-message" aria-busy="true" />;

  if (isEditor) {
    return (
      <Suspense fallback={<div className="app-message" aria-busy="true" />}>
        <EditorApp initialPage={page} />
      </Suspense>
    );
  }
  if (isNotFound(isEditor)) return <NotFoundPage page={page} />;
  return <PublicPage page={page} />;
}
