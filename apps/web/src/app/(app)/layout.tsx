'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

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
    <div className="min-h-svh px-3 py-3 sm:px-5 sm:py-4">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 sm:gap-6">
        {/* The chrome renders before auth resolves so the page does not flash a
            bare canvas, but never with anyone's name or figures on it. */}
        {isResolved ? (
          <TopNav
            displayName={me.data.displayName}
            username={me.data.username}
            onSignOut={() => logout.mutate()}
            isSigningOut={logout.isPending}
          />
        ) : (
          <TopNavSkeleton />
        )}

        {/* Render nothing rather than a flash of someone's finances behind a redirect. */}
        <main>{isResolved ? children : null}</main>
      </div>
    </div>
  );
}
