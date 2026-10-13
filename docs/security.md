# Security

What Trellis does to protect a site, what's left up to you, and the things it
can't do.

## Signing in

The editor lives at a random path of about 144 bits, so it can't be guessed
or found by scanning. It isn't linked anywhere or listed in robots.txt, is
never shown to bots, and doesn't leak through the `Referer` header. Sign-in
requests have to include that path as well as the password, so a bot that
doesn't know the address can't even start guessing.

Passwords are at least eight characters, and they're stored as scrypt hashes
and compared in constant time. The server allows ten sign-in attempts per IP
address (or IPv6 /64) every 15 minutes, and 30 per IPv6 /48, so hopping
between addresses doesn't get anyone further. The example nginx config adds a
second limit in front of that.

Sessions live on the server. The browser just holds a signed cookie that's
`HttpOnly`, `SameSite=Strict` and, over HTTPS, `Secure`, and that lasts 30
days. Logging out ends the session on the server, and changing the password
signs out every device. Every change the editor sends also has to carry a
custom header, which a form on another site can't add.

Two-step sign-in uses ordinary authenticator app codes (TOTP). Each code
works once, recovery codes are stored hashed, and you need the password to
turn it off or make new recovery codes, so someone who has only stolen a
session can't switch it off. The editor also lists signed-in devices and
recent sign-in attempts.

## What gets saved

The server checks every save again from scratch. It drops unknown card types
and fields, limits the length of text, only allows hex colours, and only
allows `http(s)`, `mailto:` and `tel:` links. Rich text is cut down to a
short list of tags, and the browser rebuilds it from that list rather than
inserting HTML.

Uploads are identified by their contents rather than their name. JPEG, PNG,
GIF, WebP, AVIF, ICO and PDF are accepted, but SVG isn't, because it can
contain scripts. Location and camera details are removed from JPEG, PNG and
WebP photos. PDFs are always downloaded rather than opened inside the site.
Imported pages, backups and preset files go through the same checks.

## In the browser

The Content Security Policy only lets the page run its own scripts (the
inlined page data uses a nonce), and only lets it frame the embed providers
Trellis knows about. Embeds are built from IDs parsed out of the link, never
from the link itself. The usual headers are on every response:
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and
`X-Frame-Options`.

In production it's HTTPS only, with HSTS. See
[Deployment](deployment.md#https-only-mode).

## Requests the server makes

Live cards (Bluesky, Mastodon, GitHub, Instagram and blogs) are fetched by
the server, not the visitor. The feed endpoint takes a card ID rather than a
URL, so it can't be used as an open proxy. Those requests are https only, on
the normal port, with a size and time limit. They refuse private and internal
addresses (checked after DNS resolution, and again on every redirect, so DNS
tricks don't get round it). Results are cached for ten minutes.

## Up to you

- Run it behind HTTPS with `TRUST_PROXY=1` and `PUBLIC_URL` set.
- Use a strong password for each site, and turn on two-step sign-in.
- Keep the editor address to yourself, and change it with
  `npm run admin-url -- --rotate` if it might have leaked.
- Keep a backup somewhere other than the server. Backups contain the password
  hash and keys, so keep them private.
- Keep Node.js and the server's operating system up to date.
- Behind Cloudflare, install `deploy/cloudflare-real-ip.conf` so the sign-in
  limits apply per visitor (see [Deployment](deployment.md#behind-cloudflare)).

## Things it doesn't do

- Two-step sign-in is optional. Authenticator codes don't protect against a
  convincing fake sign-in page that passes the code on in real time.
  Passkeys aren't supported yet.
- The app's own sign-in limit is kept in memory and resets when it restarts.
  The nginx limit doesn't.
- AVIF and GIF uploads are stored as they are. AVIF photos straight from some
  cameras may still include location data.
- If you switch off click-to-load, players load the provider's scripts as soon
  as the page opens, which may need consent in the EU.
- Bot blocking relies on bots telling the truth about who they are. A
  scraper pretending to be a normal browser can't be spotted. If a page has
  to stay private, put a password on it in nginx.
- Uploads that are no longer used aren't cleaned up automatically.
- All sites on one server run as the same user unless you set each one up
  with its own (see the comment in `deploy/trellis@.service`).

## Reporting a problem

If you find a security problem, please don't open a public issue. Get in touch
with me privately instead.
