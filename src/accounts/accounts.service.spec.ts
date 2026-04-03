import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountsService } from './accounts.service';
import { Account } from '../common/entities/account.entity';
import { Transaction } from '../common/entities/transaction.entity';
import { WebhookService } from '../transactions/webhook.service';

const mockAccount = { id: 'acc-1', userId: 'uuid-1', balance: 500 };
const mockAccount2 = { id: 'acc-2', userId: 'uuid-2', balance: 0 };

const mockQueryRunner = {
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  manager: {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn((entity: unknown, data: unknown) => data),
  },
};

const mockDataSource = {
  createQueryRunner: jest.fn(() => mockQueryRunner),
};

const mockAccountRepository = { findOne: jest.fn() };
const mockTransactionRepository = {};
const mockWebhookService = {
  sendTransactionEvent: jest.fn().mockResolvedValue(undefined),
};

describe('AccountsService', () => {
  let service: AccountsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        {
          provide: getRepositoryToken(Account),
          useValue: mockAccountRepository,
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepository,
        },
        { provide: DataSource, useValue: mockDataSource },
        { provide: WebhookService, useValue: mockWebhookService },
      ],
    }).compile();

    service = module.get<AccountsService>(AccountsService);
    jest.clearAllMocks();
    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
  });

  describe('getAccount', () => {
    it('should return account for user', async () => {
      mockAccountRepository.findOne.mockResolvedValue(mockAccount);
      const result = await service.getAccount('uuid-1');
      expect(result.id).toBe('acc-1');
    });

    it('should throw NotFoundException if no account', async () => {
      mockAccountRepository.findOne.mockResolvedValue(null);
      await expect(service.getAccount('uuid-x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deposit', () => {
    it('should deposit funds and create transaction', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue({ ...mockAccount });
      mockQueryRunner.manager.save.mockImplementation((v: unknown) =>
        Promise.resolve(v),
      );

      const result = await service.deposit('uuid-1', 100);

      expect(result.balance).toBe(600);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockWebhookService.sendTransactionEvent).toHaveBeenCalled();
    });

    it('should throw NotFoundException if account not found', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(null);
      await expect(service.deposit('uuid-x', 100)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('transfer', () => {
    it('should transfer funds between accounts', async () => {
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockAccount }) // from
        .mockResolvedValueOnce({ ...mockAccount2 }); // to
      mockQueryRunner.manager.save.mockImplementation((v: unknown) =>
        Promise.resolve(v),
      );

      const result = await service.transfer('uuid-1', 'acc-2', 200);

      expect(result.balance).toBe(300);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException if insufficient funds', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockAccount,
        balance: 50,
      });

      await expect(service.transfer('uuid-1', 'acc-2', 200)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if same account', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({ ...mockAccount });

      await expect(service.transfer('uuid-1', 'acc-1', 100)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if destination not found', async () => {
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockAccount })
        .mockResolvedValueOnce(null);

      await expect(service.transfer('uuid-1', 'acc-x', 100)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
