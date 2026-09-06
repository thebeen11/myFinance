'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { BottomNav } from '@/components/shell/bottom-nav';
import { MobileFab } from '@/components/shell/mobile-fab';
import { MobileHeader, MobileHeaderSkeleton } from '@/components/shell/mobile-header';
import { TopNav, TopNavSkeleton } from '@/components/shell/top-nav';
import { useLogout } from '@/hooks/use-auth';
import { useMe } from '@/hooks/use-finance-queries';
import { getAccessToken } from '@/lib/auth-storage';

/**
 * Client-side route protection.
 *
 * A Next.js middleware cannot do this job: the token lives in localStorage, which
 * the server never sees. So the gate is here, and the API is the real boundary —
 * this only decides what to render, never what a user is allowed to read.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const me = useMe();
  const logout = useLogout();

  const hasToken = typeof window !== 'undefined' && getAccessToken() !== null;

  useEffect(() => {
    if (!hasToken || me.isError) {
      router.replace('/login');
    }
  }, [hasToken, me.isError, router]);

  const isResolved = hasToken && !me.isError && !me.isPending;

  return (
    // The bottom padding clears the fixed tab bar and the FAB riding above it.
    // Desktop drops back to plain padding, where neither exists.
    <div className="min-h-svh px-3 pt-3 pb-[calc(var(--safe-b)+6rem)] sm:px-5 sm:pt-4 md:pb-4">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 sm:gap-6">
        {/* The chrome renders before auth resolves so the page does not flash a
            bare canvas, but never with anyone's name or figures on it. Both the
            real header and the placeholder carry the same breakpoints, or the
            jump just moves to mobile. */}
        {isResolved ? (
          <>
            <TopNav
              displayName={me.data.displayName}
              username={me.data.username}
              onSignOut={() => logout.mutate()}
              isSigningOut={logout.isPending}
            />
            <MobileHeader
              displayName={me.data.displayName}
              username={me.data.username}
              onSignOut={() => logout.mutate()}
              isSigningOut={logout.isPending}
            />
          </>
        ) : (
          <>
            <TopNavSkeleton />
            <MobileHeaderSkeleton />
          </>
        )}

        {/* Render nothing rather than a flash of someone's finances behind a redirect. */}
        <main>{isResolved ? children : null}</main>
      </div>

      {/* Outside the max-width column: both are fixed to the viewport, and nesting
          them in a centred container would only confuse where their edges are. */}
      {isResolved ? (
        <>
          <MobileFab />
          <BottomNav />
        </>
      ) : null}
    </div>
  );
}
