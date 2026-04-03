import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from '../common/entities/user.entity';
import { Role } from '../common/entities/role.entity';
import { Account } from '../common/entities/account.entity';
import { RoleName } from '../common/enums/role.enum';

const mockUserRepository = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
};
const mockRoleRepository = { findOne: jest.fn() };
const mockAccountRepository = { create: jest.fn(), save: jest.fn() };
const mockJwtService = { signAsync: jest.fn() };
const mockConfigService = {
  get: jest.fn((key: string) => {
    const map: Record<string, string> = {
      JWT_ACCESS_EXPIRATION: '15m',
      JWT_REFRESH_EXPIRATION: '7d',
    };
    return map[key];
  }),
  getOrThrow: jest.fn(() => 'test-secret'),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: getRepositoryToken(Role), useValue: mockRoleRepository },
        {
          provide: getRepositoryToken(Account),
          useValue: mockAccountRepository,
        },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    const dto = { email: 'test@test.com', password: 'Test123!' };
    const clientRole = { id: 1, name: RoleName.CLIENT };

    it('should register a new user', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      mockRoleRepository.findOne.mockResolvedValue(clientRole);
      mockUserRepository.create.mockReturnValue({ email: dto.email });
      mockUserRepository.save.mockResolvedValue({
        id: 'uuid-1',
        email: dto.email,
      });
      mockAccountRepository.create.mockReturnValue({});
      mockAccountRepository.save.mockResolvedValue({});
      mockJwtService.signAsync.mockResolvedValue('token');
      mockUserRepository.update.mockResolvedValue({});

      const result = await service.register(dto);

      expect(result.user.email).toBe(dto.email);
      expect(result.user.role).toBe(RoleName.CLIENT);
      expect(mockUserRepository.save).toHaveBeenCalled();
      expect(mockAccountRepository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if email exists', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: 'existing' });
      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });

    it('should throw InternalServerErrorException if role not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      mockRoleRepository.findOne.mockResolvedValue(null);
      await expect(service.register(dto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('login', () => {
    const dto = { email: 'test@test.com', password: 'Test123!' };

    it('should login with valid credentials', async () => {
      const hashed = await bcrypt.hash(dto.password, 10);
      mockUserRepository.findOne.mockResolvedValue({
        id: 'uuid-1',
        email: dto.email,
        password: hashed,
        isActive: true,
        role: { name: RoleName.CLIENT },
      });
      mockJwtService.signAsync.mockResolvedValue('token');
      mockUserRepository.update.mockResolvedValue({});

      const result = await service.login(dto);

      expect(result.user.email).toBe(dto.email);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException if account deactivated', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        id: 'uuid-1',
        isActive: false,
        role: { name: RoleName.CLIENT },
      });
      await expect(service.login(dto)).rejects.toThrow(ForbiddenException);
    });

    it('should throw UnauthorizedException if password wrong', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        id: 'uuid-1',
        email: dto.email,
        password: await bcrypt.hash('different', 10),
        isActive: true,
        role: { name: RoleName.CLIENT },
      });
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should clear refresh token', async () => {
      mockUserRepository.update.mockResolvedValue({});
      await service.logout('uuid-1');
      expect(mockUserRepository.update).toHaveBeenCalledWith('uuid-1', {
        refreshToken: null,
      });
    });
  });

  describe('refreshTokens', () => {
    it('should throw ForbiddenException if user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      await expect(service.refreshTokens('uuid-1', 'token')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException if token does not match', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        id: 'uuid-1',
        isActive: true,
        refreshToken: await bcrypt.hash('different-token', 10),
        role: { name: RoleName.CLIENT },
      });
      await expect(
        service.refreshTokens('uuid-1', 'wrong-token'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
