import type { ReactNode } from 'react';

import { BrandMark } from '@/components/shell/brand-mark';

/**
 * A split entry screen: the inverted panel states what this is, the form sits on
 * the canvas beside it.
 *
 * The panel carries no marketing copy. This product has no public audience —
 * everyone who reaches this page was handed an invite code — so the job is to be
 * self-explanatory to someone who has never seen it, not to persuade anyone.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <aside className="bg-inverted text-inverted-foreground hidden flex-col justify-between p-10 lg:flex">
        <div className="flex items-center gap-3">
          <BrandMark />
          <span className="text-lg font-semibold tracking-tight">myFinance</span>
        </div>

        <div className="max-w-sm">
          <p className="text-2xl font-medium tracking-tight text-balance">
            Every account in one place — cash, bank, e-wallets, cards.
          </p>
          <p className="text-inverted-muted mt-3 text-sm">
            A private ledger for you and the people you invite. Nobody sees anybody else&rsquo;s
            money.
          </p>
        </div>

        <p className="text-inverted-muted text-xs">Invite-only. There is no public sign-up.</p>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark size="sm" />
            <span className="font-semibold tracking-tight">myFinance</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
