import { useEffect } from 'react';
import { ViewContext } from '../context/ViewContext.js';
import { useFavicon } from '../hooks/useFavicon.js';
import { siteName, useDocumentTitle } from '../hooks/useSiteName.js';
import { useTheme } from '../hooks/useTheme.js';
import { normalizePage } from '../lib/layout.js';
import { TILE_TYPES } from '../lib/tileRegistry.js';
import { installClickTracking, trackView } from '../lib/tracking.js';
import TileGrid from './TileGrid.jsx';
import PageBackground from './PageBackground.jsx';
import ProfileHeader from './ProfileHeader.jsx';
import ShareButton from './ShareButton.jsx';
import SiteFooter from './SiteFooter.jsx';
import SocialIcons from './SocialIcons.jsx';

/**
 * The page visitors see.
 * @param {{ page: import('../lib/types.js').Page }} props
 */
export default function PublicPage({ page: rawPage }) {
  const page = normalizePage(rawPage, TILE_TYPES);
  const theme = useTheme(page.settings);
  useFavicon(page.settings.favicon);
  useDocumentTitle(siteName(page));
  const { analytics, utmTags } = page.settings;
  useEffect(() => {
    if (analytics) trackView();
    // Only on first load: a re-render is not a new visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => installClickTracking({ analytics: analytics !== false, utmTags: utmTags === true }), [analytics, utmTags]);
  return (
    <ViewContext.Provider value={{ editing: false, theme, embedConsent: page.settings.embedConsent !== false }}>
      <PageBackground appearance={page.settings.appearance} />
      <main className="layout">
        <ProfileHeader profile={page.profile} socialsOnTop={page.settings.socialsPosition !== 'bottom'} />
        <TileGrid tiles={page.tiles} />
        {page.settings.socialsPosition === 'bottom' && <SocialIcons socials={page.profile.socials} position="bottom" />}
        <SiteFooter settings={page.settings} />
      </main>
      {page.settings.shareButton !== false && <ShareButton title={siteName(page)} />}
    </ViewContext.Provider>
  );
}
