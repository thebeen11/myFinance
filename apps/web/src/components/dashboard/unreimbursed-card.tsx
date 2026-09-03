'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import type { OutstandingCurrencyTotalResponse, OutstandingReimbursementResponse } from '@/api';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { dayAndMonth, money, shortDate } from '@/lib/format';

/** Receipts named inline before the row falls back to a count. */
const RECEIPTS_SHOWN = 3;

/**
 * What each account still owes another, across every receipt it was fronted on.
 *
 * The question no single receipt can answer: a share fronted in June is invisible
 * unless you remember which transaction carried it. The figures come from the API,
 * which runs the same derivation the receipt's own split card shows — so a row here
 * and the row there can never disagree.
 *
 * **Both sides are always named.** Every account belongs to the same person, so
 * "owes you" would put the reader on both sides of the movement and identify nobody.
 *
 * Read-only. Recording a reimbursement posts real money on two accounts and is
 * addressed per receipt, so it stays where the receipt is.
 *
 * Totals are listed one per currency rather than summed: nothing in the system holds
 * an FX rate, and `settle` refuses a cross-currency repayment outright, so two
 * currencies are two debts that can never pay each other off.
 */
export const UnreimbursedCard = ({
  rows,
  totals,
  isPending,
  isError,
  className,
}: {
  rows: readonly OutstandingReimbursementResponse[];
  totals: readonly OutstandingCurrencyTotalResponse[];
  isPending: boolean;
  isError: boolean;
  className?: string;
}) => (
  <Card className={className}>
    <div className="flex h-full flex-col gap-4 px-(--card-spacing)">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs font-medium">Owed back</span>
          <h2 className="text-lg font-semibold tracking-tight">Unreimbursed</h2>
        </div>

        {rows.length > 0 ? (
          <div className="flex flex-col items-end gap-0.5">
            {totals.map((total) => (
              <span key={total.currency} className="text-base font-semibold tabular-nums">
                {money(total.owedMinor, total.currency)}
              </span>
            ))}
          </div>
        ) : (
          <Link
            href="/transactions"
            className="text-muted-foreground hover:text-foreground bg-muted flex size-8 items-center justify-center rounded-full transition-colors"
            aria-label="View all transactions"
          >
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>

      {isPending && rows.length === 0 ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-12 w-full rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        // The only per-card error state on the dashboard. The page-level fallback
        // would blank everything over one secondary card, and the empty state below
        // would claim nothing is owed when the truth is that we do not know.
        <p className="text-muted-foreground my-auto py-6 text-center text-sm">
          Could not load reimbursements.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground my-auto py-6 text-center text-sm">
          Nothing outstanding — every shared receipt has been reimbursed.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((row) => (
            <li
              key={`${row.owedAccountId}:${row.paidByAccountId}:${row.currency}`}
              className="hover:bg-muted/60 flex flex-col gap-1 rounded-2xl px-2 py-2.5 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium">
                  {row.owedAccountName} reimburses {row.paidByAccountName}
                </p>
                <span className="text-expense shrink-0 text-sm font-semibold tabular-nums">
                  {money(row.owedMinor, row.currency)}
                </span>
              </div>

              <p className="text-muted-foreground truncate text-xs">
                {row.receiptCount === 1 ? '1 receipt' : `${row.receiptCount} receipts`} · oldest{' '}
                {shortDate(row.oldestOccurredAt)}
              </p>

              {/* The rolled-up figure stays traceable: each receipt behind it is a
                  link to the transaction whose split card can settle it. */}
              <p className="text-muted-foreground flex flex-wrap items-baseline gap-x-2 text-xs">
                {row.receipts.slice(0, RECEIPTS_SHOWN).map((receipt) => (
                  <Link
                    key={receipt.transactionId}
                    href={`/transactions/${receipt.transactionId}`}
                    className="hover:text-foreground underline underline-offset-2 transition-colors"
                  >
                    {receipt.description ?? receipt.merchantName ?? 'Receipt'} ·{' '}
                    {dayAndMonth(receipt.occurredAt)}
                  </Link>
                ))}
                {row.receipts.length > RECEIPTS_SHOWN ? (
                  <span>+{row.receipts.length - RECEIPTS_SHOWN} more</span>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  </Card>
);
