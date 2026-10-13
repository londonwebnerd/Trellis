# Visitors, forms and statistics

All of this runs on your own server. Nothing goes to Google or an analytics
company, and visitors don't get any cookies, so there's no need for a cookie
banner.

## Statistics

**More > Statistics** shows the last 7, 30 or 90 days, or the whole year:
views, unique visitors, clicks and the click rate, a chart per day, your most
clicked cards, short link visits, the sites people came from, countries (or
browser languages), devices, browsers, operating systems and campaign tags.
**Export CSV** downloads the lot.

The page sends a tiny beacon when it opens and when someone clicks a card.
Bots, AI agents, you (while you're signed in) and anyone whose browser sends
*Do Not Track* or *Global Privacy Control* aren't counted.

Unique visitors are worked out the way Plausible and Fathom do it: a hash of
the IP address and browser with a random key that changes every day and is
never saved. No IP addresses are stored, only daily totals, and days older
than 400 are deleted. Days run midnight to midnight UTC.

You can switch statistics off under **Settings > Statistics**.

### Campaigns

Share the page as `https://yoursite.com/?utm_source=instagram&utm_campaign=spring`
and those names show up under Campaigns (`?ref=newsletter` works as well).

**Tag outgoing links**, in the same settings, does the opposite: links to
other sites get `utm_source=<your site>&utm_medium=link-in-bio` added, so
their statistics show the visit came from you. Links that already have `utm_`
tags are left alone.

### Countries

Your server only knows the visitor's country if the proxy in front of it
says so. Cloudflare sends a `CF-IPCountry` header, so behind Cloudflare it
just works. With nginx you can use the GeoIP2 module and the free MaxMind
GeoLite2 database:

```nginx
geoip2 /usr/share/GeoIP/GeoLite2-Country.mmdb {
    $geoip2_country_code country iso_code;
}
# in the location block that proxies to Trellis:
proxy_set_header X-Country-Code $geoip2_country_code;
```

and then set `GEO_HEADER=X-Country-Code` in `.env`. Without a country header,
the statistics show browser languages instead.

If you're not behind Cloudflare, it's worth clearing that header in nginx
(`proxy_set_header CF-IPCountry "";`), otherwise anyone could send a made-up
country.

### Behind Cloudflare

Install `deploy/cloudflare-real-ip.conf` as described in
[Deployment](deployment.md#behind-cloudflare). Without it, everyone reaching
you through the same Cloudflare data centre looks like a single visitor.

## Click-to-load players

YouTube, Vimeo, Spotify, SoundCloud, TikTok, Instagram, maps, booking pages
and the other embeds start out as a small notice with a **Load** button.
Nothing is fetched from those companies until the visitor clicks, which is
what EU privacy rules expect. They can tick "Always load from YouTube" (or
whichever service it is), and that choice is remembered in their own browser.

If you'd rather players load straight away, switch it off under **Settings >
Visitors**.

## Contact form and inbox

The Contact form card opens a form asking for a name, an email address, an
optional phone number and a message. Messages land in **More > Inbox**, where
you can reply by email, mark them unread, delete them or export them as CSV.

Each visitor can send five messages every ten minutes (contact and
newsletter forms together, and a message rejected for a typo doesn't
count). Known bots are turned away, and a hidden field that only bots fill
in catches most of the rest.

### Getting an email for each message

Give the server an SMTP account in `.env`, either your own email provider's
or a sending service like Mailgun, Postmark, Brevo or Amazon SES:

```ini
SMTP_URL=smtps://user:password@smtp.example.com:465
NOTIFY_EMAIL=you@example.com
SMTP_FROM=Trellis <noreply@example.com>   # optional
```

Restart the server afterwards. Replying to the email goes straight to the
visitor. Messages are always saved to the inbox first, so a failed email
doesn't lose anything. Special characters in the password need
URL-encoding (`@` becomes `%40`).

Messages are personal data, so delete the ones you don't need and mention
the form in your privacy notice if you have one.

## Newsletter sign-ups

Connect your newsletter under **Settings > Integrations**, then add a
Newsletter card.

| Service | What you need |
| --- | --- |
| Buttondown | An API key |
| Mailchimp | An API key and the audience ID |
| Kit (ConvertKit) | A v4 API key and the form ID |
| MailerLite | An API token, and optionally a group ID |

Email addresses go straight to the service; Trellis doesn't keep a list.
Mailchimp always sends a confirmation email. For the others, turn on double
opt-in in the service itself if you want it.

## Share button

The round button in the corner opens a share sheet with a QR code, Copy link,
the phone's own share menu, and the QR code as a PNG or SVG download for
print. It can be turned off under **Settings > Visitors**.
