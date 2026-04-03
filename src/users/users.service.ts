import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../common/entities/user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
  ) {}

  async findAll(page = 1, limit = 10) {
    const [users, total] = await this.userRepository.findAndCount({
      relations: ['role', 'account'],
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data: users.map((u) => ({
        id: u.id,
        email: u.email,
        isActive: u.isActive,
        role: u.role.name,
        accountId: u.account?.id,
        balance: u.account?.balance,
        createdAt: u.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['role', 'account'],
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      id: user.id,
      email: user.email,
      isActive: user.isActive,
      role: user.role.name,
      accountId: user.account?.id,
      balance: user.account?.balance,
      createdAt: user.createdAt,
    };
  }

  async blockUser(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['role'],
    });
    if (!user) throw new NotFoundException('User not found');
    user.isActive = false;
    user.refreshToken = null;
    await this.userRepository.save(user);
    return { message: `User ${user.email} has been blocked` };
  }

  async unblockUser(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['role'],
    });
    if (!user) throw new NotFoundException('User not found');
    user.isActive = true;
    await this.userRepository.save(user);
    return { message: `User ${user.email} has been unblocked` };
  }

  async deactivateAccount(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.isActive = false;
    user.refreshToken = null;
    await this.userRepository.save(user);
    return { message: 'Your account has been deactivated' };
  }

  async getProfile(userId: string) {
    return this.findOne(userId);
  }
}
