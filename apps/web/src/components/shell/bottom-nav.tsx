'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV_LINKS, isSectionActive } from '@/components/shell/nav-links';
import { cn } from '@/lib/utils';

/**
 * The phone's primary navigation.
 *
 * Fixed to the bottom because that is where a thumb is, and because it replaces
 * the left hamburger sheet the desktop header used to collapse into — one nav,
 * always visible, no gesture required to find out where you can go.
 *
 * `pb-(--safe-b)` sits inside the bar rather than under it, so the bar's own
 * surface fills the home-indicator strip instead of leaving a pale band there.
 */
export const BottomNav = () => {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="border-border bg-background/85 supports-backdrop-filter:backdrop-blur-md fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t pb-(--safe-b) md:hidden"
    >
      {NAV_LINKS.map((link) => {
        const isActive = isSectionActive(pathname, link.href);
        const Icon = link.icon;

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'focus-visible:ring-ring/50 flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 outline-none focus-visible:ring-3 focus-visible:ring-inset',
              // The active tab is named as well as coloured: the icon sits in a
              // filled pill and the caption goes to full contrast, so the state
              // survives both daylight and a colour-blind reader.
              isActive ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                isActive && 'bg-primary/15',
              )}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <span
              className={cn(
                'max-w-full truncate text-[10px]',
                isActive ? 'font-semibold' : 'font-medium',
              )}
            >
              {link.short}
            </span>
          </Link>
        );
      })}
    </nav>
  );
};
