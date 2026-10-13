# Development

## Stack

The front end is React 18 built with Vite. It's plain JavaScript with JSDoc
types and hand-written CSS using custom properties, with no CSS framework.
Drag and drop is `@dnd-kit`, brand icons come from `simple-icons` (CC0) and
the fonts are bundled with `@fontsource-variable`. The editor is split into
its own bundle, so visitors only download the public page, which is about
100 KB gzipped. The Retro grid background is a separate small chunk as well.

The server is Express 5 on Node.js 22.9 or newer, plus `@dicebear` for the
default avatars. Everything is stored in JSON files. Sign-in, sessions,
uploads and rate limiting are written by hand on top of Node's `crypto`
module rather than pulled in from packages.

```bash
npm install
npm run dev            # API on :3001, Vite with hot reload on :5173
npm run lint
npm run build          # build the client and package the release zip
npm run build:client   # build the client only
npm run release        # re-package the zip from the existing client/dist
```

`npm run build` writes `release/trellis-<version>/` and
`release/trellis-<version>.zip`, with a `.sha256` next to it. The version
comes from the root `package.json`, so change that (and the ones in
`client/` and `server/`) before a release. The production dependencies are
copied out of your own `node_modules`, so run `npm ci` first if you want a
clean build.

## Code tour

```
client/src/
├── main.jsx, App.jsx           entry point, decides between the page and the editor
├── api/client.js               fetch wrapper, adds the CSRF header
├── lib/
│   ├── tileRegistry.js         every card type: component, sizes, fields, Add menu
│   ├── platforms.js            brand icons and colours, URL to platform, button labels
│   ├── embeds.js               builds embed URLs (Spotify, Apple Music, YouTube, X…)
│   ├── layout.js               card sizes and shapes
│   ├── appearance.js           design presets, fonts, CSS variables
│   ├── avatars.js              DiceBear avatar styles
│   ├── presetFiles.js          saving, exporting and importing presets
│   ├── richText.js             rich text rendering and cleaning
│   └── types.js                JSDoc types for the page document
├── hooks/                      usePageEditor (state, undo, autosave), useFeed, useTheme,
│                               useFavicon, useSiteName, useImageUpload
├── components/
│   ├── PublicPage, NotFoundPage, ProfileHeader, Avatar, TileGrid, Tile, PageBackground, Icons
│   ├── tiles/                  one component per card type
│   └── editor/                 the editor: grid, dialogs, toolbar, design panel
└── styles/                     base.css, tiles.css, editor.css

scripts/package-release.mjs     builds the release zip

server/src/
├── index.js                    app setup, HTTPS, bot blocking, headers, routes, 404
├── config.js                   environment variables
├── routes/                     auth, page, draft, uploads, feeds, integrations…
└── lib/
    ├── validate.js             the schema for everything that gets saved
    ├── store.js                JSON storage
    ├── auth.js                 passwords, sessions, rate limiting, CSRF check
    ├── adminPath.js            the secret editor path
    ├── params.js               query parameters allowed on the page
    ├── blogFeeds.js            RSS and Atom reader for blog cards
    ├── robots.js               crawler lists, robots.txt, noindex
    ├── html.js                 the HTML shell: meta tags, favicon, theme, manifest
    ├── appearance.js           CSS variables applied before first paint
    ├── avatar.js               DiceBear default avatars
    ├── presets.js              server presets (presets/ or PRESETS_DIR)
    ├── safeFetch.js            https client for feeds (public addresses only)
    ├── imageMeta.js            strips location and camera data from uploads
    ├── files.js                atomic file writes
    ├── integrations.js         Instagram token storage and renewal
    └── cache.js                short-lived cache for feeds
```

`tileRegistry.js` and `validate.js` are the two files you'll touch most.

## How a page is served

1. A request for `/` goes to `renderShell()`. It takes the built
   `index.html` and adds the title, meta and OpenGraph tags, the favicon,
   the robots directives, a small script that sets the theme and colours
   before anything paints, and the page itself as `window.__TRELLIS_PAGE__`.
2. React renders straight from that, without another request.
3. The editor's secret path gets the same shell with
   `window.__TRELLIS_EDITOR__ = true` and stricter headers, and `App.jsx`
   loads the editor bundle.
4. Unknown paths and query parameters get the shell with
   `window.__TRELLIS_404__ = true` and a 404 status, and `App.jsx` shows
   `NotFoundPage`. Under the Vite dev server anything other than `/` and
   the editor shows it.

## The page document

```js
{
  version: 2,
  profile: { name, bio, location, avatar },
  settings: {
    theme, accent, pageTitle /* site name */, description,
    noindex, blockAI, allowPreviews,
    favicon: { type, emoji, image },
    appearance: { preset, colors, background, cardStyle, radius, font, animation },
  },
  tiles: [{ id, type, w, h, data }],   // w: 1–4 columns, h: 1–8 rows
}
```

`sanitizePage()` upgrades older documents when they're loaded.

## Adding a card type

1. Write the component in `client/src/components/tiles/`. It gets
   `{ tile, shape }`. `shape` is one of `bar`, `sm`, `wide`, `tall` or `lg`,
   and `tile.w` and `tile.h` give the exact size. `LinkCard` gives you the
   standard look.
2. Add it to `TILE_TYPES` in `client/src/lib/tileRegistry.js` with a label,
   icon, the component, `layout` (default, minimum and maximum size),
   `defaults` and the editor `fields`. Field kinds are `text`, `url`,
   `email`, `textarea`, `richtext`, `links`, `checkbox`, `select`, `urllist`,
   `image` and `note`. Then add it to `ADD_MENU`.
3. Add the same fields to `TILE_SCHEMAS` in `server/src/lib/validate.js`.
   Anything not listed there is thrown away when the page is saved, which
   catches most people out the first time.
4. If it uses an iframe, add a URL builder to `lib/embeds.js` and the
   provider's https origin to `FRAME_SOURCES` in `server/src/index.js`.
5. If it shows live data, add a loader to `server/src/routes/feeds.js` and
   use the `useFeed()` hook in the component.

## Adding a platform icon

Add an entry to `PLATFORMS` in `client/src/lib/platforms.js` with a hostname
pattern and a simple-icons icon. You can also give it a button label in
`PLATFORM_ACTIONS` and an entry in the Add menu with the URL filled in.

## Tests

```bash
npm test             # builds the client, then runs everything (about 20 s)
npm run test:quick   # unit, API and update tests, no build or browser
```

They use Node's built-in test runner. Each suite starts a real server on a
free port with an empty temporary data folder.

- `test/unit.test.mjs`: backup archives (checked against the system `tar`),
  the zip reader, authenticator codes (the RFC 6238 test vectors) and S3
  request signing (AWS's own example).
- `test/api.test.mjs`: access control on every editor endpoint, the CSRF
  header, sign-in only from the editor path, path traversal, script
  injection into the page, locked, hidden and scheduled cards, the 404 page,
  two-tab conflicts, short links, backups, two-step sign-in and devices.
- `test/update.test.mjs`: `npm run update` keeps the data, `.env` and
  presets, checks versions and rolls back.
- `test/browser.test.mjs`: Chrome at phone, tablet and desktop widths (no
  errors, no sideways scrolling), rich text cleaning, button contrast,
  editing and publishing, two tabs, and an axe-core accessibility check of
  the page, the 404 page, the sign-in screen and the editor dialogs.

The browser tests look for `CHROME_PATH`, then Google Chrome, then Edge, and
are skipped rather than failed if there's none. GitHub Actions runs the lot
on every push (`.github/workflows/test.yml`).

If you fix a bug, add a test that fails without the fix.

## Visual checks

Before a release I go through the page and the editor at desktop
(1280 to 1920px), tablet (820 and 1024px) and phone (320, 360 and 390px)
widths, in a light design, a dark one like Crystal and an outlined one, with
some long names and labels. Things to look for: sideways scrolling, text
spilling out of a card, cards overlapping, editor controls or dialogs going
off screen, and touch selection (one tap selects, a second tap edits). Long
text should fade out at the bottom of a card rather than cutting a line in
half.

## Conventions

- Function components and hooks only. The one exception is the error
  boundary in `Tile.jsx`.
- Editor state changes go through the `usePageEditor` actions, otherwise
  undo, redo and autosave stop working.
- No `dangerouslySetInnerHTML`, and user input never goes straight into an
  iframe `src`.
- Everything that gets saved is validated in `server/src/lib/validate.js`.
- Modules and components get a short comment saying why they exist, not what
  each line does.

## API

✓ means the request needs a session cookie and the
`X-Requested-With: trellis` header.

| Method | Path | Auth | What it does |
| --- | --- | --- | --- |
| GET | `/api/page` | | The published page as visitors see it (hidden and scheduled cards removed, locked content left out) |
| PUT | `/api/page` | ✓ | Replace and publish the page in one go. Returns the cleaned page |
| POST | `/api/page/validate` | ✓ | Clean a page without saving it (used for imports) |
| GET | `/api/auth/me` | | `{ authenticated, passwordSet, twoFactor? }` |
| POST | `/api/auth/login` | | `{ password, path, code? }`, where path is the editor path. Sets the session cookie. With two-step sign-in on and no code, returns 401 `code_required` |
| POST | `/api/auth/logout` | | Ends the session and clears the cookie |
| GET | `/api/auth/security` | ✓ | Two-step status, signed-in devices, recent sign-ins |
| POST | `/api/auth/2fa/setup` | ✓ | A new secret and `otpauth://` address (not active until enabled) |
| POST | `/api/auth/2fa/enable`, `/disable`, `/recovery` | ✓ | Take `{ password, code }`, `{ password, code }` and `{ password }`. Enable and recovery return the `recoveryCodes` once |
| DELETE | `/api/auth/sessions/:id` | ✓ | Sign out one device |
| POST | `/api/auth/sessions/others` | ✓ | Sign out every other device |
| GET, POST | `/api/backups` | ✓ | Backup status, or back up now |
| GET, POST | `/api/shortlinks` | ✓ | List short links, or add one (`{ slug, url, note }`) |
| PUT, DELETE | `/api/shortlinks/:slug` | ✓ | Change or delete a short link |
| POST | `/api/uploads` | ✓ | Raw image or PDF in the body, returns `{ url, size }` |
| GET, PUT | `/api/draft` | ✓ | The working copy (`{ page, published, hasChanges, publishedAt, revision }`), or autosave it |
| POST | `/api/draft/publish` | ✓ | Make the draft (or the page in the body) live |
| POST | `/api/draft/discard` | ✓ | Throw the draft away |
| GET | `/api/draft/revision` | ✓ | `{ revision }`, checked when an editor tab gets focus |
| GET | `/api/versions`, `/api/versions/:id` | ✓ | Version history, or one version (`?restore=1` saves the draft first) |
| POST | `/api/collect` | | Statistics beacon (`{ type: 'view' \| 'click', … }`, sent as text/plain) |
| GET, DELETE | `/api/stats?days=` | ✓ | Statistics, or delete them all |
| POST | `/api/unlock/:tileId` | | `{ code }`, returns the content of a locked card |
| POST | `/api/forms/:tileId/contact`, `/subscribe` | | Contact message or newsletter sign-up |
| GET, PATCH, DELETE | `/api/inbox`, `/api/inbox/:id` | ✓ | Contact messages: list, mark as read, delete |
| POST | `/api/geocode` | ✓ | `{ q }`, returns places from OpenStreetMap Nominatim (for map cards) |
| GET | `/api/feeds/:tileId` | | Live data for Bluesky, Mastodon, Instagram, GitHub and blog cards |
| GET | `/api/avatar.svg?style=&seed=` | | A generated default avatar, cached for a day |
| GET | `/api/presets` | ✓ | Design presets installed on the server |
| POST | `/api/presets/validate` | ✓ | Clean a preset (used for preset imports) |
| GET | `/api/integrations` | ✓ | Which integrations are connected (no secrets) |
| PUT, DELETE | `/api/integrations/instagram` | ✓ | Connect (`{ token }`) or disconnect Instagram |
| PUT, DELETE | `/api/integrations/newsletter` | ✓ | Connect (`{ provider, apiKey, listId }`) or disconnect a newsletter service |
| GET | `/api/editor-check?path=` | | Whether a path is the editor (used by the dev server) |
| GET | `/api/health` | | `{ ok: true }`. Requests from the server itself to a loopback address also get `version`, never through a proxy |

Draft writes (`PUT /api/draft`, publish and discard) can send an
`X-Base-Revision` header with the last revision the editor saw. If the draft
has changed since then, they return 409 with
`{ code: 'conflict', page, published, revision }` instead of overwriting it.
Scripts that leave the header out aren't affected.
