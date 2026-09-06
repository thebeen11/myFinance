'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { AccountMenu, type AccountMenuProps } from '@/components/shell/account-menu';
import { BrandMark } from '@/components/shell/brand-mark';
import { NAV_LINKS, isSectionActive } from '@/components/shell/nav-links';
import { cn } from '@/lib/utils';

/**
 * The desktop nav row.
 *
 * There is deliberately no global search field and no notification bell here,
 * even though the reference design has both: search belongs to the transactions
 * page, and this product has no notifications. A control that does nothing is
 * worse than one that is absent.
 *
 * Below `md` this header is not shown at all — `MobileHeader` and `BottomNav`
 * take over. The boundary is `md`, not `sm`, because five pills plus the brand
 * lockup and the avatar come to roughly 690px, which clears 768px and does not
 * clear 640px.
 */
export const TopNav = ({
  displayName,
  username,
  onSignOut,
  isSigningOut,
}: Omit<AccountMenuProps, 'showName'>) => {
  const pathname = usePathname();

  return (
    <header className="hidden items-center gap-3 md:flex">
      <Link href="/" className="flex items-center gap-2.5 rounded-2xl outline-none">
        <BrandMark />
        <span className="text-base font-semibold tracking-tight">Erumah</span>
      </Link>

      <nav className="ml-4 flex items-center gap-1">
        {NAV_LINKS.map((link) => {
          const isActive = isSectionActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'focus-visible:ring-ring/50 rounded-full px-4 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground bg-card ring-foreground/8 ring-1',
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <AccountMenu
          displayName={displayName}
          username={username}
          onSignOut={onSignOut}
          isSigningOut={isSigningOut}
          showName
        />
      </div>
    </header>
  );
};

/** Placeholder with the same height, so the shell does not jump once auth resolves. */
export const TopNavSkeleton = () => (
  <header className="hidden items-center gap-3 md:flex">
    <BrandMark />
    <div className="bg-muted h-5 w-20 rounded-full" />

    <div className="ml-4 flex items-center gap-1">
      <div className="bg-muted h-9 w-28 rounded-full" />
      <div className="bg-muted h-9 w-32 rounded-full" />
      <div className="bg-muted h-9 w-28 rounded-full" />
      <div className="bg-muted h-9 w-28 rounded-full" />
      <div className="bg-muted h-9 w-28 rounded-full" />
    </div>

    <div className="ml-auto flex items-center gap-2">
      <div className="bg-muted size-9 rounded-full" />
    </div>
  </header>
);
