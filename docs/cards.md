# Cards

Cards (called tiles in the code) are what a page is made of. Any card can be
moved, resized, duplicated or deleted; the [editor guide](editor-guide.md)
explains how.

A card that isn't finished yet, like a file card without a file or a gallery
without photos, shows a hint in the editor but stays off the live page until
you fill it in.

## Links

| Card | What it shows | Notes |
| --- | --- | --- |
| Link button | A slim, full-width row with an icon and a title | Really just a link card that's one row tall. Any card can be one row tall |
| Link card | Icon, title, subtitle and a button such as "Join" or "Support" | The icon, colour and button text come from the address |
| Link list | Several links stacked in one card | Web links, email addresses and `tel:` numbers. Two columns when it's 3 or 4 wide |
| Email | A `mailto:` link and a "Copy address" button | You can add a subject line that's filled in when the visitor's mail app opens |
| WhatsApp | A "Message me" card that opens a chat | Use the full international number, e.g. `+44 7700 900123`. It's visible on the page. You can add a starting message |

## Writing

| Card | What it shows | Address to use |
| --- | --- | --- |
| Substack | Your latest posts and "Subscribe" | `https://<you>.substack.com` |
| Medium | Latest posts and "Follow" | `https://medium.com/@<you>` |
| WordPress.com | Latest posts and "Read" | `https://<site>.wordpress.com` |
| Blogger | Latest posts and "Read" | `https://<blog>.blogspot.com` |
| Tumblr | Latest posts and "Follow" | `https://www.tumblr.com/<you>` |
| Notion | A link to the page, or the page itself in a tall card | To show the page inside the card, publish it to the web in Notion and use the `notion.site` link. Private pages can only be linked |

The five blog services all use the Blog card. Posts come from the blog's
public feed, which your server fetches.

## Social networks

| Card | What it shows | Notes |
| --- | --- | --- |
| Twitter | Profile card; a tall card can embed one post | Listed as "X / Twitter" in the editor. Twitter doesn't allow embedding a whole timeline any more |
| Instagram | Profile card | |
| Instagram feed | Your latest posts in a grid | Needs an Instagram token, see [below](#instagram-feed) |
| Facebook | Profile or Page card; tall cards can show a Page's timeline | Timelines only work for public Pages |
| LinkedIn | Profile card with your headline; tall cards can embed a post | LinkedIn has no profile embed |
| Bluesky | Profile, followers and your latest post | |
| Mastodon | The same, on any server (`you@instance.social`) | |

## Creators

| Card | Shows | Notes |
| --- | --- | --- |
| GitHub | Followers, repo count and your top repositories | Paste `github.com/<you>`. Fetched from GitHub's public API |
| Buy Me a Coffee, Ko-fi, Patreon | Link card with a support button | |
| Discord | Link card with "Join" | Use an invite link that never expires |
| DeviantArt, Flickr | Link card | |

## Music and video

| Card | Notes |
| --- | --- |
| Spotify | Playlists, albums, tracks, artists and podcasts. One row tall gives the compact player |
| Apple Music | In Apple Music use Share > Copy Link. One row tall gives the compact player |
| SoundCloud | Tracks, playlists or a profile |
| Bandcamp | Bandcamp needs the album number: on Bandcamp choose Share / Embed, copy the embed code and paste it into the card |
| YouTube | Uses YouTube's privacy-enhanced player |
| Vimeo | Any `vimeo.com` link, unlisted ones included, as long as the video allows embedding |
| TikTok | The full `tiktok.com/@you/video/<id>` address (short `vm.tiktok.com` links can't be embedded) |
| Twitch | Your stream, or the latest broadcast when you're offline |
| Pinterest | A single pin. Boards and profiles become link cards |
| Pandora | A link card, since Pandora has no embeddable player |

None of the players load anything from the provider until the visitor
clicks (see [Visitors](visitors.md#click-to-load-players)).

## Content

| Card | What it shows |
| --- | --- |
| Rich text | Formatted text with headings, lists, quotes and links. At one row tall it becomes a single line |
| Section title | A full-width heading for grouping cards |
| Image | A photo, with an optional caption and link |
| Photo gallery | Up to 20 photos as a swipeable carousel or a grid (the grid shows up to 9) |
| Countdown | Days, hours, minutes and seconds to a date, then your own "it's here" text, with an optional button |
| File download | A PDF of up to 10 MB: a CV, a menu, a price list |

## Contact and bookings

| Card | Notes |
| --- | --- |
| Contact form | Opens a form with name, email, an optional phone number and a message. Messages arrive in **More > Inbox**, and visitors never see your email address |
| Newsletter | An email box that signs people up with Buttondown, Mailchimp, Kit or MailerLite (connect it under Settings > Integrations). Trellis doesn't keep the list itself |
| Booking | Your Cal.com or Calendly page, shown inside the card when it's tall enough |
| Save my contact | A button that downloads a `.vcf` contact card. Everything in it is public |
| Map | An OpenStreetMap map with a pin. Type an address and press Find |

## Shop and tips

Trellis never takes payments. These cards link to payment pages you set up
yourself with Stripe Payment Links, PayPal.me, Ko-fi, Gumroad, Etsy or
similar.

- **Product:** a photo, name, price, short description, an optional badge
  ("New", "−20%") and a Buy button.
- **Tip jar:** up to six amount buttons, each with its own payment link.

## Everything else

Links to most other well-known sites get the right icon automatically:
Threads, YouTube channels, GitLab, Reddit, Telegram, Signal, Dribbble,
Behance and plenty more. Anything else gets a globe icon and the site's
name. You can also give a link card your own thumbnail picture.

## Card settings

Every card has a **Card settings** section at the bottom of its dialog:

- **Visibility:** hide the card, or only show it between two dates. Hidden
  cards are never sent to visitors' browsers.
- **Lock:** show a sensitive-content warning or an age check first, or keep
  the card locked behind a code. A code-locked card's content stays on the
  server until someone types the right code (ten tries per 15 minutes). The
  warning and the age check are a courtesy; nothing is verified.
- **Look:** the card's own background and text colours, and a spotlight
  animation (pulse, wiggle, shine, bounce or glow) for the one card you want
  people to notice.

## Instagram feed

Meta only lets you show your own posts through its official API, so this
takes a few steps:

1. Make the Instagram account a Business or Creator account (it's free, in the
   Instagram app under Settings > Account type and tools).
2. At <https://developers.facebook.com>, create a Business app, add the
   Instagram product and choose *API setup with Instagram login*.
3. Under *Generate access tokens*, add the account and generate a token.
4. In the editor, go to **Settings > Integrations**, paste the token and press
   Connect.

The token stays on the server, and the server renews it every week or so,
before Instagram's 60-day expiry.

## Live data

Bluesky, Mastodon, Instagram, GitHub and blog cards are filled in by your
server, which caches the data for ten minutes. Visitors' browsers never talk
to those services directly.

If an embedded Notion page stays blank, check it's published to the web and
that embedding isn't switched off in Notion. It still works as a link either
way.

Logos belong to the companies they represent. See [Design](design.md#icons)
before recolouring them on a business site.
