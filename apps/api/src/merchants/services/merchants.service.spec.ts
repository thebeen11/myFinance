import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../database/prisma.service';
import { MerchantsService } from './merchants.service';

const USER_ID = '99999999-9999-4999-8999-999999999999';

const merchant = {
  id: '22222222-2222-4222-8222-222222222222',
  userId: USER_ID,
  name: 'Indomaret',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  _count: { transactions: 3, products: 2 },
};

describe('MerchantsService', () => {
  const prisma = {
    merchant: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  let service: MerchantsService;

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [MerchantsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(MerchantsService);
  });

  describe('findOne', () => {
    it('flattens the relation counts into transactionCount and productCount', async () => {
      prisma.merchant.findFirst.mockResolvedValue(merchant);

      await expect(service.findOne(USER_ID, merchant.id)).resolves.toEqual({
        id: merchant.id,
        name: 'Indomaret',
        transactionCount: 3,
        productCount: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('findAll', () => {
    it('constrains the list query to the signed-in user', async () => {
      prisma.merchant.findMany.mockResolvedValue([]);

      await service.findAll(USER_ID);

      expect(prisma.merchant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID } }),
      );
    });

    it('matches the search term case-insensitively, still scoped to the user', async () => {
      prisma.merchant.findMany.mockResolvedValue([]);

      await service.findAll(USER_ID, 'indo');

      expect(prisma.merchant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID, name: { contains: 'indo', mode: 'insensitive' } },
        }),
      );
    });
  });

  describe('tenant scoping', () => {
    it('looks a merchant up by owner, not by id alone', async () => {
      prisma.merchant.findFirst.mockResolvedValue(merchant);

      await service.findOne(USER_ID, merchant.id);

      expect(prisma.merchant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: merchant.id, userId: USER_ID } }),
      );
    });

    it('reports another user’s merchant as missing rather than forbidden', async () => {
      // The row exists, it just is not ours — the scoped lookup returns null.
      prisma.merchant.findFirst.mockResolvedValue(null);

      await expect(service.findOne(USER_ID, merchant.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to rename a merchant that is not ours', async () => {
      prisma.merchant.findFirst.mockResolvedValue(null);

      await expect(service.update(USER_ID, merchant.id, { name: 'Nope' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.merchant.update).not.toHaveBeenCalled();
    });

    it('refuses to delete a merchant that is not ours', async () => {
      prisma.merchant.findFirst.mockResolvedValue(null);

      await expect(service.remove(USER_ID, merchant.id)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.merchant.delete).not.toHaveBeenCalled();
    });
  });
});
