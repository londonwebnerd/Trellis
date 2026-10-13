/**
 * The starter page created on first run, so the site isn't empty before
 * you log in and make it your own. Sizes: w = columns (1-4), h = half-cell
 * rows (2 = square, 1 = a slim button bar).
 */
import { randomUUID } from 'node:crypto';

const id = () => `t_${randomUUID().slice(0, 8)}`;

export function createDefaultPage() {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    profile: {
      name: 'Your Name',
      bio: 'Hi! This is my corner of the internet. Open your private editor link (run `npm run admin-url` on the server) to make this page your own.',
      location: '',
      avatar: '',
      avatarStyle: 'notionists',
      avatarSeed: '',
    },
    settings: {
      theme: 'auto',
      accent: '#0a84ff',
      pageTitle: '',
      description: '',
    },
    tiles: [
      { id: id(), type: 'heading', w: 4, h: 1, data: { text: 'Find me online' } },
      { id: id(), type: 'x', w: 1, h: 2, data: { username: 'yourhandle' } },
      { id: id(), type: 'bluesky', w: 1, h: 2, data: { handle: 'bsky.app', showLatest: false } },
      { id: id(), type: 'linkedin', w: 2, h: 2, data: { url: 'https://www.linkedin.com/in/yourname', subtitle: "Let's connect" } },
      { id: id(), type: 'link', w: 4, h: 1, data: { url: 'https://example.com', title: 'My latest project' } },
      {
        id: id(),
        type: 'text',
        w: 2,
        h: 2,
        data: { html: '<h3>About me</h3><p>I build things for the web. Ask me about <strong>home labs</strong>, <em>VPNs</em> and self-hosting.</p>' },
      },
      {
        id: id(),
        type: 'linklist',
        w: 2,
        h: 4,
        data: {
          title: 'Useful links',
          links: [
            { label: 'My blog', url: 'https://example.com/blog' },
            { label: 'GitHub', url: 'https://github.com/' },
            { label: 'Email me', url: 'mailto:hello@example.com' },
          ],
        },
      },
      { id: id(), type: 'spotify', w: 2, h: 2, data: { url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M' } },
      { id: id(), type: 'email', w: 2, h: 2, data: { email: 'hello@example.com', title: 'Say hello' } },
    ],
  };
}
