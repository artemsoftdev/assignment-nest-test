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
import { UsersService } from './users.service.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RoleName } from '../common/enums/role.enum.js';
import { PaginationQueryDto } from './dto/pagination-query.dto.js';
import type { RequestWithUser } from '../common/interfaces/request-with-user.interface.js';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAccessGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: 'Get all users (Admin only)' })
  @ApiResponse({ status: 200, description: 'List of users with pagination' })
  findAll(@Query() query: PaginationQueryDto) {
    return this.usersService.findAll(query.page, query.limit);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Current user profile' })
  getProfile(@Req() req: RequestWithUser) {
    return this.usersService.getProfile(req.user.id);
  }

  @Patch('deactivate')
  @ApiOperation({ summary: 'Deactivate own account (any authenticated user)' })
  @ApiResponse({ status: 200, description: 'Account deactivated' })
  deactivateAccount(@Req() req: RequestWithUser) {
    return this.usersService.deactivateAccount(req.user.id);
  }

  @Get(':id')
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: 'Get user by ID (Admin only)' })
  @ApiResponse({ status: 200, description: 'User details' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id/block')
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: 'Block a user (Admin only)' })
  @ApiResponse({ status: 200, description: 'User blocked' })
  @ApiResponse({ status: 404, description: 'User not found' })
  blockUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.blockUser(id);
  }

  @Patch(':id/unblock')
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: 'Unblock a user (Admin only)' })
  @ApiResponse({ status: 200, description: 'User unblocked' })
  @ApiResponse({ status: 404, description: 'User not found' })
  unblockUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.unblockUser(id);
  }
}
