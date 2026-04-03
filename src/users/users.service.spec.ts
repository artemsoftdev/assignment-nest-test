import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from '../common/entities/user.entity';
import { RoleName } from '../common/enums/role.enum';

const mockUser = {
  id: 'uuid-1',
  email: 'test@test.com',
  isActive: true,
  role: { name: RoleName.CLIENT },
  account: { id: 'acc-1', balance: 100 },
  createdAt: new Date(),
  refreshToken: 'hashed-token',
};

const mockUserRepository = {
  findAndCount: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated users', async () => {
      mockUserRepository.findAndCount.mockResolvedValue([[mockUser], 1]);
      const result = await service.findAll(1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].email).toBe('test@test.com');
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return a user by id', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      const result = await service.findOne('uuid-1');
      expect(result.id).toBe('uuid-1');
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      await expect(service.findOne('uuid-x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('blockUser', () => {
    it('should deactivate user and clear refresh token', async () => {
      mockUserRepository.findOne.mockResolvedValue({ ...mockUser });
      mockUserRepository.save.mockResolvedValue({});

      const result = await service.blockUser('uuid-1');

      expect(result.message).toContain('blocked');
      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false, refreshToken: null }),
      );
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      await expect(service.blockUser('uuid-x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('unblockUser', () => {
    it('should reactivate user', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });
      mockUserRepository.save.mockResolvedValue({});

      const result = await service.unblockUser('uuid-1');

      expect(result.message).toContain('unblocked');
      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });
  });

  describe('deactivateAccount', () => {
    it('should deactivate own account', async () => {
      mockUserRepository.findOne.mockResolvedValue({ ...mockUser });
      mockUserRepository.save.mockResolvedValue({});

      const result = await service.deactivateAccount('uuid-1');

      expect(result.message).toBe('Your account has been deactivated');
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      await expect(service.deactivateAccount('uuid-x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
