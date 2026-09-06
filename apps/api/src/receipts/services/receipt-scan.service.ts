import { Injectable, NotFoundException } from '@nestjs/common';
import { cascadeDiscounts, percentToBasisPoints, toMinor } from '@myfinance/shared';

import { PrismaService } from '../../database/prisma.service';
import { ReceiptDraftChargeResponse } from '../models/receipt-draft-charge.response';
import { ReceiptDraftDiscountResponse } from '../models/receipt-draft-discount.response';
import { ReceiptDraftLineResponse } from '../models/receipt-draft-line.response';
import { ReceiptDraftResponse } from '../models/receipt-draft.response';
import { ScanReceiptDto } from '../models/scan-receipt.dto';

import type { ExtractedCharge, ExtractedDiscount, ExtractedLine } from './extracted-receipt';
import { readReceipt } from './gemini-receipt-reader';
import { matchMerchant } from './match-merchant';
import type { CatalogueProduct } from './match-product';
import { matchProduct } from './match-product';

/**
 * Turns a receipt photo into a draft the user reviews.
 *
 * Three steps that must stay in this order: resolve the account (which supplies
 * the currency every amount is scaled by), read the photo, then resolve what was
 * read against the user's own catalogue. The model contributes text and numbers
 * only — every id in the draft is looked up here, among rows already filtered by
 * `userId`, so nothing it returns can reach another tenant's data.
 *
 * Nothing is written. See ReceiptsService for the confirm.
 */
@Injectable()
export class ReceiptScanService {
  constructor(private readonly prisma: PrismaService) {}

  async scan(userId: string, dto: ScanReceiptDto): Promise<ReceiptDraftResponse> {
    const account = await this.prisma.account.findFirst({
      where: { id: dto.accountId, userId },
      select: { id: true, currency: true },
    });

    if (!account) {
      throw new NotFoundException(`Account ${dto.accountId} not found`);
    }

    const extracted = await readReceipt({
      imageBase64: dto.imageBase64,
      mimeType: dto.mimeType,
    });

    const merchants = await this.prisma.merchant.findMany({
      where: { userId },
      select: { id: true, name: true },
    });

    const merchant = matchMerchant(extracted.merchantName, merchants);

    // Only the matched merchant's catalogue, and only once: `Product.code` is
    // unique per merchant rather than globally, and a lookup per line over rows
    // we could have fetched together is the N+1 this codebase keeps out.
    const products = merchant
      ? await this.prisma.product.findMany({
          where: { userId, merchantId: merchant.id },
          select: {
            id: true,
            code: true,
            name: true,
            categoryId: true,
            category: { select: { name: true } },
          },
        })
      : [];

    const lines = extracted.lines.map((line) => this.toDraftLine(line, account.currency, products));
    const charges = extracted.charges.map((charge) => this.toDraftCharge(charge, account.currency));

    return {
      accountId: account.id,
      currency: account.currency,
      merchant: { id: merchant?.id ?? null, name: merchant?.name ?? extracted.merchantName },
      occurredAt: this.toUtcMidnight(extracted.purchasedOn),
      description: merchant?.name ?? extracted.merchantName,
      lines,
      charges,
      printedTotalMinor:
        extracted.grandTotal === null ? null : toMinor(extracted.grandTotal, account.currency),
      derivedTotalMinor: sumBy(lines, 'lineTotalMinor') + sumBy(charges, 'amountMinor'),
    };
  }

  /**
   * Derives the line's money the same way a saved line does, so the total the
   * reviewer is shown is the total the API will store — not an estimate that
   * shifts once it is written.
   */
  private toDraftLine(
    line: ExtractedLine,
    currency: string,
    products: ProductWithCategoryName[],
  ): ReceiptDraftLineResponse {
    const product = matchProduct(line, products);
    const unitPriceMinor = toMinor(line.unitPrice, currency);
    const discounts = line.discounts.map((discount) => this.toDraftDiscount(discount, currency));
    const cascaded = cascadeDiscounts(line.quantity * unitPriceMinor, discounts);

    return {
      productId: product?.id ?? null,
      categoryId: product?.categoryId ?? null,
      categoryName: product?.category?.name ?? null,
      name: line.name,
      quantity: line.quantity,
      unitPriceMinor,
      discounts,
      discountBasisPoints: cascaded.effectiveBasisPoints,
      // Not clamped at zero: a draft that over-discounts should fail its own total
      // check in front of the reviewer, not arrive looking reconciled.
      lineTotalMinor: cascaded.lineTotalMinor,
    };
  }

  /**
   * A printed discount as the confirm will send it back — the rate when the
   * receipt printed a rate, the amount when it printed an amount, never both.
   */
  private toDraftDiscount(
    discount: ExtractedDiscount,
    currency: string,
  ): ReceiptDraftDiscountResponse {
    return {
      name: discount.name,
      basisPoints: percentToBasisPoints(discount.percent),
      amountMinor: discount.amount === null ? null : toMinor(discount.amount, currency),
    };
  }

  /**
   * The percentage is carried but never used to derive the amount — a charge's
   * printed figure is authoritative and a receipt rounds where it likes, which is
   * the opposite rule from a line discount. See TransactionCharge in the schema.
   */
  private toDraftCharge(charge: ExtractedCharge, currency: string): ReceiptDraftChargeResponse {
    return {
      name: charge.name,
      percentBasisPoints: percentToBasisPoints(charge.percent),
      amountMinor: toMinor(charge.amount, currency),
    };
  }

  /**
   * A receipt prints a calendar date, not an instant. Midnight UTC matches how
   * the web app already builds `occurredAt` and how the summary windows read it,
   * so a purchase does not drift into a neighbouring month by timezone.
   */
  private toUtcMidnight(purchasedOn: string | null): string | null {
    if (!purchasedOn || !/^\d{4}-\d{2}-\d{2}$/.test(purchasedOn)) return null;

    const parsed = new Date(`${purchasedOn}T00:00:00.000Z`);

    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
}

/** The catalogue row plus the category name the draft shows beside a matched line. */
type ProductWithCategoryName = CatalogueProduct & { category: { name: string } | null };

const sumBy = <K extends string>(rows: Record<K, number>[], key: K): number =>
  rows.reduce((total, row) => total + row[key], 0);
