import { Module } from '@nestjs/common';

import { MerchantsController } from './controllers/merchants.controller';
import { MerchantsService } from './services/merchants.service';

@Module({
  controllers: [MerchantsController],
  providers: [MerchantsService],
  exports: [MerchantsService],
})
export class MerchantsModule {}
