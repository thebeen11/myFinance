import { House, Receipt, Store, Tags, Wallet, type LucideIcon } from 'lucide-react';

export interface NavLink {
  href: string;
  /** The section's name, as a heading. */
  label: string;
  /** The tab-bar caption, which has ~70px to live in. */
  short: string;
  icon: LucideIcon;
}

/**
 * The app's destinations, in one place.
 *
 * Three surfaces read this — the desktop pill row, the mobile tab bar and the
 * mobile header's title — so a route added here appears in all of them at once.
 */
export const NAV_LINKS: readonly NavLink[] = [
  { href: '/', label: 'Dashboard', short: 'Home', icon: House },
  { href: '/transactions', label: 'Transactions', short: 'Records', icon: Receipt },
  { href: '/merchants', label: 'Merchants', short: 'Merchants', icon: Store },
  { href: '/accounts', label: 'Accounts', short: 'Accounts', icon: Wallet },
  { href: '/categories', label: 'Categories', short: 'Categories', icon: Tags },
];

/**
 * Whether a nav entry owns the current route.
 *
 * A detail page belongs to its section — `/accounts/{id}` is still Accounts — so
 * an exact match alone would leave the nav unlit on every nested route. The
 * dashboard is the exception it has to be guarded against: `/` is a prefix of
 * literally every path, so it only ever matches itself.
 */
export const isSectionActive = (pathname: string, href: string): boolean =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

/** The entry that owns `pathname`, or `undefined` on a route outside the nav. */
export const activeNavLink = (pathname: string): NavLink | undefined =>
  NAV_LINKS.find((link) => isSectionActive(pathname, link.href));

/**
 * Whether the route is a detail page rather than a section root.
 *
 * The mobile header shows a back button here instead of the brand lockup — the
 * tab bar can return to the section, but only this can return to the list the
 * user actually came from.
 */
export const isDetailRoute = (pathname: string): boolean => {
  const section = activeNavLink(pathname);
  return section !== undefined && section.href !== '/' && pathname !== section.href;
};
