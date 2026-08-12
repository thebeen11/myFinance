import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';

/**
 * The single Prisma client for the process.
 *
 * Prisma 7 has no Rust query engine: the connection is owned by a driver
 * adapter (node-postgres here), so pool settings are pg's, not Prisma's.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL is not set — copy .env.example to apps/api/.env');
    }

    super({
      adapter: new PrismaPg({
        connectionString,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    // Fail soft: a database that is down at boot should not stop the process.
    // Queries surface their own errors and GET /health reports `database: down`.
    try {
      await this.$connect();
      this.logger.log('Connected to Postgres');
    } catch (error) {
      this.logger.error(
        `Could not reach Postgres at boot: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
