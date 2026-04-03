import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AccountsService } from './accounts.service.js';
import type { RequestWithUser } from '../common/interfaces/request-with-user.interface.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RoleName } from '../common/enums/role.enum.js';
import { DepositDto } from './dto/deposit.dto.js';
import { TransferDto } from './dto/transfer.dto.js';

@ApiTags('Accounts')
@ApiBearerAuth()
@Controller('accounts')
@UseGuards(JwtAccessGuard, RolesGuard)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  @Roles(RoleName.CLIENT)
  @ApiOperation({ summary: 'Get own account details' })
  @ApiResponse({ status: 200, description: 'Account details' })
  getAccount(@Req() req: RequestWithUser) {
    return this.accountsService.getAccount(req.user.id);
  }

  @Post('deposit')
  @Roles(RoleName.CLIENT)
  @ApiOperation({ summary: 'Deposit funds to own account' })
  @ApiBody({ type: DepositDto })
  @ApiResponse({ status: 201, description: 'Deposit successful' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  deposit(@Req() req: RequestWithUser, @Body() dto: DepositDto) {
    return this.accountsService.deposit(req.user.id, dto.amount);
  }

  @Post('transfer')
  @Roles(RoleName.CLIENT)
  @ApiOperation({ summary: 'Transfer funds to another account' })
  @ApiBody({ type: TransferDto })
  @ApiResponse({ status: 201, description: 'Transfer successful' })
  @ApiResponse({
    status: 400,
    description: 'Insufficient funds or same account',
  })
  @ApiResponse({ status: 404, description: 'Account not found' })
  transfer(@Req() req: RequestWithUser, @Body() dto: TransferDto) {
    return this.accountsService.transfer(
      req.user.id,
      dto.toAccountId,
      dto.amount,
    );
  }
}
