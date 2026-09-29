// The "web app manifest" that makes the app installable. It's built per group link, so the
// home-screen icon opens that group (not the demo at the main address).

export function manifestFor(groupCode: string | null): Record<string, unknown> {
  const code = groupCode && /^[A-Za-z0-9_-]{1,64}$/.test(groupCode) ? groupCode : null;
  const start = code ? `/g/${code}` : '/';
  return {
    id: start,
    name: 'Poker Night',
    short_name: 'Poker Night',
    description: 'Track buy-ins, count chips and settle up after your home game.',
    start_url: start,
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0F1512',
    theme_color: '#1C5A42',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
