import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AccountBalanceResponse } from '../models/account-balance.response';
import { AccountResponse } from '../models/account.response';
import { CreateAccountDto } from '../models/create-account.dto';
import { UpdateAccountDto } from '../models/update-account.dto';
import { AccountsService } from '../services/accounts.service';

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  @ApiOperation({ summary: 'List accounts.' })
  @ApiQuery({ name: 'includeArchived', required: false, type: Boolean })
  findAll(
    @CurrentUser() userId: string,
    @Query('includeArchived', new ParseBoolPipe({ optional: true }))
    includeArchived?: boolean,
  ): Promise<AccountResponse[]> {
    return this.accountsService.findAll(userId, includeArchived ?? false);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single account.' })
  findOne(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountResponse> {
    return this.accountsService.findOne(userId, id);
  }

  @Get(':id/balance')
  @ApiOperation({
    summary: 'Current balance, derived from the opening balance and transactions.',
  })
  getBalance(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountBalanceResponse> {
    return this.accountsService.getBalance(userId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create an account.' })
  create(@CurrentUser() userId: string, @Body() dto: CreateAccountDto): Promise<AccountResponse> {
    return this.accountsService.create(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update, archive or restore an account.' })
  update(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
  ): Promise<AccountResponse> {
    return this.accountsService.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an account and every transaction on it.' })
  remove(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.accountsService.remove(userId, id);
  }
}
