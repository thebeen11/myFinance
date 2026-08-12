import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { CreateMerchantDto } from '../models/create-merchant.dto';
import { MerchantResponse } from '../models/merchant.response';
import { UpdateMerchantDto } from '../models/update-merchant.dto';

/** Every read carries the transaction and product counts, so the list is worth looking at. */
const merchantInclude = {
  _count: { select: { transactions: true, products: true } },
} satisfies Prisma.MerchantInclude;

type MerchantWithCount = Prisma.MerchantGetPayload<{ include: typeof merchantInclude }>;

@Injectable()
export class MerchantsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every merchant, unpaginated and ordered by name.
   *
   * Deliberately not a paginated list: merchants are bounded master data, and both
   * the merchants page and the transaction form's picker need the whole set.
   */
  async findAll(userId: string, search?: string): Promise<MerchantResponse[]> {
    const merchants = await this.prisma.merchant.findMany({
      where: {
        userId,
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      include: merchantInclude,
      orderBy: { name: 'asc' },
    });

    return merchants.map((merchant) => this.toResponse(merchant));
  }

  async findOne(userId: string, id: string): Promise<MerchantResponse> {
    return this.toResponse(await this.getOrThrow(userId, id));
  }

  async create(userId: string, dto: CreateMerchantDto): Promise<MerchantResponse> {
    // A duplicate name surfaces as P2002 -> 409 through PrismaExceptionFilter.
    const merchant = await this.prisma.merchant.create({
      data: { userId, name: dto.name },
      include: merchantInclude,
    });

    return this.toResponse(merchant);
  }

  async update(userId: string, id: string, dto: UpdateMerchantDto): Promise<MerchantResponse> {
    await this.getOrThrow(userId, id);

    const merchant = await this.prisma.merchant.update({
      where: { id },
      data: { name: dto.name },
      include: merchantInclude,
    });

    return this.toResponse(merchant);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getOrThrow(userId, id);
    // Transactions keep their history; their merchantId is nulled by the FK rule.
    await this.prisma.merchant.delete({ where: { id } });
  }

  /** See the note on AccountsService.getOrThrow — findUnique cannot filter by owner. */
  private async getOrThrow(userId: string, id: string): Promise<MerchantWithCount> {
    const merchant = await this.prisma.merchant.findFirst({
      where: { id, userId },
      include: merchantInclude,
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant ${id} not found`);
    }

    return merchant;
  }

  private toResponse(merchant: MerchantWithCount): MerchantResponse {
    return {
      id: merchant.id,
      name: merchant.name,
      transactionCount: merchant._count.transactions,
      productCount: merchant._count.products,
      createdAt: merchant.createdAt.toISOString(),
      updatedAt: merchant.updatedAt.toISOString(),
    };
  }
}
