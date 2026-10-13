# Multiple sites

One running copy of Trellis serves one page. To host pages for several
people, run one instance per site from the same code, each with its own data
folder, port and editor address. The sites can't see or affect each other,
and each one can be backed up, moved or removed on its own.

## With systemd

[`deploy/trellis@.service`](../deploy/trellis@.service) is a template unit
that runs as many instances as you like from `/opt/trellis`. Each one gets a
settings file in `/etc/trellis/<name>.env` and its data in
`/var/lib/trellis/<name>`.

```bash
sudo cp deploy/trellis@.service /etc/systemd/system/
sudo mkdir -p /etc/trellis

# a site called "alice" on port 3101
printf 'PORT=3101\nHOST=127.0.0.1\nPUBLIC_URL=https://alice.example.com\n' | sudo tee /etc/trellis/alice.env
sudo systemctl daemon-reload
sudo systemctl enable --now trellis@alice

# her password and editor address
cd /opt/trellis
sudo -u www-data env DATA_DIR=/var/lib/trellis/alice node server/scripts/set-password.js
sudo -u www-data env DATA_DIR=/var/lib/trellis/alice node server/scripts/admin-url.js
```

## With Docker Compose

[`deploy/docker-compose.yml`](../deploy/docker-compose.yml) has two example
sites built from one image, each with its own volume and port. Copy a
service block to add another.

```bash
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml exec alice node server/scripts/set-password.js
docker compose -f deploy/docker-compose.yml exec alice node server/scripts/admin-url.js
```

## nginx

Give each site its own domain or subdomain and certificate:

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name alice.example.com;
    ssl_certificate     /etc/letsencrypt/live/alice.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/alice.example.com/privkey.pem;
    client_max_body_size 11m;

    location / {
        proxy_pass http://127.0.0.1:3101;
        include snippets/trellis-proxy.conf;
    }
}
```

`sudo certbot --nginx -d alice.example.com` gets the certificate. Copy the
port 80 redirect from `deploy/nginx.conf`.

## Presets for everyone

Presets in `/opt/trellis/presets/` show up in every site's editor under "On
this server". To give a site its own set, point it somewhere else with
`PRESETS_DIR` in its `.env`. See [Customising](customising.md#offer-presets-to-every-site-on-a-server).

## Handing a site over

Send the person their editor address and, separately, their password. Or
set a temporary password and change it to one they choose. Point them at the
[editor guide](editor-guide.md) and ask them to turn on two-step sign-in. If
they ever lose their phone and their recovery codes:

```bash
sudo -u www-data env DATA_DIR=/var/lib/trellis/alice node server/scripts/reset-2fa.js
```

## Backups and updates

Each site backs itself up every night into its own data folder. Add
`BACKUP_COPY_DIR` or the S3 settings to a site's `.env` for an off-site copy.

One update covers every site, as long as you name each service and its health
check:

```bash
cd /opt/trellis
sudo npm run update -- /tmp/trellis-<version>.zip \
  --service trellis@alice --health http://127.0.0.1:3101/api/health \
  --service trellis@bob   --health http://127.0.0.1:3102/api/health
```

If any of them doesn't come back up, they all go back to the previous
version.

Each instance uses roughly 70 to 90 MB of memory and almost no CPU when it's
idle, so a small VPS with 1 or 2 GB of RAM can run a dozen or so.

## Removing a site

Take a last backup first, then:

```bash
sudo systemctl disable --now trellis@alice
sudo rm /etc/trellis/alice.env
sudo rm -r /var/lib/trellis/alice
```
