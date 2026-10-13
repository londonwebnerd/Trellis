# Configuration

Server settings come from environment variables, normally in a `.env` file in
the project folder (start from `.env.example`). All of them are optional.
Everything to do with the page itself, its design and its privacy settings is
done in the editor.

## Environment variables

| Variable | Default | What it's for |
| --- | --- | --- |
| `PORT` | `3001` | The port the app listens on |
| `HOST` | `127.0.0.1` | The address it binds to. Keep `127.0.0.1` behind nginx on the same machine; Docker uses `0.0.0.0` |
| `NODE_ENV` | | `production` on a server, which turns on HTTPS-only mode |
| `PUBLIC_URL` | | The site's address, e.g. `https://example.com`. Redirects and link previews use it instead of trusting the request. Set it in production |
| `TRUST_PROXY` | | `1` behind nginx, Caddy or Traefik, so the app sees HTTPS and real client IPs |
| `FORCE_HTTPS` | on in production | `0` turns HTTPS-only mode off |
| `DATA_DIR` | `server/data` | Where the page, uploads, password hash and keys live |
| `ADMIN_PATH` | random | Choose the editor's secret path yourself (16 to 128 letters, digits, `-` and `_`). Usually best left alone |
| `SESSION_SECRET` | generated | Key for signing the sign-in cookie. Generated into `DATA_DIR/secret.key` if not set |
| `ADMIN_PASSWORD` | | A password to set on first start. `npm run set-password` is better; remove this once it's done |
| `TRELLIS_ENV_FILE` | `.env` | Read settings from a different file, or `none` to skip it. Real environment variables always win |
| `PRESETS_DIR` | `presets/` | Folder of server presets (see [Customising](customising.md#offer-presets-to-every-site-on-a-server)) |
| `INSTAGRAM_ACCESS_TOKEN` | | An alternative to connecting Instagram in the editor. It isn't renewed automatically |
| `SMTP_URL` | | Mail server for contact form emails, e.g. `smtps://user:password@smtp.example.com:465` |
| `NOTIFY_EMAIL` | | Where those emails go |
| `SMTP_FROM` | `NOTIFY_EMAIL` | The sender address |
| `BACKUP` | on | `off` stops the nightly backups (`npm run backup` still works) |
| `BACKUP_TIME` | `03:30` | When the nightly backup runs, in server time |
| `BACKUP_KEEP` | `14` | How many backups to keep |
| `BACKUP_DIR` | `DATA_DIR/backups` | Where backups go |
| `BACKUP_COPY_DIR` | | A second folder for copies, such as a mounted NAS. Under systemd, add it to `ReadWritePaths` |
| `BACKUP_S3_BUCKET` | | Upload each backup to S3-compatible storage, along with `BACKUP_S3_ENDPOINT`, `_REGION`, `_PREFIX`, `_ACCESS_KEY` and `_SECRET_KEY` |
| `GEO_HEADER` | `CF-IPCountry` | The header that carries the visitor's country (see [Visitors](visitors.md#countries)) |

The command-line scripts read the same `.env`, so they always work on the
right data folder.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development: API on port 3001, Vite with hot reload on 5173 |
| `npm run build` | Build the front end and make the release zip |
| `npm run build:client` | Build the front end only |
| `npm start` | Run the app, serving the built front end |
| `npm run set-password` | Set or change the editor password |
| `npm run admin-url` | Show the editor address. `-- --rotate` replaces it |
| `npm run backup` | Back up now. `-- --list` lists the backups |
| `npm run restore -- latest` | Restore the newest backup, or `-- <file>` a particular one. Stop the server first |
| `npm run update -- <zip>` | Install a new release. `-- --rollback` goes back |
| `npm run reset-2fa` | Turn off two-step sign-in if you've lost your phone and recovery codes |
| `npm run sign-out-all` | Sign every device out of the editor |
| `npm run lint` | Lint the front end |
| `npm test` | Build the front end and run all the tests |

## Addresses

| Path | What's there |
| --- | --- |
| `/` | The page |
| your secret path | The editor |
| `/robots.txt` | Generated from the privacy settings |
| `/uploads/…` | Uploaded images and files |
| `/api/…` | The JSON API (see [Development](development.md#api)) |
| `/api/health` | Returns `{ "ok": true }` for uptime monitors. Requests from the server itself also get the version number |
| `/cv`, `/github`… | Your [short links](editor-guide.md#short-links) |
| anything else | The 404 page, `/admin` included |

The page doesn't take any query parameters, so `/?page=2` gets the 404 page
too. The exceptions are tracking parameters that social networks and
newsletters add to shared links (`?fbclid=`, `?igsh=`, `?utm_source=` and so
on), which keep working. The list is in `server/src/lib/params.js` if a
service you use adds one that's missing.
