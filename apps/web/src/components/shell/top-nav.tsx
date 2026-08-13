'use client';

import { LogOut, Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { BrandMark } from '@/components/shell/brand-mark';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/merchants', label: 'Merchants' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/categories', label: 'Categories' },
] as const;

/**
 * Whether a nav pill owns the current route.
 *
 * A detail page belongs to its section — `/accounts/{id}` is still Accounts — so
 * an exact match alone would leave the nav unlit on every nested route. The
 * dashboard is the exception it has to be guarded against: `/` is a prefix of
 * literally every path, so it only ever matches itself.
 */
const isSectionActive = (pathname: string, href: string): boolean =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

/**
 * The nav row.
 *
 * There is deliberately no global search field and no notification bell here,
 * even though the reference design has both: search belongs to the transactions
 * page, and this product has no notifications. A control that does nothing is
 * worse than one that is absent — the mobile sheet inherits that stance.
 *
 * The pill row collapses into a sheet below `md`, not `sm`: five pills plus the
 * brand lockup and the avatar come to roughly 690px, which clears 768px and does
 * not clear 640px. Below that the row used to run off the side of the screen.
 */
export const TopNav = ({
  displayName,
  username,
  onSignOut,
  isSigningOut,
}: {
  displayName: string | null | undefined;
  username: string;
  onSignOut: () => void;
  isSigningOut: boolean;
}) => {
  const pathname = usePathname();
  const name = displayName ?? username;

  return (
    <header className="flex items-center gap-2 sm:gap-3">
      <Link href="/" className="flex items-center gap-2.5 rounded-2xl outline-none">
        <BrandMark />
        <span className="text-base font-semibold tracking-tight">Erumah</span>
      </Link>

      <nav className="ml-1 hidden items-center gap-1 sm:ml-4 md:flex">
        {NAV_LINKS.map((link) => {
          const isActive = isSectionActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'focus-visible:ring-ring/50 rounded-full px-3.5 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3 sm:px-4',
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
        <MobileNav pathname={pathname} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="focus-visible:ring-ring/50 flex items-center gap-2 rounded-full outline-none focus-visible:ring-3"
            >
              <span className="text-muted-foreground hidden max-w-40 truncate text-sm md:inline">
                {name}
              </span>
              <Avatar className="ring-foreground/8 size-9 ring-1">
                <AvatarFallback className="bg-inverted text-inverted-foreground text-xs font-medium">
                  {initials(name)}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <span className="block text-sm font-medium">{displayName ?? 'Signed in'}</span>
              <span className="text-muted-foreground block truncate text-xs">{username}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onSignOut} disabled={isSigningOut}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

/**
 * The same destinations as the pill row, as a left sheet.
 *
 * `SheetClose asChild` wraps each link so a tap both navigates and dismisses the
 * panel — App Router navigation leaves the dialog mounted, so without it the
 * sheet would sit open over the page it just moved to. Going through Radix's own
 * close also keeps focus restoration intact, which a manual `useState` would not.
 */
const MobileNav = ({ pathname }: { pathname: string }) => (
  <Sheet>
    <SheetTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-foreground bg-card ring-foreground/8 ring-1 md:hidden"
      >
        <Menu />
        <span className="sr-only">Open menu</span>
      </Button>
    </SheetTrigger>

    {/* The visible header is the brand lockup, which is not a heading; Radix
        still requires an accessible name, hence the visually hidden title. */}
    <SheetContent side="left" aria-describedby={undefined}>
      <SheetTitle className="sr-only">Navigation</SheetTitle>

      <div className="flex items-center gap-2.5">
        <BrandMark size="sm" />
        <span className="font-semibold tracking-tight">Erumah</span>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_LINKS.map((link) => {
          const isActive = isSectionActive(pathname, link.href);
          return (
            <SheetClose asChild key={link.href}>
              <Link
                href={link.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'focus-visible:ring-ring/50 rounded-full px-4 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                {link.label}
              </Link>
            </SheetClose>
          );
        })}
      </nav>
    </SheetContent>
  </Sheet>
);

/**
 * Placeholder with the same height, so the shell does not jump once auth resolves.
 * It has to mirror the real header's breakpoints too, or the jump just moves to
 * mobile: pills hidden below `md`, hamburger shown only there.
 */
export const TopNavSkeleton = () => (
  <header className="flex items-center gap-3">
    <BrandMark />
    <div className="bg-muted h-5 w-20 rounded-full" />

    <div className="ml-1 hidden items-center gap-1 sm:ml-4 md:flex">
      <div className="bg-muted h-9 w-28 rounded-full" />
      <div className="bg-muted h-9 w-32 rounded-full" />
      <div className="bg-muted h-9 w-28 rounded-full" />
      <div className="bg-muted h-9 w-28 rounded-full" />
      <div className="bg-muted h-9 w-28 rounded-full" />
    </div>

    <div className="ml-auto flex items-center gap-2">
      <div className="bg-muted size-9 rounded-full md:hidden" />
      <div className="bg-muted size-9 rounded-full" />
    </div>
  </header>
);
