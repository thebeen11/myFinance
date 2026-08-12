import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CategoryKind } from '@myfinance/shared';

import { PrismaService } from '../../database/prisma.service';
import { CategoriesService } from './categories.service';

const USER_ID = '99999999-9999-4999-8999-999999999999';
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const CATEGORY_ID = '44444444-4444-4444-8444-444444444444';

const category = {
  id: CATEGORY_ID,
  userId: USER_ID,
  accountId: ACCOUNT_ID,
  name: 'Groceries',
  kind: CategoryKind.EXPENSE,
  color: '#f97316',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  account: { name: 'BCA Payroll' },
  _count: { items: 3, products: 1 },
};

const createDto = {
  accountId: ACCOUNT_ID,
  name: 'Groceries',
  kind: CategoryKind.EXPENSE,
  color: '#f97316',
};

describe('CategoriesService', () => {
  const prisma = {
    category: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    account: {
      findFirst: jest.fn(),
    },
  };

  let service: CategoriesService;

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [CategoriesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(CategoriesService);
  });

  describe('findOne', () => {
    it('flattens the account relation into accountName', async () => {
      prisma.category.findFirst.mockResolvedValue(category);

      await expect(service.findOne(USER_ID, CATEGORY_ID)).resolves.toEqual({
        id: CATEGORY_ID,
        name: 'Groceries',
        accountId: ACCOUNT_ID,
        accountName: 'BCA Payroll',
        kind: CategoryKind.EXPENSE,
        color: '#f97316',
        transactionItemCount: 3,
        productCount: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('reports an unassigned category with a null account, not a missing one', async () => {
      prisma.category.findFirst.mockResolvedValue({
        ...category,
        accountId: null,
        account: null,
      });

      await expect(service.findOne(USER_ID, CATEGORY_ID)).resolves.toMatchObject({
        accountId: null,
        accountName: null,
      });
    });
  });

  describe('findAll', () => {
    it('constrains the list query to the signed-in user', async () => {
      prisma.category.findMany.mockResolvedValue([]);

      await service.findAll(USER_ID);

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID } }),
      );
    });

    it('narrows to one account without dropping the user filter', async () => {
      prisma.category.findMany.mockResolvedValue([]);

      await service.findAll(USER_ID, undefined, ACCOUNT_ID);

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID, accountId: ACCOUNT_ID } }),
      );
    });
  });

  describe('tenant scoping', () => {
    it('looks a category up by owner, not by id alone', async () => {
      prisma.category.findFirst.mockResolvedValue(category);

      await service.findOne(USER_ID, CATEGORY_ID);

      expect(prisma.category.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: CATEGORY_ID, userId: USER_ID } }),
      );
    });

    it('reports another user’s category as missing rather than forbidden', async () => {
      // The row exists, it just is not ours — the scoped lookup returns null.
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(service.findOne(USER_ID, CATEGORY_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to delete a category that is not ours', async () => {
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(service.remove(USER_ID, CATEGORY_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.category.delete).not.toHaveBeenCalled();
    });
  });

  describe('account ownership', () => {
    it('resolves the account by owner, not by id alone', async () => {
      prisma.account.findFirst.mockResolvedValue({ id: ACCOUNT_ID });
      prisma.category.create.mockResolvedValue(category);

      await service.create(USER_ID, createDto);

      expect(prisma.account.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ACCOUNT_ID, userId: USER_ID } }),
      );
    });

    it('rejects another user’s account as missing rather than writing the row', async () => {
      prisma.account.findFirst.mockResolvedValue(null);

      await expect(service.create(USER_ID, createDto)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.category.create).not.toHaveBeenCalled();
    });

    it('refuses to move a category onto an account belonging to someone else', async () => {
      prisma.category.findFirst.mockResolvedValue(category);
      prisma.account.findFirst.mockResolvedValue(null);

      await expect(
        service.update(USER_ID, CATEGORY_ID, { accountId: ACCOUNT_ID }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('does not look up an account the update left alone', async () => {
      prisma.category.findFirst.mockResolvedValue(category);
      prisma.category.update.mockResolvedValue(category);

      await service.update(USER_ID, CATEGORY_ID, { name: 'Weekly shop' });

      expect(prisma.account.findFirst).not.toHaveBeenCalled();
    });

    it('passes an explicit null through as "unassign", not as "leave alone"', async () => {
      prisma.category.findFirst.mockResolvedValue(category);
      prisma.category.update.mockResolvedValue({ ...category, accountId: null, account: null });

      await service.update(USER_ID, CATEGORY_ID, { accountId: null });

      expect(prisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ accountId: null }) as object,
        }),
      );
    });
  });

  describe('unassigned duplicates', () => {
    // Postgres treats NULLs as distinct, so the (userId, accountId, name, kind)
    // index cannot catch this pair — the service has to.
    it('refuses a second unassigned category with the same name and kind', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: CATEGORY_ID });

      await expect(
        service.create(USER_ID, { name: 'Groceries', kind: CategoryKind.EXPENSE }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.category.create).not.toHaveBeenCalled();
    });

    it('leaves the duplicate check to the database once an account is named', async () => {
      prisma.account.findFirst.mockResolvedValue({ id: ACCOUNT_ID });
      prisma.category.create.mockResolvedValue(category);

      await service.create(USER_ID, createDto);

      expect(prisma.category.findFirst).not.toHaveBeenCalled();
    });
  });
});
