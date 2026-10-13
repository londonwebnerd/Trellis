import { useEffect } from 'react';

/**
 * Build the favicon URL for the settings. Mirrors faviconTags() in
 * server/src/lib/html.js, which renders the same thing server-side.
 * @param {{ type?: string, emoji?: string, image?: string }} favicon
 */
export function faviconHref(favicon = {}) {
  if (favicon.type === 'emoji' && favicon.emoji) {
    const emoji = favicon.emoji.replace(/[<>&"']/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="50" font-size="84" text-anchor="middle" dominant-baseline="central">${emoji}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
  if (favicon.type === 'image' && favicon.image) return favicon.image;
  return '/favicon.svg';
}

/**
 * Keep the tab icon in sync with the favicon setting (live while editing,
 * and in development where the server doesn't render the HTML).
 * @param {object} favicon
 */
export function useFavicon(favicon) {
  const href = faviconHref(favicon);
  useEffect(() => {
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = Object.assign(document.createElement('link'), { rel: 'icon' });
      document.head.append(link);
    }
    if (link.getAttribute('href') !== href) {
      link.removeAttribute('type');
      link.href = href;
    }
  }, [href]);
}
