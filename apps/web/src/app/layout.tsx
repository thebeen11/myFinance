import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Geist } from 'next/font/google';

import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { Providers } from './providers';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Erumah',
  description: 'Personal finance tracking.',
  // Standalone mode is what turns the bottom tab bar and the safe-area padding
  // into a real app shell rather than a page that happens to be narrow.
  appleWebApp: { capable: true, title: 'Erumah', statusBarStyle: 'default' },
};

/**
 * `viewportFit: 'cover'` is the prerequisite for `env(safe-area-inset-*)`: without
 * it iOS reports every inset as zero and the tab bar sits under the home indicator.
 *
 * Zoom is deliberately left enabled. PRODUCT.md's accessibility floor is daylight
 * legibility, and `maximumScale`/`userScalable: false` would trade that away to
 * solve a problem already solved properly — `ui/input.tsx` renders 16px text below
 * `md`, which is what stops iOS zooming on focus.
 *
 * `themeColor` must be a literal sRGB colour; Safari does not resolve `oklch()`
 * here. This is the sRGB rendering of `--background` in `globals.css`.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f1f4f2',
};

// Chrome lives in the (app) layout, so signed-out routes render on a bare page.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn('font-sans', geist.variable)}>
      <body className="bg-background text-foreground min-h-svh antialiased">
        <Providers>
          {children}
          <Toaster richColors />
        </Providers>
      </body>
    </html>
  );
}
