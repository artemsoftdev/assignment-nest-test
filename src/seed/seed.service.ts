import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import bcrypt from 'bcrypt';
import { Role } from '../common/entities/role.entity.js';
import { User } from '../common/entities/user.entity.js';
import { Account } from '../common/entities/account.entity.js';
import { RoleName } from '../common/enums/role.enum.js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Role) private roleRepository: Repository<Role>,
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(Account) private accountRepository: Repository<Account>,
    private configService: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    await this.seedRoles();
    await this.seedAdmin();
  }

  private async seedRoles() {
    for (const roleName of Object.values(RoleName)) {
      const exists = await this.roleRepository.findOne({
        where: { name: roleName },
      });
      if (!exists) {
        const role = this.roleRepository.create({ name: roleName });
        await this.roleRepository.save(role);
        this.logger.log(`Role "${roleName}" created`);
      }
    }
  }

  private async seedAdmin() {
    const adminEmail =
      this.configService.get<string>('ADMIN_EMAIL') || 'admin@admin.com';
    const adminPassword =
      this.configService.get<string>('ADMIN_PASSWORD') || 'Admin123!';

    const existing = await this.userRepository.findOne({
      where: { email: adminEmail },
    });
    if (existing) return;

    const adminRole = await this.roleRepository.findOne({
      where: { name: RoleName.ADMIN },
    });
    if (!adminRole) {
      this.logger.error('Admin role not found, cannot seed admin user');
      return;
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const admin = this.userRepository.create({
      email: adminEmail,
      password: hashedPassword,
      role: adminRole,
      roleId: adminRole.id,
    });
    const savedAdmin = await this.userRepository.save(admin);

    const account = this.accountRepository.create({
      userId: savedAdmin.id,
      balance: 0,
    });
    await this.accountRepository.save(account);

    this.logger.log(`Admin user seeded: ${adminEmail}`);
  }
}
