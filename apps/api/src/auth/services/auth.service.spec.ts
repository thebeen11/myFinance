import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';

import { PrismaService } from '../../database/prisma.service';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

const INVITE_CODE = 'let-me-in';
const USER_ID = '99999999-9999-4999-8999-999999999999';
const CASH_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

const user = {
  id: USER_ID,
  username: 'owner',
  passwordHash: 'replaced-per-test',
  displayName: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const registration = {
  username: 'Owner',
  password: 'a-long-enough-password',
  inviteCode: INVITE_CODE,
};

describe('AuthService', () => {
  const tx = {
    user: { count: jest.fn(), create: jest.fn() },
    account: { updateMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    category: { updateMany: jest.fn(), count: jest.fn(), createMany: jest.fn() },
    transaction: { updateMany: jest.fn() },
  };

  const prisma = {
    $transaction: jest.fn(<T>(callback: (client: typeof tx) => Promise<T>): Promise<T> =>
      callback(tx),
    ),
    user: { findUnique: jest.fn() },
  };

  const tokens = {
    issue: jest.fn(),
    consume: jest.fn(),
    revoke: jest.fn(),
  };

  let service: AuthService;

  beforeEach(async () => {
    jest.resetAllMocks();
    process.env.INVITE_CODE = INVITE_CODE;

    prisma.$transaction.mockImplementation(
      <T>(callback: (client: typeof tx) => Promise<T>): Promise<T> => callback(tx),
    );
    tokens.issue.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: 900,
    });
    tx.user.create.mockResolvedValue(user);
    tx.user.count.mockResolvedValue(0);
    tx.account.count.mockResolvedValue(1);
    tx.category.count.mockResolvedValue(8);
    tx.account.create.mockResolvedValue({ id: CASH_ACCOUNT_ID });
    tx.account.updateMany.mockResolvedValue({ count: 0 });
    tx.category.updateMany.mockResolvedValue({ count: 0 });
    tx.transaction.updateMany.mockResolvedValue({ count: 0 });

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: TokenService, useValue: tokens },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('register', () => {
    it('refuses a wrong invite code before touching the database', async () => {
      await expect(
        service.register({ ...registration, inviteCode: 'guessed' }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses every registration when INVITE_CODE is unset, rather than opening up', async () => {
      delete process.env.INVITE_CODE;

      await expect(service.register(registration)).rejects.toThrow(/INVITE_CODE is not set/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('stores an argon2 hash and never the raw password', async () => {
      let stored = '';

      tx.user.create.mockImplementation((args: { data: { passwordHash: string } }) => {
        stored = args.data.passwordHash;
        return Promise.resolve(user);
      });

      await service.register(registration);

      expect(stored.startsWith('$argon2')).toBe(true);
      expect(stored).not.toContain(registration.password);
    });

    it('lowercases the username so casing cannot create a second account', async () => {
      await service.register(registration);

      expect(tx.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ username: 'owner' }) as object,
        }),
      );
    });

    // The two "adopts unowned rows for the first user" cases are gone with the code
    // they covered: `userId` is NOT NULL on every owned table, so the ownerless rows
    // they rescued can no longer exist and the query no longer type-checks.
    it('never rewrites ownership of existing rows', async () => {
      tx.user.count.mockResolvedValue(0);

      await service.register(registration);

      expect(tx.account.updateMany).not.toHaveBeenCalled();
      expect(tx.category.updateMany).not.toHaveBeenCalled();
      expect(tx.transaction.updateMany).not.toHaveBeenCalled();
    });

    it('gives a new user the default categories and a wallet', async () => {
      tx.user.count.mockResolvedValue(1);

      await service.register(registration);

      expect(tx.category.createMany).toHaveBeenCalled();
      expect(tx.account.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: USER_ID, name: 'Cash' }) as object,
        }),
      );
    });

    it('files every default category on the wallet it just created', async () => {
      tx.user.count.mockResolvedValue(1);

      await service.register(registration);

      const [{ data }] = tx.category.createMany.mock.calls[0] as [
        { data: { accountId: string }[] },
      ];
      expect(data).not.toHaveLength(0);
      expect(data.every((category) => category.accountId === CASH_ACCOUNT_ID)).toBe(true);
    });
  });

  describe('login', () => {
    it('returns a token pair for the right password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...user,
        passwordHash: await hash(registration.password),
      });

      await expect(
        service.login({ username: user.username, password: registration.password }),
      ).resolves.toMatchObject({ accessToken: 'access', user: { username: user.username } });
    });

    it('rejects a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...user,
        passwordHash: await hash(registration.password),
      });

      await expect(
        service.login({ username: user.username, password: 'not-the-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('does not reveal whether a username is registered', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...user,
        passwordHash: await hash(registration.password),
      });
      const wrongPassword = await service
        .login({ username: user.username, password: 'not-the-password' })
        .catch((error: Error) => error.message);

      prisma.user.findUnique.mockResolvedValue(null);
      const unknownUsername = await service
        .login({ username: 'nobody', password: 'anything-at-all' })
        .catch((error: Error) => error.message);

      expect(unknownUsername).toBe(wrongPassword);
    });
  });
});
