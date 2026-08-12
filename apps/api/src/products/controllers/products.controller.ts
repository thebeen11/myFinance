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
import { CreateProductDto } from '../models/create-product.dto';
import { ProductResponse } from '../models/product.response';
import { UpdateProductDto } from '../models/update-product.dto';
import { ProductsService } from '../services/products.service';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List products, optionally scoped to one merchant.' })
  @ApiQuery({ name: 'merchantId', required: false, format: 'uuid' })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(
    @CurrentUser() userId: string,
    @Query('merchantId') merchantId?: string,
    @Query('search') search?: string,
  ): Promise<ProductResponse[]> {
    return this.productsService.findAll(userId, merchantId, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single product.' })
  findOne(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductResponse> {
    return this.productsService.findOne(userId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a product under a merchant.' })
  create(@CurrentUser() userId: string, @Body() dto: CreateProductDto): Promise<ProductResponse> {
    return this.productsService.create(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a product.' })
  update(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponse> {
    return this.productsService.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product.' })
  remove(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.productsService.remove(userId, id);
  }
}
