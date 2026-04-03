import {
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
  Req,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TransactionsService } from './transactions.service.js';
import type { RequestWithUser } from '../common/interfaces/request-with-user.interface.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RoleName } from '../common/enums/role.enum.js';
import { PaginationQueryDto } from '../users/dto/pagination-query.dto.js';

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('transactions')
@UseGuards(JwtAccessGuard, RolesGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @Roles(RoleName.CLIENT)
  @ApiOperation({ summary: 'Get own transactions (Client)' })
  @ApiResponse({
    status: 200,
    description: 'List of user transactions with pagination',
  })
  findMyTransactions(
    @Req() req: RequestWithUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.transactionsService.findAllForUser(
      req.user.id,
      query.page,
      query.limit,
    );
  }

  @Get('all')
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: 'Get all transactions (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'List of all transactions with pagination',
  })
  findAll(@Query() query: PaginationQueryDto) {
    return this.transactionsService.findAll(query.page, query.limit);
  }

  @Get(':id')
  @Roles(RoleName.CLIENT, RoleName.ADMIN)
  @ApiOperation({ summary: 'Get transaction by ID (owner or admin)' })
  @ApiResponse({ status: 200, description: 'Transaction details' })
  @ApiResponse({ status: 403, description: 'Not your transaction' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) {
    const isAdmin = req.user.role?.name === RoleName.ADMIN;
    return this.transactionsService.findOne(id, req.user.id, isAdmin);
  }

  @Patch(':id/cancel')
  @Roles(RoleName.CLIENT, RoleName.ADMIN)
  @ApiOperation({ summary: 'Cancel a transaction (owner or admin)' })
  @ApiResponse({
    status: 200,
    description: 'Transaction cancelled, funds reversed',
  })
  @ApiResponse({
    status: 400,
    description: 'Transaction already cancelled or insufficient balance',
  })
  @ApiResponse({ status: 403, description: 'Not your transaction' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  cancelTransaction(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestWithUser,
  ) {
    const isAdmin = req.user.role?.name === RoleName.ADMIN;
    return this.transactionsService.cancelTransaction(id, req.user.id, isAdmin);
  }
}
