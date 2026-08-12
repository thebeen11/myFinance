import { Prisma } from '../../generated/prisma/client';

/**
 * Every read returns the account, merchant, lines, charges and settlements a
 * receipt needs to render.
 *
 * Lives apart from `TransactionsService` because three things now depend on the
 * same shape: the service that reads it, the settlement service that recomputes a
 * split before posting against it, and `computeSplit`, which is typed by it.
 *
 * The account behind each line's **category** is selected on purpose. That link is
 * the whole basis of a split: a line filed under a category belonging to another
 * wallet is money this wallet fronted. It is not part of the item payload — see
 * `TransactionsService.toResponse`, which maps the category fields explicitly so
 * the join does not leak out.
 */
export const transactionInclude = {
  account: { select: { id: true, name: true, type: true } },
  merchant: { select: { id: true, name: true } },
  /** The header's own category — income's classification. Always null on an expense. */
  category: { select: { id: true, name: true, kind: true, color: true } },
  items: {
    include: {
      product: { select: { id: true, code: true, name: true } },
      category: {
        select: {
          id: true,
          name: true,
          kind: true,
          color: true,
          account: { select: { id: true, name: true, currency: true } },
        },
      },
    },
    orderBy: { position: 'asc' },
  },
  charges: { orderBy: { position: 'asc' } },
  settlements: {
    include: {
      postings: { select: { id: true, type: true } },
      /// Named here because a wallet settled and then edited off the receipt still
      /// has to be rendered, and by then no line is left to carry its name.
      owedAccount: { select: { id: true, name: true, currency: true } },
    },
    orderBy: { settledAt: 'asc' },
  },
} satisfies Prisma.TransactionInclude;

export type TransactionWithRelations = Prisma.TransactionGetPayload<{
  include: typeof transactionInclude;
}>;
