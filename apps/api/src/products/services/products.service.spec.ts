import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CategoryKind } from '@myfinance/shared';

import { PrismaService } from '../../database/prisma.service';
import { ProductsService } from './products.service';

const USER_ID = '99999999-9999-4999-8999-999999999999';
const MERCHANT_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '44444444-4444-4444-8444-444444444444';

const category = {
  id: CATEGORY_ID,
  name: 'Groceries',
  kind: CategoryKind.EXPENSE,
  color: '#f97316',
};

const product = {
  id: '33333333-3333-4333-8333-333333333333',
  userId: USER_ID,
  merchantId: MERCHANT_ID,
  categoryId: CATEGORY_ID,
  code: 'IDM-001',
  name: 'Indomie Goreng',
  lastPriceMinor: 3500,
  currency: 'IDR',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  merchant: { name: 'Indomaret' },
  category,
};

const createDto = {
  merchantId: MERCHANT_ID,
  categoryId: CATEGORY_ID,
  code: 'IDM-001',
  name: 'Indomie Goreng',
  lastPriceMinor: 3500,
};

describe('ProductsService', () => {
  const prisma = {
    product: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    merchant: {
      findFirst: jest.fn(),
    },
    category: {
      findFirst: jest.fn(),
    },
  };

  let service: ProductsService;

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [ProductsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(ProductsService);
  });

  describe('findOne', () => {
    it('flattens the merchant relation into merchantName', async () => {
      prisma.product.findFirst.mockResolvedValue(product);

      await expect(service.findOne(USER_ID, product.id)).resolves.toEqual({
        id: product.id,
        merchantId: MERCHANT_ID,
        merchantName: 'Indomaret',
        category,
        code: 'IDM-001',
        name: 'Indomie Goreng',
        lastPriceMinor: 3500,
        currency: 'IDR',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('findAll', () => {
    it('constrains the list query to the signed-in user', async () => {
      prisma.product.findMany.mockResolvedValue([]);

      await service.findAll(USER_ID);

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID } }),
      );
    });

    it('narrows to one merchant without dropping the user filter', async () => {
      prisma.product.findMany.mockResolvedValue([]);

      await service.findAll(USER_ID, MERCHANT_ID);

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID, merchantId: MERCHANT_ID } }),
      );
    });

    it('matches the search term against code and name, case-insensitively', async () => {
      prisma.product.findMany.mockResolvedValue([]);

      await service.findAll(USER_ID, undefined, 'indo');

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: USER_ID,
            OR: [
              { code: { contains: 'indo', mode: 'insensitive' } },
              { name: { contains: 'indo', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });
  });

  describe('tenant scoping', () => {
    it('looks a product up by owner, not by id alone', async () => {
      prisma.product.findFirst.mockResolvedValue(product);

      await service.findOne(USER_ID, product.id);

      expect(prisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: product.id, userId: USER_ID } }),
      );
    });

    it('reports another user’s product as missing rather than forbidden', async () => {
      // The row exists, it just is not ours — the scoped lookup returns null.
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.findOne(USER_ID, product.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to update a product that is not ours', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.update(USER_ID, product.id, { name: 'Nope' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('refuses to delete a product that is not ours', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.remove(USER_ID, product.id)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.product.delete).not.toHaveBeenCalled();
    });
  });

  describe('merchant ownership', () => {
    it('refuses to create under a merchant belonging to someone else', async () => {
      prisma.merchant.findFirst.mockResolvedValue(null);

      await expect(service.create(USER_ID, createDto)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it('refuses to move a product onto a merchant belonging to someone else', async () => {
      prisma.product.findFirst.mockResolvedValue(product);
      prisma.merchant.findFirst.mockResolvedValue(null);

      await expect(
        service.update(USER_ID, product.id, { merchantId: MERCHANT_ID }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('does not look up a merchant the update left alone', async () => {
      prisma.product.findFirst.mockResolvedValue(product);
      prisma.product.update.mockResolvedValue(product);

      await service.update(USER_ID, product.id, { name: 'Indomie Soto' });

      expect(prisma.merchant.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('category', () => {
    it('resolves the category by owner, not by id alone', async () => {
      prisma.merchant.findFirst.mockResolvedValue({ id: MERCHANT_ID });
      prisma.category.findFirst.mockResolvedValue(category);
      prisma.product.create.mockResolvedValue(product);

      await service.create(USER_ID, createDto);

      expect(prisma.category.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: CATEGORY_ID, userId: USER_ID } }),
      );
    });

    it('rejects another user’s category as missing rather than writing the row', async () => {
      prisma.merchant.findFirst.mockResolvedValue({ id: MERCHANT_ID });
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(service.create(USER_ID, createDto)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it('refuses an INCOME category — a product is something you buy', async () => {
      prisma.merchant.findFirst.mockResolvedValue({ id: MERCHANT_ID });
      prisma.category.findFirst.mockResolvedValue({ name: 'Salary', kind: CategoryKind.INCOME });

      await expect(service.create(USER_ID, createDto)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it('does not look up a category the update left alone', async () => {
      prisma.product.findFirst.mockResolvedValue(product);
      prisma.product.update.mockResolvedValue(product);

      await service.update(USER_ID, product.id, { name: 'Indomie Soto' });

      expect(prisma.category.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('code', () => {
    const createData = (): { code: string | null | undefined } =>
      (prisma.product.create.mock.calls[0] as [{ data: { code: string | null | undefined } }])[0]
        .data;

    const updateData = (): { code: string | null | undefined } =>
      (prisma.product.update.mock.calls[0] as [{ data: { code: string | null | undefined } }])[0]
        .data;

    it('stores NULL, not an empty string, for a product created without one', async () => {
      prisma.merchant.findFirst.mockResolvedValue({ id: MERCHANT_ID });
      prisma.category.findFirst.mockResolvedValue(category);
      prisma.product.create.mockResolvedValue({ ...product, code: null });

      await service.create(USER_ID, { ...createDto, code: undefined });

      // `''` would collide with the next uncoded product under
      // @@unique([merchantId, code]); NULLs are distinct, so NULL is the only
      // representation of "no code" the constraint tolerates.
      expect(createData().code).toBeNull();
    });

    it('clears the code when an update sends a blank one', async () => {
      prisma.product.findFirst.mockResolvedValue(product);
      prisma.product.update.mockResolvedValue({ ...product, code: null });

      await service.update(USER_ID, product.id, { code: '  ' });

      expect(updateData().code).toBeNull();
    });

    it('leaves the code alone when an update omits it', async () => {
      prisma.product.findFirst.mockResolvedValue(product);
      prisma.product.update.mockResolvedValue(product);

      await service.update(USER_ID, product.id, { name: 'Indomie Soto' });

      expect(updateData().code).toBeUndefined();
    });

    it('trims a code that was typed with stray whitespace', async () => {
      prisma.product.findFirst.mockResolvedValue(product);
      prisma.product.update.mockResolvedValue(product);

      await service.update(USER_ID, product.id, { code: ' IDM-002 ' });

      expect(updateData().code).toBe('IDM-002');
    });
  });
});
