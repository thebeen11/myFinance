import { createHash, randomBytes } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { requireEnv } from '../../common/config/require-env';
import { PrismaService } from '../../database/prisma.service';
import { AuthTokensResponse } from '../models/auth-tokens.response';
import type { JwtPayload } from '../models/jwt-payload';

const SECONDS_PER_DAY = 86_400;

/**
 * Issues and rotates the token pair.
 *
 * The access token is a JWT — self-contained, so the guard never touches the
 * database. The refresh token is deliberately *not* a JWT: it is opaque random
 * bytes whose SHA-256 is the primary key of a row we can revoke. Revocability is
 * the entire point of a refresh token, and a signed token cannot be withdrawn.
 */
@Injectable()
export class TokenService {
  private readonly accessTtlSeconds = Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900);
  private readonly refreshTtlDays = Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async issue(user: { id: string; username: string }): Promise<Omit<AuthTokensResponse, 'user'>> {
    const payload: JwtPayload = { sub: user.id, username: user.username };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: requireEnv('JWT_ACCESS_SECRET'),
      expiresIn: this.accessTtlSeconds,
    });

    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.refreshTtlDays * SECONDS_PER_DAY * 1000);

    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: this.hash(refreshToken), expiresAt },
    });

    return { accessToken, refreshToken, expiresIn: this.accessTtlSeconds };
  }

  /**
   * Spends a refresh token and returns the user it belonged to.
   *
   * A token presented after it was already spent means someone is replaying a
   * stolen copy, so the whole family is revoked rather than just this one.
   */
  async consume(rawToken: string): Promise<string> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(rawToken) },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revokedAt) {
      await this.revokeAllForUser(stored.userId);
      throw new UnauthorizedException('Refresh token already used');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return stored.userId;
  }

  /** Idempotent: logging out with an unknown or spent token is still a logout. */
  async revoke(rawToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private hash(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
