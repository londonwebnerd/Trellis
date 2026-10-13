# Troubleshooting

**"Client not built yet"**
Run `npm run build` and restart the server.

**The page is blank or half-styled after an update**
Restart the server (`sudo systemctl restart trellis`). It reads the HTML
template when it starts, so it's still pointing at the old file names.

**`node: bad option` or a syntax error at start-up**
Node.js is too old. You need 22.9 or newer.

**I've lost the editor address**
Run `npm run admin-url` on the server, as the app's user and from the project
folder. It's also in the log the very first time the server starts.

**`/admin` says the page doesn't exist**
That's on purpose. The editor is at its own secret address.

**A shared link opens the 404 page**
The link has a query parameter (the part after `?`) that the page doesn't
know. The usual tracking parameters are allowed. Add others to
`server/src/lib/params.js` and restart.

**A short link opens the 404 page**
Short links have to match exactly (`/cv`, not `/cv.pdf`), although case
doesn't matter. Check the name under More > Short links.

**"Wrong password" when it isn't**
Sign-ins only work from the current editor address. After
`admin-url -- --rotate` the old one stops working. After ten wrong attempts
you have to wait 15 minutes.

**Signing in does nothing, or signs me straight back out**
Over HTTPS the cookie is marked Secure, so the app has to know the request
was HTTPS. Check `TRUST_PROXY=1` is set and nginx sends
`proxy_set_header X-Forwarded-Proto $scheme;`.

**Redirect loop**
Same cause: nginx has to send `X-Forwarded-Proto` and the app needs
`TRUST_PROXY=1`. As a last resort, `FORCE_HTTPS=0` switches off the app's
redirect and leaves nginx's in place.

**I forgot the password**
`npm run set-password` on the server. It signs out every device as well.

**I lost my phone and my recovery codes**
`sudo -u www-data npm run reset-2fa` turns two-step sign-in off. Sign in with
your password and turn it back on.

**"That code didn't work" with the right code**
Authenticator codes depend on the time, so check the clocks on your phone and
the server are set automatically (`timedatectl` on the server). A code only
works once, so wait for the next one.

**"Please sign in again" while editing**
The session ran out (they last 30 days) or the password was changed. Your
changes are still there; sign in and they get saved.

**"Edited elsewhere"**
The page was saved from another tab or device. The editor asks which version
to keep; see [two tabs or two devices](editor-guide.md#two-tabs-or-two-devices).

**`npm run update` rolled back**
The new version didn't pass its health check within 45 seconds, so the old
one is running again and the failed copy is in `/opt/trellis.failed`.
`journalctl -u trellis -n 50` shows why. It's often the Node.js version or a
typo in `.env`.

**The off-site backup copy failed**
For a folder, it has to be mounted and writable by the app's user, and listed
in `ReadWritePaths` under systemd. For S3, check the endpoint, region and
bucket, and that the key is allowed to `PutObject`. The editor shows the
error the storage service gave.

**A blog card has no posts**
Latest posts work for public Medium, Substack, WordPress.com, Blogger and
Tumblr blogs. Look for `[feeds]` lines in the server log.

**Bluesky, Mastodon or GitHub cards show nothing**
The server has to be able to reach `public.api.bsky.app`, your Mastodon
server or `api.github.com`. Results are cached for ten minutes, and GitHub
allows 60 requests an hour per server without a token. Check the log for
`[feeds]` lines.

**The Instagram feed is empty**
Connect Instagram under Settings > Integrations and reload the editor. The
account has to be a Business or Creator account. If the token was revoked,
connect it again.

**An embed is just a grey box**
Check it's a proper share link for a playlist, album, song or video. Some
networks block those services entirely.

**Uploads fail**
Photos can be JPEG, PNG, GIF, WebP, AVIF or ICO, and file cards take PDFs up
to 10 MB. A "too large" error usually comes from nginx, so set
`client_max_body_size 11m;`. Convert SVG or HEIC files first.

**The page still shows up on Google after hiding it**
It drops out as Google visits again, usually within a few days or weeks.
Search Console's Removals tool is faster.

**Link previews have stopped working in WhatsApp or iMessage**
Hiding the page from crawlers blocks preview bots too. Tick **Still allow
link previews in chat apps** under Settings > Privacy. The apps cache
previews, so an old link can take a while to update.

**`curl https://my-site/` gets a 403**
With the page hidden, scripts like curl are refused. Try
`curl -A "Mozilla/5.0" https://my-site/`.
