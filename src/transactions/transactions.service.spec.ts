import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TransactionsService } from './transactions.service';
import { Transaction } from '../common/entities/transaction.entity';
import { Account } from '../common/entities/account.entity';
import { WebhookService } from './webhook.service';
import { TransactionStatus } from '../common/enums/transaction-status.enum';
import { TransactionType } from '../common/enums/transaction-type.enum';

const mockAccount = { id: 'acc-1', userId: 'uuid-1', balance: 500 };

const mockTransaction = {
  id: 'tx-1',
  type: TransactionType.TRANSFER,
  amount: 100,
  status: TransactionStatus.COMPLETED,
  fromAccountId: 'acc-1',
  toAccountId: 'acc-2',
  createdAt: new Date(),
};

const mockQueryRunner = {
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  manager: {
    findOne: jest.fn(),
    save: jest.fn((v: unknown) => Promise.resolve(v)),
  },
};

const mockTransactionRepository = {
  findAndCount: jest.fn(),
  findOne: jest.fn(),
};
const mockAccountRepository = { findOne: jest.fn() };
const mockDataSource = { createQueryRunner: jest.fn(() => mockQueryRunner) };
const mockWebhookService = {
  sendTransactionEvent: jest.fn().mockResolvedValue(undefined),
};

describe('TransactionsService', () => {
  let service: TransactionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepository,
        },
        {
          provide: getRepositoryToken(Account),
          useValue: mockAccountRepository,
        },
        { provide: DataSource, useValue: mockDataSource },
        { provide: WebhookService, useValue: mockWebhookService },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    jest.clearAllMocks();
    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
  });

  describe('findAllForUser', () => {
    it('should return paginated transactions for user', async () => {
      mockAccountRepository.findOne.mockResolvedValue(mockAccount);
      mockTransactionRepository.findAndCount.mockResolvedValue([
        [mockTransaction],
        1,
      ]);

      const result = await service.findAllForUser('uuid-1', 1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should throw NotFoundException if account not found', async () => {
      mockAccountRepository.findOne.mockResolvedValue(null);
      await expect(service.findAllForUser('uuid-x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all transactions paginated', async () => {
      mockTransactionRepository.findAndCount.mockResolvedValue([
        [mockTransaction],
        1,
      ]);
      const result = await service.findAll(1, 10);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return transaction if owner', async () => {
      mockTransactionRepository.findOne.mockResolvedValue(mockTransaction);
      mockAccountRepository.findOne.mockResolvedValue(mockAccount);

      const result = await service.findOne('tx-1', 'uuid-1', false);
      expect(result.id).toBe('tx-1');
    });

    it('should return transaction if admin', async () => {
      mockTransactionRepository.findOne.mockResolvedValue(mockTransaction);
      const result = await service.findOne('tx-1', 'admin-id', true);
      expect(result.id).toBe('tx-1');
    });

    it('should throw ForbiddenException if not owner', async () => {
      mockTransactionRepository.findOne.mockResolvedValue(mockTransaction);
      mockAccountRepository.findOne.mockResolvedValue({
        id: 'acc-other',
        userId: 'uuid-other',
      });

      await expect(
        service.findOne('tx-1', 'uuid-other', false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if not found', async () => {
      mockTransactionRepository.findOne.mockResolvedValue(null);
      await expect(service.findOne('tx-x', 'uuid-1', false)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('cancelTransaction', () => {
    it('should cancel a transfer and reverse funds', async () => {
      const fromAcc = { id: 'acc-1', balance: 400 };
      const toAcc = { id: 'acc-2', balance: 100 };

      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockTransaction }) // transaction
        .mockResolvedValueOnce(fromAcc) // from account (lock)
        .mockResolvedValueOnce(toAcc); // to account (lock)
      mockAccountRepository.findOne.mockResolvedValue(mockAccount);

      const result = await service.cancelTransaction('tx-1', 'uuid-1', false);

      expect(result.status).toBe(TransactionStatus.CANCELLED);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException if already cancelled', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTransaction,
        status: TransactionStatus.CANCELLED,
      });

      await expect(
        service.cancelTransaction('tx-1', 'uuid-1', false),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if not owner and not admin', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTransaction,
      });
      mockAccountRepository.findOne.mockResolvedValue({
        id: 'acc-other',
        userId: 'uuid-other',
      });

      await expect(
        service.cancelTransaction('tx-1', 'uuid-other', false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin to cancel any transaction', async () => {
      const fromAcc = { id: 'acc-1', balance: 400 };
      const toAcc = { id: 'acc-2', balance: 100 };

      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockTransaction })
        .mockResolvedValueOnce(fromAcc)
        .mockResolvedValueOnce(toAcc);

      const result = await service.cancelTransaction('tx-1', 'admin-id', true);

      expect(result.status).toBe(TransactionStatus.CANCELLED);
    });

    it('should throw NotFoundException if transaction not found', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValueOnce(null);

      await expect(
        service.cancelTransaction('tx-x', 'uuid-1', false),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
