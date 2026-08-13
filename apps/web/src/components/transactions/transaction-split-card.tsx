'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Undo2 } from 'lucide-react';
import { toast } from 'sonner';

import { transactionSettlementsSettle, transactionSettlementsUnsettle } from '@/api';
import type { TransactionResponse, TransactionSplitResponse } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { money, shortDate } from '@/lib/format';

interface TransactionSplitCardProps {
  transaction: TransactionResponse;
  split: TransactionSplitResponse;
}

/**
 * How a receipt one account paid divides between it and the accounts it covered.
 *
 * A line filed under a category linked to another account is money this one
 * fronted — that is the whole basis of the split. The grain here is the **account**,
 * one row per wallet that owes: a reimbursement covers everything one account owed
 * at once, so that is the unit the button acts on. The per-category derivation stays
 * server-side in `split.lines`; rendering it too repeated every figure, since
 * `debtors` is only those same lines rolled up per wallet.
 *
 * **Both sides are always named.** Every account here belongs to the same person,
 * so "owes you" would put the reader on both sides of the movement and identify
 * nobody — the account that is reimbursed is the one the transaction was posted to,
 * and it is spelled out rather than implied.
 *
 * Entirely read-only except for recording a reimbursement. The figures are derived
 * by the API on every read, so editing a line re-splits the receipt with nothing to
 * keep in sync.
 *
 * Recording one posts real money — an income on the account that paid and an expense
 * on the account that owed — so balances move. It is deliberately absent from the
 * monthly summary: both legs sit inside the same person's accounts, and counting
 * them there would book a reimbursement as fresh income and fresh spending.
 */
export const TransactionSplitCard = ({ transaction, split }: TransactionSplitCardProps) => {
  const queryClient = useQueryClient();

  const invalidate = async () => {
    // Balances moved on two accounts, and both postings are new rows in the list.
    await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    await queryClient.invalidateQueries({ queryKey: ['accounts'] });
  };

  const settle = useMutation({
    mutationFn: (owedAccountId: string) =>
      transactionSettlementsSettle({
        path: { transactionId: transaction.id },
        body: { owedAccountId },
        throwOnError: true,
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success('Reimbursement recorded — posted to both accounts');
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Could not record this reimbursement');
    },
  });

  const unsettle = useMutation({
    mutationFn: (owedAccountId: string) =>
      transactionSettlementsUnsettle({
        path: { transactionId: transaction.id, owedAccountId },
        throwOnError: true,
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success('Reimbursement undone — both postings removed');
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Could not undo this reimbursement');
    },
  });

  const isPending = settle.isPending || unsettle.isPending;
  /** The account that paid, and therefore the one every reimbursement here is owed to. */
  const payer = transaction.account.name;

  return (
    <Card>
      <div className="space-y-4 px-(--card-spacing)">
        {/* Names the account being reimbursed once, up front, so every row below can
            be read as a direction rather than an unattributed figure. */}
        <p className="text-muted-foreground text-sm">
          Paid by {payer} · {money(transaction.amountMinor, transaction.currency)}
        </p>

        <div className="bg-muted grid gap-1.5 rounded-xl px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{payer}&rsquo;s own share</span>
            <span className="tabular-nums">
              {money(split.ownShareMinor, transaction.currency)}
            </span>
          </div>

          {split.debtors.map((debtor) => (
            <div key={debtor.accountId} className="grid gap-1 border-t pt-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  {/* Both accounts named. Constant whether or not it has been paid —
                      the badge carries the state, so the direction never moves. */}
                  <span className="min-w-0 truncate font-medium">
                    {debtor.accountName} reimburses {payer}
                  </span>
                  {/* Filled brand green under deep ink — the one thing --primary is
                      for — and a tick beside the word, so a settled row is never
                      told apart by colour alone. */}
                  {debtor.settlement ? (
                    <Badge>
                      <Check data-icon="inline-start" aria-hidden />
                      Reimbursed
                    </Badge>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums font-semibold">
                    {money(
                      debtor.settlement?.settledMinor ?? debtor.owedMinor,
                      transaction.currency,
                    )}
                  </span>
                  {debtor.settlement ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => unsettle.mutate(debtor.accountId)}
                    >
                      <Undo2 data-icon="inline-start" />
                      Undo
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={isPending}
                      onClick={() => settle.mutate(debtor.accountId)}
                    >
                      Mark reimbursed
                    </Button>
                  )}
                </span>
              </div>

              {/* Reads on from the badge above rather than repeating its word. */}
              {debtor.settlement ? (
                <p className="text-muted-foreground text-xs">
                  on {shortDate(debtor.settlement.settledAt)}
                  {/* The receipt changed after the money moved. Nothing is corrected
                      behind your back — what was repaid is what was repaid. */}
                  {debtor.settlement.isStale
                    ? ` · the receipt now puts ${debtor.accountName}’s share at ${money(debtor.owedMinor, transaction.currency)}`
                    : null}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};
