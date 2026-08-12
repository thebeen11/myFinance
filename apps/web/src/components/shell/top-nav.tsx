'use client';

import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { BrandMark } from '@/components/shell/brand-mark';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
 * The pill nav row.
 *
 * There is deliberately no global search field and no notification bell here,
 * even though the reference design has both: search belongs to the transactions
 * page, and this product has no notifications. A control that does nothing is
 * worse than one that is absent.
 */
export const TopNav = ({
  displayName,
  email,
  onSignOut,
  isSigningOut,
}: {
  displayName: string | null | undefined;
  email: string;
  onSignOut: () => void;
  isSigningOut: boolean;
}) => {
  const pathname = usePathname();
  const name = displayName ?? email;

  return (
    <header className="flex items-center gap-2 sm:gap-3">
      <Link href="/" className="flex items-center gap-2.5 rounded-2xl outline-none">
        <BrandMark />
        <span className="hidden text-base font-semibold tracking-tight sm:inline">myFinance</span>
      </Link>

      <nav className="ml-1 flex items-center gap-1 sm:ml-4">
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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="focus-visible:ring-ring/50 ml-auto flex items-center gap-2 rounded-full outline-none focus-visible:ring-3"
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
            <span className="text-muted-foreground block truncate text-xs">{email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onSignOut} disabled={isSigningOut}>
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
};

/** Placeholder with the same height, so the shell does not jump once auth resolves. */
export const TopNavSkeleton = () => (
  <header className="flex items-center gap-3">
    <BrandMark />
    <div className="bg-muted h-9 w-28 rounded-full" />
    <div className="bg-muted h-9 w-32 rounded-full" />
    <div className="bg-muted h-9 w-28 rounded-full" />
    <div className="bg-muted h-9 w-28 rounded-full" />
    <div className="bg-muted h-9 w-28 rounded-full" />
    <div className="bg-muted ml-auto size-9 rounded-full" />
  </header>
);
