import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AccountType, DEFAULT_CURRENCY } from '@myfinance/shared';
import { hash, verify } from 'argon2';

import { requireEnv } from '../../common/config/require-env';
import { DEFAULT_CATEGORIES } from '../../common/constants/default-categories';
import { PrismaService } from '../../database/prisma.service';
import type { UserModel } from '../../generated/prisma/models';
import { AuthTokensResponse } from '../models/auth-tokens.response';
import { LoginDto } from '../models/login.dto';
import { RegisterDto } from '../models/register.dto';
import { UserResponse } from '../models/user.response';
import { TokenService } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokensResponse> {
    // requireEnv, not a comparison against undefined: a missing INVITE_CODE must
    // close registration, never open it.
    if (dto.inviteCode !== requireEnv('INVITE_CODE')) {
      throw new ForbiddenException('Invalid invite code');
    }

    const passwordHash = await hash(dto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      // A duplicate email surfaces as P2002 -> 409 through PrismaExceptionFilter.
      const created = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash,
          displayName: dto.displayName ?? null,
        },
      });

      // The first-user adoption of ownerless rows that used to live here is gone:
      // `userId` is NOT NULL on every owned table now, so `where: { userId: null }`
      // could never match a row, and it stopped type-checking once the generated
      // client caught up with the schema. The pre-auth data it existed to rescue
      // was adopted long ago.

      // A new user — invited, or the first on a fresh database — starts with the
      // default set rather than an empty screen. The wallet comes first: a
      // category names the account it is paid from, so there has to be one to name.
      const cash = await tx.account.create({
        data: {
          userId: created.id,
          name: 'Cash',
          type: AccountType.CASH,
          currency: DEFAULT_CURRENCY,
        },
      });

      await tx.category.createMany({
        data: DEFAULT_CATEGORIES.map((category) => ({
          ...category,
          userId: created.id,
          accountId: cash.id,
        })),
      });

      return created;
    });

    return this.withUser(user);
  }

  async login(dto: LoginDto): Promise<AuthTokensResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });

    // One message for both branches: whether an email is registered is not
    // something an unauthenticated caller gets to learn.
    if (!user || !(await verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.withUser(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokensResponse> {
    const userId = await this.tokens.consume(refreshToken);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.withUser(user);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revoke(refreshToken);
  }

  async me(userId: string): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('Account no longer exists');
    }

    return this.toResponse(user);
  }

  private async withUser(user: UserModel): Promise<AuthTokensResponse> {
    return { ...(await this.tokens.issue(user)), user: this.toResponse(user) };
  }

  private toResponse(user: UserModel): UserResponse {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
