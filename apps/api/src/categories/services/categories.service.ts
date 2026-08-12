import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoryKind } from '@myfinance/shared';

import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { CategoryResponse } from '../models/category.response';
import { CreateCategoryDto } from '../models/create-category.dto';
import { UpdateCategoryDto } from '../models/update-category.dto';

/**
 * Every read carries what the category is attached to.
 *
 * Deleting one detaches rather than blocks, so these counts are what a confirm
 * dialog needs to say what is about to be orphaned. They are two numbers rather
 * than one total because the two consequences differ: a receipt line goes
 * uncategorised, a product loses the default it hands to new lines.
 */
const categoryInclude = {
  _count: { select: { items: true, products: true } },
  account: { select: { name: true } },
} satisfies Prisma.CategoryInclude;

type CategoryWithCounts = Prisma.CategoryGetPayload<{ include: typeof categoryInclude }>;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    userId: string,
    kind?: CategoryKind,
    accountId?: string,
  ): Promise<CategoryResponse[]> {
    const categories = await this.prisma.category.findMany({
      where: { userId, ...(kind ? { kind } : {}), ...(accountId ? { accountId } : {}) },
      include: categoryInclude,
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });

    return categories.map((category) => this.toResponse(category));
  }

  async findOne(userId: string, id: string): Promise<CategoryResponse> {
    return this.toResponse(await this.getOrThrow(userId, id));
  }

  async create(userId: string, dto: CreateCategoryDto): Promise<CategoryResponse> {
    await this.assertAccountOwned(userId, dto.accountId);
    await this.assertUnassignedNameFree(userId, dto);

    // A name already used on this account surfaces as P2002 -> 409 through
    // PrismaExceptionFilter, so there is no read-then-write race to guard.
    const category = await this.prisma.category.create({
      data: {
        userId,
        accountId: dto.accountId ?? null,
        name: dto.name,
        kind: dto.kind,
        color: dto.color ?? null,
      },
      include: categoryInclude,
    });

    return this.toResponse(category);
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto): Promise<CategoryResponse> {
    await this.getOrThrow(userId, id);
    // Only validate an account the caller actually sent — an absent one means
    // "leave it where it is", not "move it to undefined".
    await this.assertAccountOwned(userId, dto.accountId);

    const category = await this.prisma.category.update({
      where: { id },
      data: {
        // No `??` fallback: undefined leaves the link alone, null clears it.
        accountId: dto.accountId,
        name: dto.name,
        kind: dto.kind,
        color: dto.color,
      },
      include: categoryInclude,
    });

    return this.toResponse(category);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getOrThrow(userId, id);
    // Receipt lines and products keep their rows; their categoryId is nulled by
    // the FK rule. Both then read as uncategorised and, because the API requires a
    // category on every write, neither can be saved again until one is picked.
    await this.prisma.category.delete({ where: { id } });
  }

  /** See the note on AccountsService.getOrThrow — findUnique cannot filter by owner. */
  private async getOrThrow(userId: string, id: string): Promise<CategoryWithCounts> {
    const category = await this.prisma.category.findFirst({
      where: { id, userId },
      include: categoryInclude,
    });

    if (!category) {
      throw new NotFoundException(`Category ${id} not found`);
    }

    return category;
  }

  /**
   * An account id that is a valid UUID but belongs to someone else must not become
   * a cross-tenant link. Absent is fine — see the call site in `update`.
   */
  private async assertAccountOwned(userId: string, accountId?: string | null): Promise<void> {
    if (!accountId) return;

    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId },
      select: { id: true },
    });

    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }
  }

  /**
   * The `(userId, accountId, name, kind)` unique index cannot police unassigned
   * categories: Postgres treats NULLs as distinct, so it would happily accept a
   * second unassigned "Groceries". This is that missing half, done by hand.
   */
  private async assertUnassignedNameFree(userId: string, dto: CreateCategoryDto): Promise<void> {
    if (dto.accountId) return;

    const clash = await this.prisma.category.findFirst({
      where: { userId, accountId: null, name: dto.name, kind: dto.kind },
      select: { id: true },
    });

    if (clash) {
      throw new ConflictException(
        `You already have an unassigned ${dto.kind} category called "${dto.name}"`,
      );
    }
  }

  private toResponse(category: CategoryWithCounts): CategoryResponse {
    return {
      id: category.id,
      name: category.name,
      accountId: category.accountId,
      accountName: category.account?.name ?? null,
      kind: category.kind,
      color: category.color,
      transactionItemCount: category._count.items,
      productCount: category._count.products,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }
}
