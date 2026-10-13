# Deployment

In production Trellis is a single Node.js process behind nginx, with nginx
handling HTTPS (Let's Encrypt is fine). These steps assume a Linux server
with systemd. There's a Docker section further down if you'd rather use
that.

## 1. Build the release zip

On your own computer:

```bash
npm ci
npm run build
```

That builds the front end and writes `release/trellis-<version>.zip`, plus a
`.sha256` checksum next to it. The zip contains the server, the built front
end and the production dependencies, so the server doesn't need to run
`npm install` or build anything. It never includes your data or `.env`
files.

## 2. Install it

The server needs Node.js 22.9 or newer and `unzip`.

```bash
scp release/trellis-1.0.0.zip you@yourserver:/tmp/

# then, on the server:
cd /tmp && unzip -q trellis-1.0.0.zip
sudo mv trellis-1.0.0 /opt/trellis
cd /opt/trellis
sudo cp .env.example .env
sudo sh deploy/fix-permissions.sh
sudo -u www-data npm run set-password
sudo -u www-data npm run admin-url
```

In `.env`, set `PUBLIC_URL` to the site's address (`https://example.com`),
and leave `TRUST_PROXY=1` and `HOST=127.0.0.1` as they are. The server warns
you at start-up if `PUBLIC_URL` is missing.

`fix-permissions.sh` makes root the owner of the code and gives the app's
user (`www-data`) only `server/data`, so the app can never change its own
code. Run it again after updating by hand. The update command does it for
you.

## 3. systemd

```bash
sudo cp deploy/trellis.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now trellis
journalctl -u trellis -f
```

The unit runs the app as `www-data` in production mode, only lets it write to
`server/data`, and locks down the rest with systemd's sandboxing options.
Change `User` or `WorkingDirectory` if your setup is different.

## 4. nginx

[`deploy/nginx.conf`](../deploy/nginx.conf) is a complete example: a
redirect from HTTP to HTTPS, the HTTPS site proxying to `127.0.0.1:3001` with
a rate limit on sign-ins, and a catch-all server that drops requests for host
names you don't serve. You can only have one catch-all per port, so delete
that block if you already have one.

The proxy headers are in [`deploy/trellis-proxy.conf`](../deploy/trellis-proxy.conf).
It overwrites the `X-Forwarded-*` headers rather than passing on whatever the
visitor sent.

```bash
sudo cp deploy/trellis-proxy.conf /etc/nginx/snippets/
sudo cp deploy/nginx.conf /etc/nginx/sites-available/trellis
# set server_name and the certificate paths, then:
sudo ln -s /etc/nginx/sites-available/trellis /etc/nginx/sites-enabled/
sudo certbot --nginx -d example.com -d www.example.com   # if you need a certificate
sudo nginx -t && sudo systemctl reload nginx
```

Adding it to an existing site? Copy over the two `location` blocks, the
`limit_req_zone` line and `client_max_body_size 11m;`. Keep the
`X-Forwarded-Proto $scheme` header, because that's how the app knows a
request came in over HTTPS.

### Behind Cloudflare

With Cloudflare in front, nginx sees Cloudflare's IP address instead of the
visitor's. Everyone coming through the same Cloudflare data centre then
looks like one person: unique visitors are undercounted, and the limits on
sign-ins and the contact form are shared between them. The fix is a small
file that tells nginx to trust Cloudflare's `CF-Connecting-IP` header, but
only on requests that really come from Cloudflare:

```bash
sudo cp deploy/cloudflare-real-ip.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl reload nginx
```

The file lists Cloudflare's IP ranges, along with a one-liner to refresh
them if they ever change.

## 5. Once it's running

Check the page loads and that a made-up address like `/test` shows the 404
page. Sign in, turn on two-step sign-in (More > Sign-in & security) and keep
the recovery codes safe. Then press **Settings > Backup > Back up now** to
make sure backups work, and think about an
[off-site copy](data-and-backups.md#off-site-copies).

A quick checklist:

- `http://` redirects to `https://`, and `curl -I https://your-domain/` shows a
  `Strict-Transport-Security` header.
- `/admin` is a 404 and your editor address shows the sign-in page.
- If signing in silently does nothing, check `TRUST_PROXY=1` and the
  `X-Forwarded-Proto` header.
- Statistics count a visit from your phone when you're not signed in.

## HTTPS-only mode

In production the app insists on HTTPS. It redirects `http://` requests,
sends HSTS (without `includeSubDomains`, so your other subdomains aren't
affected), and its Content Security Policy only lets the page load scripts
from itself and frames from the embed providers it knows. Image and avatar
addresses are always saved as `https://`, and the sign-in cookie is `Secure`,
`HttpOnly` and `SameSite=Strict`. Requests to `localhost` are exempt, so local
development keeps working.

This needs `TRUST_PROXY=1` behind nginx. Without it the app can't tell a
request arrived over HTTPS, so it skips its own redirect and logs a warning.
The systemd units already set it. `FORCE_HTTPS=0` turns the whole thing off.

## Docker

```bash
docker build -t trellis .
docker run -d --name trellis --restart unless-stopped \
  -p 127.0.0.1:3001:3001 -v trellis-data:/data \
  -e NODE_ENV=production -e TRUST_PROXY=1 trellis
docker exec -it trellis node server/scripts/set-password.js
docker exec trellis node server/scripts/admin-url.js
```

Put the same nginx config in front of it. `deploy/docker-compose.yml` shows
how to run several sites. To update, rebuild the image and recreate the
container; the data volume stays.

## Updating

Build the new zip, copy it over and run:

```bash
cd /opt/trellis
sudo npm run update -- /tmp/trellis-1.0.0.zip
```

The update backs up the data folder first, swaps in the new code (keeping
your data, `.env` and any server presets), restarts the service and waits for
it to come back. If the new version hasn't started properly within 45
seconds, it puts the old one back and tells you to look at
`journalctl -u trellis -n 50`.

The previous version stays in `/opt/trellis.previous`, so going back is one
command:

```bash
sudo npm run update -- --rollback
```

`sudo npm run update -- --help` lists the options. The ones you're most
likely to need are `--force` to reinstall the same or an older version,
`--yes` to skip the question, and `--service` with `--health` when you run
several sites from one install, for example
`--service trellis@alice --health http://127.0.0.1:3101/api/health`.

### From a pre-release build

Servers running one of the test builds from before 1.0 (versions 1.2 to
1.4.6) see 1.0.0 as older and stop, so add `--force` the first time:

```bash
sudo npm run update -- --force /tmp/trellis-1.0.0.zip
```

Builds older than 1.2 don't have the update command yet. Run the one inside
the new zip instead:

```bash
cd /tmp && unzip -q -o trellis-1.0.0.zip
sudo node /tmp/trellis-1.0.0/server/scripts/update.js --dir /opt/trellis --force /tmp/trellis-1.0.0.zip
```

Pages from older versions are converted automatically.

<details>
<summary>Updating by hand</summary>

```bash
cd /tmp && unzip -q -o trellis-1.0.0.zip
sudo rsync -a --delete \
  --exclude '/server/data/' --exclude '/.env' --exclude '/presets/' \
  /tmp/trellis-1.0.0/ /opt/trellis/
sudo sh /opt/trellis/deploy/fix-permissions.sh
sudo systemctl restart trellis
```

</details>
