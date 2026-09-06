'use client';

import { LogOut } from 'lucide-react';

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

export interface AccountMenuProps {
  displayName: string | null | undefined;
  username: string;
  onSignOut: () => void;
  isSigningOut: boolean;
  /** The desktop header shows the name beside the avatar; the phone has no room. */
  showName?: boolean;
}

/**
 * The avatar and what sits behind it.
 *
 * Shared by the desktop header and the mobile one so there is a single answer to
 * "how do I sign out" — the mobile tab bar has no room for an account tab, and a
 * second copy of this menu would be a second place to forget.
 */
export const AccountMenu = ({
  displayName,
  username,
  onSignOut,
  isSigningOut,
  showName = false,
}: AccountMenuProps) => {
  const name = displayName ?? username;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="focus-visible:ring-ring/50 flex items-center gap-2 rounded-full outline-none focus-visible:ring-3"
        >
          {showName ? (
            <span className="text-muted-foreground hidden max-w-40 truncate text-sm md:inline">
              {name}
            </span>
          ) : null}
          <Avatar className="ring-foreground/8 size-9 ring-1">
            <AvatarFallback className="bg-inverted text-inverted-foreground text-xs font-medium">
              {initials(name)}
            </AvatarFallback>
          </Avatar>
          <span className="sr-only">Account</span>
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
  );
};
