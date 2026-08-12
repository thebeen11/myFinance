import { BadRequestException } from '@nestjs/common';

/**
 * Refuses any write to a transaction that a settlement posted.
 *
 * Such a row's `amountMinor` is authoritative rather than derived, which is only
 * safe while nothing can reach it — an item or charge attached here would send
 * `recomputeTotal` over it and zero the repayment. Its two legs also only balance
 * while both are standing, so editing or deleting one would strand the other
 * against a receipt that still says the share was repaid. Unsettling removes the
 * pair together.
 *
 * A plain function rather than a service method: three write paths across two
 * services need it, it touches no state, and making it injectable would only give
 * both services something else to mock.
 *
 * @param transaction The row about to be written to.
 * @param verb What the caller was trying to do, for the message — "edited", "deleted".
 * @throws BadRequestException when the row is a settlement posting.
 */
export const assertNotSettlementPosting = (
  transaction: { settlementId: string | null },
  verb: string,
): void => {
  if (transaction.settlementId === null) return;

  throw new BadRequestException(
    `This transaction was posted by a reimbursement and cannot be ${verb}. Undo the reimbursement on the original receipt instead.`,
  );
};
