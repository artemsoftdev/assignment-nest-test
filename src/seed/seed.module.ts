import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedService } from './seed.service.js';
import { Role } from '../common/entities/role.entity.js';
import { User } from '../common/entities/user.entity.js';
import { Account } from '../common/entities/account.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Role, User, Account])],
  providers: [SeedService],
})
export class SeedModule {}
