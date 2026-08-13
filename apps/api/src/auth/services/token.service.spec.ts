import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../database/prisma.service';
import { TokenService } from './token.service';

const USER_ID = '99999999-9999-4999-8999-999999999999';

const storedToken = {
  id: '22222222-2222-4222-8222-222222222222',
  userId: USER_ID,
  tokenHash: 'irrelevant — the service hashes the raw value itself',
  expiresAt: new Date(Date.now() + 60_000),
  revokedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('TokenService', () => {
  const prisma = {
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const jwt = { signAsync: jest.fn() };

  let service: TokenService;

  beforeEach(async () => {
    jest.resetAllMocks();
    process.env.JWT_ACCESS_SECRET = 'test-secret';
    jwt.signAsync.mockResolvedValue('signed.access.token');

    const moduleRef = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    service = moduleRef.get(TokenService);
  });

  describe('issue', () => {
    it('persists only a hash, never the refresh token itself', async () => {
      let persistedHash = '';

      prisma.refreshToken.create.mockImplementation((args: { data: { tokenHash: string } }) => {
        persistedHash = args.data.tokenHash;
        return Promise.resolve(storedToken);
      });

      const issued = await service.issue({ id: USER_ID, username: 'owner' });

      expect(persistedHash).toHaveLength(64); // sha256, hex
      expect(persistedHash).not.toBe(issued.refreshToken);
    });
  });

  describe('consume', () => {
    it('revokes the presented token and returns its owner', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(storedToken);

      await expect(service.consume('raw-token')).resolves.toBe(USER_ID);
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: storedToken.id },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    it('treats a replayed token as theft and revokes the whole family', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...storedToken,
        revokedAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      await expect(service.consume('raw-token')).rejects.toBeInstanceOf(UnauthorizedException);

      // Not just this one row: every live token for the user is withdrawn.
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    it('rejects an expired token without revoking anything else', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...storedToken,
        expiresAt: new Date(Date.now() - 1_000),
      });

      await expect(service.consume('raw-token')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a token it never issued', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.consume('raw-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
