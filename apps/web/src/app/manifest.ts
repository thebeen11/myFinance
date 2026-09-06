import type { MetadataRoute } from 'next';

/**
 * What "Add to Home Screen" installs.
 *
 * `standalone` is the point of the whole mobile pass: without it the bottom tab
 * bar sits above Safari's own toolbar and the app reads as a web page wearing an
 * app's chrome. Colours are the sRGB rendering of `--background` from
 * `globals.css`, matching `viewport.themeColor` in `layout.tsx` — a manifest is
 * fetched standalone, so it cannot reference the token.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Erumah',
    short_name: 'Erumah',
    description: 'Personal finance tracking.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f1f4f2',
    theme_color: '#f1f4f2',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
