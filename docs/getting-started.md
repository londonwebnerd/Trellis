# Getting started

You need Node.js 22.9 or newer (`node -v` to check). Older versions don't
have the built-in `.env` support the scripts rely on.

## Install

```bash
git clone https://github.com/londonwebnerd/Trellis.git trellis
cd trellis
npm install
npm run set-password    # at least 8 characters
```

## The editor address

There's no `/admin`. The editor lives at a random address that's created the
first time the server starts:

```bash
npm run admin-url
#   https://<your-domain>/_3AwjOD23BIY9hTAculICL-79
```

Bookmark it and keep it to yourself. You still need the password to sign in,
but the server only accepts sign-ins from that page, so bots can't even start
guessing passwords. If it ever leaks, `npm run admin-url -- --rotate` makes a
new one.

## Running it locally

```bash
npm run dev
```

The page is at <http://localhost:5173> and the editor is the same address
with your secret path on the end. `npm run dev` runs the API on port 3001 and
Vite on 5173 with hot reload.

To try the production build instead:

```bash
npm run build    # also makes release/trellis-<version>.zip
npm start        # http://localhost:3001
```

## A first edit

1. Open the editor and sign in.
2. Click your name, bio and location to change them, and the round picture to
   upload a photo.
3. Click **Add**, paste a link (your Instagram or GitHub, say) and press
   **Add**. Trellis picks the right card.
4. Open the palette button and try a few presets.
5. Set the site name and favicon under the gear button.
6. Press **Publish**. Until you do, visitors still see the old version.

Changes save as a draft while you work, so you can close the tab and come
back later.

From here, the [editor guide](editor-guide.md) covers the rest of the editor,
and [deployment](deployment.md) explains how to put it online.
