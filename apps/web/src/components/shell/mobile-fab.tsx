'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';

import { TransactionDialog } from '@/components/transactions/transaction-dialog';
import { ACCOUNT_PICKER_QUERY, useAccounts, useMerchants } from '@/hooks/use-finance-queries';

/**
 * The phone's primary action, floating above the tab bar.
 *
 * PRODUCT.md makes logging a purchase the job the phone exists for, so it gets a
 * control that is reachable from every screen rather than one that lives in the
 * header of two of them.
 *
 * Extended rather than a bare `+`: on `/accounts` or `/categories` the page has
 * its own "Add …" button, and an unlabelled plus beside it would be a guess.
 *
 * It mounts its own `TransactionDialog`. The two queries behind it are already
 * requested by the pages that need them, and TanStack Query dedupes by key, so
 * this costs no extra round-trip.
 */
export const MobileFab = () => {
  const [open, setOpen] = useState(false);
  const accounts = useAccounts(ACCOUNT_PICKER_QUERY);
  const merchants = useMerchants();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-primary text-primary-foreground ring-foreground/8 focus-visible:ring-ring/50 fixed right-4 bottom-[calc(var(--safe-b)+4.5rem)] z-40 inline-flex h-12 items-center gap-1.5 rounded-full pr-5 pl-4 text-sm font-semibold ring-1 outline-none transition-transform active:scale-[0.97] focus-visible:ring-3 md:hidden"
      >
        <Plus className="size-5" aria-hidden />
        Transaction
      </button>

      <TransactionDialog
        accounts={accounts.data?.data ?? []}
        merchants={merchants.data ?? []}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
};
