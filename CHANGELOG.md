# Changelog

## 1.0.2 (13 October 2026)

- The editor's More menu scrolls when a phone is held sideways. Before, the
  bottom items (Statistics, for one) were pushed off the screen.
- The small "days, hours, min, sec" labels on countdown cards are easier
  to read.
- The download links in the share dialog use the contrast-checked accent,
  like links in text cards, instead of the raw accent colour.

## 1.0.1 (13 October 2026)

Small fixes after going through the page and editor at every screen size.

- One-column button cards (LinkedIn, Email and so on at the smallest size)
  showed "Li…" because the subtitle and arrow took the room. They now show
  the full title, over two lines if needed.
- The Delete and Done buttons stay at the bottom of the card editor instead
  of disappearing below the edge of a laptop or phone screen.
- Grey secondary text is darkened slightly where a design left it too
  faint to read comfortably (Sunset most of all, also Sage, Dusk, Blossom
  and a few others). Your own colour choices get the same check.
- Countdown digits on solid-colour button cards (Pop, Citrus) are easier
  to read.
- Long text cards can be scrolled with the keyboard.
- Reloading the page or clicking the same card over and over no longer
  inflates the statistics: one view per visitor every 30 minutes, one
  click per card every five minutes.
- A shorter hint in the Add box on phones, so it isn't cut off.

## 1.0.0 (13 October 2026)

First public release.

Cards for links and buttons, link lists, text, images and section titles.
Social cards for X, Instagram (a profile or a live feed), Facebook, LinkedIn,
Bluesky and Mastodon, with the last few posts where the network allows it,
and GitHub with your top repositories. Blog cards for Substack, Medium,
WordPress.com, Blogger, Tumblr and Notion. Players for Spotify, Apple Music,
SoundCloud, Bandcamp, YouTube, Vimeo, TikTok, Twitch and Pinterest. There's
also a contact form with an inbox, newsletter sign-up, Cal.com and Calendly
booking, maps, a contact card (vCard), email and WhatsApp, a photo gallery,
a countdown, PDF downloads, products and tip jars. Any card can be hidden,
scheduled, locked behind a warning, age check or code, recoloured or
highlighted.

The editor has drag and drop, resizing, undo, autosave, drafts, version
history and a phone preview, and works with a mouse, keyboard or touch
screen. It's safe to have open in two tabs. It sits at a random secret
address, with optional two-step sign-in and a list of signed-in devices.

There are 24 design presets and you can save, export and import your own.
Colours, gradients, photo backgrounds, nine animated backgrounds, six card
styles, eight self-hosted fonts and drawn avatars. Pages work on phones down
to 320px wide.

Statistics are kept on your own server, without cookies. One setting hides
the site from search engines and crawlers, and another blocks AI crawlers
and agents. Players only load when someone clicks them. Short links and a
share button with a QR code are included.

It ships as a single zip that only needs Node.js 22.9 or newer. It comes
with nginx, systemd and Cloudflare configs, nightly backups that can be
copied off the server, updates that roll back if something goes wrong, and
support for several sites on one server.
