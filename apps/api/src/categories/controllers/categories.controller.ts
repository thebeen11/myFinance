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
import { CategoryKind } from '@myfinance/shared';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CategoryResponse } from '../models/category.response';
import { CreateCategoryDto } from '../models/create-category.dto';
import { UpdateCategoryDto } from '../models/update-category.dto';
import { CategoriesService } from '../services/categories.service';

@ApiTags('categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List categories, optionally filtered by kind and account.' })
  @ApiQuery({
    name: 'kind',
    required: false,
    enum: CategoryKind,
    enumName: 'CategoryKind',
  })
  @ApiQuery({ name: 'accountId', required: false, format: 'uuid' })
  findAll(
    @CurrentUser() userId: string,
    @Query('kind') kind?: CategoryKind,
    @Query('accountId') accountId?: string,
  ): Promise<CategoryResponse[]> {
    return this.categoriesService.findAll(userId, kind, accountId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single category.' })
  findOne(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CategoryResponse> {
    return this.categoriesService.findOne(userId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a category.' })
  create(@CurrentUser() userId: string, @Body() dto: CreateCategoryDto): Promise<CategoryResponse> {
    return this.categoriesService.create(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a category.' })
  update(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponse> {
    return this.categoriesService.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a category; its transactions stay, uncategorised.',
  })
  remove(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.categoriesService.remove(userId, id);
  }
}
