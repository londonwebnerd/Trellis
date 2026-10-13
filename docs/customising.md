# Customising

Most changes happen in the editor and need nothing else. If you run the
server you can also install presets for every site on it, and if you're
happy editing the code you can add fonts, effects, card styles and card
types.

## Presets

A preset is a saved design: mode, colours, background, effect, card style,
radius, font, animation and so on. Applying one copies those values into the
page, so you can carry on changing things afterwards, and Undo puts it all
back. Presets never touch your cards, text or profile.

The Design panel shows the built-in presets, then any installed on the
server, then the ones saved on this page under **My presets**.

### Saving your own

Get the page looking the way you want, then under **My presets** click **Save
current design** and give it a name. Saving again under the same name
updates it. Hover a saved preset to export or delete it.

Saved presets are stored in the page itself, so they're in your backups and
in the JSON export. A page can keep up to 24.

### Moving a design to another site

**Export** downloads a small `.json` file and **Import** adds one to My
presets on another site. Uploaded background photos aren't included,
because they only exist on the server they were uploaded to, so upload the
photo again on the other side. Background images given as an `https://`
address are kept.

### Offer presets to every site on a server

Put exported `.json` files straight into the `presets/` folder of the
install, for example `/opt/trellis/presets/studio.json`, and they show up in
every editor under "On this server". There's no need to restart. There are a
couple of examples in `presets/examples/` to start from.

If you run several sites, point them all at one folder with
`PRESETS_DIR=/etc/trellis/presets` in each site's `.env`. Broken files are
skipped with a warning in the log. Up to 50 files are read, and anything in a
sub-folder is ignored. The update command leaves `presets/` alone, so your
files survive updates. With Docker, mount a folder at `/app/presets`.

### The preset file format

```json
{
  "trellisPreset": 1,
  "name": "Forest",
  "theme": "dark",
  "accent": "#4ade80",
  "appearance": {
    "colors": { "bg": "#0c1410", "card": "#14201a", "text": "#e7f3ea", "muted": "#8fa898" },
    "background": { "type": "gradient", "color1": "#0c1410", "color2": "#173326", "angle": 170, "effect": "fireflies", "speed": "slow" },
    "cardStyle": "glass",
    "glassClarity": 60,
    "radius": 20,
    "font": "outfit",
    "animation": "subtle"
  }
}
```

Only `name` and `appearance` are required. Anything you leave out gets the
default, and anything the server doesn't recognise is ignored. Colours are
hex codes.

| Field | Values | Default |
| --- | --- | --- |
| `name` | Up to 40 characters | required |
| `theme` | `auto`, `light`, `dark` | `auto` |
| `accent` | Hex colour | `#0a84ff` |
| `appearance.colors.bg` / `card` / `text` / `muted` | Hex colour, or `""` to follow the theme | `""` |
| `appearance.background.type` | `none`, `gradient`, `image` | `none` |
| `appearance.background.color1` / `color2` | Gradient colours (also used by Aurora and Flow) | `#a1c4fd` / `#c2e9fb` |
| `appearance.background.angle` | 0 to 360 | `135` |
| `appearance.background.image` | An `https://` image address | `""` |
| `appearance.background.dim` / `blur` | Darken (0 to 80) and blur (0 to 30) a photo | `0` |
| `appearance.background.pattern` | `none`, `dots`, `grid` | `none` |
| `appearance.background.effect` | `none`, `aurora`, `flow`, `orbs`, `waves`, `stars`, `fireflies`, `snow`, `ripples`, `grid` | `none` |
| `appearance.background.speed` | `slow`, `normal`, `fast` | `normal` |
| `appearance.cardStyle` | `solid`, `glass`, `crystal`, `outline`, `flat`, `hairline` | `solid` |
| `appearance.glassClarity` | 0 (frosted) to 100 (clear) | `50` |
| `appearance.radius` | 0 to 36 | `24` |
| `appearance.font` | `system`, `serif`, `mono`, `rounded`, `inter`, `grotesk`, `outfit`, `playfair` | `system` |
| `appearance.animation` | `none`, `subtle`, `lively` | `subtle` |
| `appearance.buttonShape` | `card`, `pill`, `square` | `card` |
| `appearance.buttonFill` | `card`, `solid`, `outline`, `soft` | `card` |
| `appearance.iconStyle` | `brand`, `tinted`, `accent`, `mono`, `soft`, `outline` | `brand` |
| `appearance.avatarTone` | `color`, `mono` | `color` |
| `appearance.avatarEffect` | `auto`, `none`, `float`, `breathe`, `glow`, `pulse`, `ring`, `wobble`, `spin`, `glitch` | `auto` |

## Changing the code

The rest of this page assumes you're comfortable with the code. Whatever you
add, the client and the server both need to know about it, because the
server rejects values it doesn't recognise. Run `npm run lint` and
`npm test` afterwards. [Development](development.md) explains how the code
is laid out.

### Built-in presets

They're the `PRESETS` list in `client/src/lib/appearance.js`, in the same
shape as a preset file plus a `key`. Pages that used a preset you remove keep
their design, because applying a preset copies it into the page. For a design
only your own sites need, a server preset file is usually less work.

### A new font

1. `npm i -w client @fontsource-variable/<font>` and import its CSS in
   `client/src/main.jsx`. Don't link Google Fonts: the Content Security
   Policy blocks them, and self-hosting keeps visitors' IP addresses private.
2. Add it to `FONT_STACKS` in both `client/src/lib/appearance.js` and
   `server/src/lib/appearance.js`, and to the `font` list in
   `server/src/lib/validate.js`.
3. Add a button for it in `DesignPanel.jsx` and a preview rule in
   `editor.css`.

### A new animated background

Add the key to the `effect` list in `validate.js`, render it in
`PageBackground.jsx`, and style it as `.fx-<key>` in `base.css`. Stick to
animating `transform` and `opacity` so it stays smooth on phones, and
multiply durations by `var(--fx-speed)`. Then add it to the list in
`DesignPanel.jsx`. Visitors who prefer reduced motion get it switched off
automatically.

### A new card style

Add it to the `cardStyle` list in `validate.js`, style it with
`:root[data-cards='<key>'] .tile-cell` in `base.css`, then add it to the
panel and to the preview in `PresetPicker.jsx`.

### Default colours and the starter page

The light and dark palettes live at the top of `client/src/styles/base.css`.
If you change them, update `THEME_DEFAULTS` in `appearance.js` to match. New
installs start from `server/src/lib/defaultPage.js`.

For new card types and platform icons, see
[adding a card type](development.md#adding-a-card-type) and
[adding a platform icon](development.md#adding-a-platform-icon).

## Keeping changes across updates

Anything you do in the editor, presets included, is part of the page data
and updates never touch it. Server preset files survive updates too. Code
changes don't: a new release replaces the code, so keep your changes on a
branch or a fork, merge new versions into it and build your own zip.
