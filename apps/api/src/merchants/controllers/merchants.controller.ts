import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CreateMerchantDto } from '../models/create-merchant.dto';
import { MerchantResponse } from '../models/merchant.response';
import { UpdateMerchantDto } from '../models/update-merchant.dto';
import { MerchantsService } from '../services/merchants.service';

@ApiTags('merchants')
@ApiBearerAuth()
@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get()
  @ApiOperation({ summary: 'List merchants, optionally filtered by name.' })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(
    @CurrentUser() userId: string,
    @Query('search') search?: string,
  ): Promise<MerchantResponse[]> {
    return this.merchantsService.findAll(userId, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single merchant.' })
  findOne(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MerchantResponse> {
    return this.merchantsService.findOne(userId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a merchant.' })
  create(@CurrentUser() userId: string, @Body() dto: CreateMerchantDto): Promise<MerchantResponse> {
    return this.merchantsService.create(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a merchant.' })
  update(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMerchantDto,
  ): Promise<MerchantResponse> {
    return this.merchantsService.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a merchant; its transactions stay, with no merchant.',
  })
  remove(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.merchantsService.remove(userId, id);
  }
}
