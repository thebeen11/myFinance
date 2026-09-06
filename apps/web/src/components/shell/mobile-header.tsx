'use client';

import { ChevronLeft } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';

import { AccountMenu, type AccountMenuProps } from '@/components/shell/account-menu';
import { BrandMark } from '@/components/shell/brand-mark';
import { activeNavLink, isDetailRoute } from '@/components/shell/nav-links';
import { Button } from '@/components/ui/button';

/**
 * The phone's title bar.
 *
 * Sticky rather than fixed: it participates in the page's own scroll container,
 * so nothing has to reserve space for it and the content below it is never
 * covered. The translucent ground plus `backdrop-blur` is what makes the page
 * read as scrolling *under* the chrome, which is the whole difference between a
 * document and an app.
 *
 * `pt-(--safe-t)` is inside the sticky element, not around it, so the status-bar
 * inset stays filled when the header pins.
 */
export const MobileHeader = ({
  displayName,
  username,
  onSignOut,
  isSigningOut,
}: Omit<AccountMenuProps, 'showName'>) => {
  const pathname = usePathname();
  const router = useRouter();
  const section = activeNavLink(pathname);

  return (
    <header className="border-border bg-background/80 supports-backdrop-filter:backdrop-blur-md sticky top-0 z-30 -mx-3 flex items-center gap-2 border-b px-3 pt-(--safe-t) pb-2 sm:-mx-5 sm:px-5 md:hidden">
      {isDetailRoute(pathname) ? (
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2 shrink-0"
          onClick={() => router.back()}
        >
          <ChevronLeft />
          <span className="sr-only">Back</span>
        </Button>
      ) : (
        <BrandMark size="sm" />
      )}

      <span className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">
        {section?.label ?? 'Erumah'}
      </span>

      <AccountMenu
        displayName={displayName}
        username={username}
        onSignOut={onSignOut}
        isSigningOut={isSigningOut}
      />
    </header>
  );
};

/** Same height as the real header, so the shell does not jump once auth resolves. */
export const MobileHeaderSkeleton = () => (
  <header className="border-border bg-background/80 sticky top-0 z-30 -mx-3 flex items-center gap-2 border-b px-3 pt-(--safe-t) pb-2 sm:-mx-5 sm:px-5 md:hidden">
    <BrandMark size="sm" />
    <div className="bg-muted h-5 w-24 flex-1 rounded-full" />
    <div className="bg-muted size-9 shrink-0 rounded-full" />
  </header>
);
