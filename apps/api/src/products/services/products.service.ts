import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoryKind } from '@myfinance/shared';

import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { CreateProductDto } from '../models/create-product.dto';
import { ProductResponse } from '../models/product.response';
import { UpdateProductDto } from '../models/update-product.dto';

/** Every read carries the merchant name and category, so a list needs no second request. */
const productInclude = {
  merchant: { select: { name: true } },
  category: { select: { id: true, name: true, kind: true, color: true } },
} satisfies Prisma.ProductInclude;

type ProductWithMerchant = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Products for the signed-in user, optionally narrowed to one merchant.
   *
   * Unpaginated and ordered by code, for the same reason merchants are: this is
   * bounded master data, and the merchant page wants the whole catalogue at once.
   * Uncoded products sort last, together, in name order rather than at random.
   */
  async findAll(userId: string, merchantId?: string, search?: string): Promise<ProductResponse[]> {
    const term = search?.trim();

    const products = await this.prisma.product.findMany({
      where: {
        userId,
        ...(merchantId ? { merchantId } : {}),
        ...(term
          ? {
              OR: [
                { code: { contains: term, mode: 'insensitive' } },
                { name: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: productInclude,
      orderBy: [{ code: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    });

    return products.map((product) => this.toResponse(product));
  }

  async findOne(userId: string, id: string): Promise<ProductResponse> {
    return this.toResponse(await this.getOrThrow(userId, id));
  }

  async create(userId: string, dto: CreateProductDto): Promise<ProductResponse> {
    await this.assertMerchantOwned(userId, dto.merchantId);
    await this.assertCategoryUsable(userId, dto.categoryId);

    // A code already used by this merchant surfaces as P2002 -> 409 through
    // PrismaExceptionFilter, so there is no read-then-write race to guard.
    const product = await this.prisma.product.create({
      data: {
        userId,
        merchantId: dto.merchantId,
        categoryId: dto.categoryId,
        code: this.normaliseCode(dto.code) ?? null,
        name: dto.name,
        lastPriceMinor: dto.lastPriceMinor,
      },
      include: productInclude,
    });

    return this.toResponse(product);
  }

  async update(userId: string, id: string, dto: UpdateProductDto): Promise<ProductResponse> {
    await this.getOrThrow(userId, id);
    // Only validate a merchant the caller actually sent — an absent one means
    // "leave it where it is", not "move it to undefined". Same for the category.
    await this.assertMerchantOwned(userId, dto.merchantId);
    await this.assertCategoryUsable(userId, dto.categoryId);

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        merchantId: dto.merchantId,
        categoryId: dto.categoryId,
        code: this.normaliseCode(dto.code),
        name: dto.name,
        lastPriceMinor: dto.lastPriceMinor,
      },
      include: productInclude,
    });

    return this.toResponse(product);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getOrThrow(userId, id);
    await this.prisma.product.delete({ where: { id } });
  }

  /** See the note on AccountsService.getOrThrow — findUnique cannot filter by owner. */
  private async getOrThrow(userId: string, id: string): Promise<ProductWithMerchant> {
    const product = await this.prisma.product.findFirst({
      where: { id, userId },
      include: productInclude,
    });

    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }

    return product;
  }

  /**
   * Distinguishes "leave the code alone" from "clear it".
   *
   * An absent field on a PATCH means the caller said nothing about the code, so
   * it stays; a blank or whitespace-only string is the form's way of clearing
   * one, and must land as NULL rather than as `''` — `''` would collide under
   * `@@unique([merchantId, code])` the moment a second uncoded product appeared.
   */
  private normaliseCode(code?: string): string | null | undefined {
    if (code === undefined) return undefined;

    return code.trim() || null;
  }

  /**
   * A merchant id that is a valid UUID but belongs to someone else must not
   * become a cross-tenant write. Absent is fine — see the call site in `update`.
   */
  private async assertMerchantOwned(userId: string, merchantId?: string): Promise<void> {
    if (!merchantId) return;

    const merchant = await this.prisma.merchant.findFirst({
      where: { id: merchantId, userId },
      select: { id: true },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant ${merchantId} not found`);
    }
  }

  /**
   * A product is something you buy, so it is classified with an EXPENSE category —
   * filing one under "Salary" would put purchases on the income side of every
   * breakdown built from it. Absent is fine on update; see the call site.
   */
  private async assertCategoryUsable(userId: string, categoryId?: string): Promise<void> {
    if (!categoryId) return;

    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, userId },
      select: { name: true, kind: true },
    });

    if (!category) {
      throw new NotFoundException(`Category ${categoryId} not found`);
    }

    if (category.kind !== CategoryKind.EXPENSE) {
      throw new BadRequestException(
        `Category "${category.name}" is ${category.kind}; a product must be filed under an EXPENSE category`,
      );
    }
  }

  private toResponse(product: ProductWithMerchant): ProductResponse {
    return {
      id: product.id,
      merchantId: product.merchantId,
      merchantName: product.merchant.name,
      category: product.category,
      code: product.code,
      name: product.name,
      lastPriceMinor: product.lastPriceMinor,
      currency: product.currency,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }
}
