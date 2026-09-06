import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AccountsModule } from './accounts/accounts.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { HealthModule } from './common/health/health.module';
import { DatabaseModule } from './database/database.module';
import { MerchantsModule } from './merchants/merchants.module';
import { ProductsModule } from './products/products.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    DatabaseModule,
    // Registers the global JwtAuthGuard, so it must be imported before the
    // domain modules whose routes it protects.
    AuthModule,
    HealthModule,
    AccountsModule,
    CategoriesModule,
    MerchantsModule,
    ProductsModule,
    TransactionsModule,
    ReceiptsModule,
  ],
})
export class AppModule {}
