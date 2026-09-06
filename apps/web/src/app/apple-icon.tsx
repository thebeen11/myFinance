import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/**
 * The iOS home-screen icon.
 *
 * iOS ignores an SVG touch icon, so this is the one place the mark has to be a
 * raster — generated here rather than checked in, so the repo keeps no binary and
 * the artwork stays a single source with `public/icon.svg`.
 *
 * Full bleed and square: iOS applies its own rounding and would otherwise round
 * an already-rounded tile twice, leaving a pale halo at each corner.
 */
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#45c06a"/>
  <g transform="translate(140 140) scale(9.3333)" fill="none" stroke="#121a1a" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
    <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/>
    <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
  </g>
</svg>`;

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      <img
        alt=""
        width={size.width}
        height={size.height}
        src={`data:image/svg+xml;base64,${Buffer.from(MARK).toString('base64')}`}
      />
    </div>,
    size,
  );
}
