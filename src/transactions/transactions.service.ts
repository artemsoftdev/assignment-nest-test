import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Transaction } from '../common/entities/transaction.entity.js';
import { Account } from '../common/entities/account.entity.js';
import { TransactionStatus } from '../common/enums/transaction-status.enum.js';
import { TransactionType } from '../common/enums/transaction-type.enum.js';
import { WebhookService } from './webhook.service.js';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(Account) private accountRepository: Repository<Account>,
    private dataSource: DataSource,
    private webhookService: WebhookService,
  ) {}

  async findAllForUser(userId: string, page = 1, limit = 10) {
    const account = await this.accountRepository.findOne({ where: { userId } });
    if (!account) throw new NotFoundException('Account not found');

    const [transactions, total] = await this.transactionRepository.findAndCount(
      {
        where: [{ fromAccountId: account.id }, { toAccountId: account.id }],
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      },
    );

    return {
      data: transactions,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findAll(page = 1, limit = 10) {
    const [transactions, total] = await this.transactionRepository.findAndCount(
      {
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
        relations: ['fromAccount', 'toAccount'],
      },
    );

    return {
      data: transactions,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, userId: string, isAdmin: boolean) {
    const transaction = await this.transactionRepository.findOne({
      where: { id },
      relations: ['fromAccount', 'toAccount'],
    });
    if (!transaction) throw new NotFoundException('Transaction not found');

    if (!isAdmin) {
      const account = await this.accountRepository.findOne({
        where: { userId },
      });
      if (!account) throw new NotFoundException('Account not found');

      const isOwner =
        transaction.fromAccountId === account.id ||
        transaction.toAccountId === account.id;
      if (!isOwner) {
        throw new ForbiddenException('You can only view your own transactions');
      }
    }

    return transaction;
  }

  async cancelTransaction(
    transactionId: string,
    userId: string | null,
    isAdmin: boolean,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const transaction = await queryRunner.manager.findOne(Transaction, {
        where: { id: transactionId },
        relations: ['fromAccount', 'toAccount'],
      });
      if (!transaction) throw new NotFoundException('Transaction not found');

      if (transaction.status === TransactionStatus.CANCELLED) {
        throw new BadRequestException('Transaction is already cancelled');
      }

      // If not admin, check ownership
      if (!isAdmin) {
        const account = await this.accountRepository.findOne({
          where: { userId: userId! },
        });
        if (!account) throw new NotFoundException('Account not found');

        const isOwner =
          transaction.fromAccountId === account.id ||
          transaction.toAccountId === account.id;
        if (!isOwner) {
          throw new ForbiddenException(
            'You can only cancel your own transactions',
          );
        }
      }

      // Reverse the transaction
      if (transaction.type === TransactionType.DEPOSIT) {
        const toAccount = await queryRunner.manager.findOne(Account, {
          where: { id: transaction.toAccountId },
          lock: { mode: 'pessimistic_write' },
        });
        if (toAccount) {
          toAccount.balance =
            Number(toAccount.balance) - Number(transaction.amount);
          if (toAccount.balance < 0) {
            throw new BadRequestException(
              'Cannot cancel: account balance would go negative',
            );
          }
          await queryRunner.manager.save(toAccount);
        }
      } else if (transaction.type === TransactionType.TRANSFER) {
        const fromAccount = await queryRunner.manager.findOne(Account, {
          where: { id: transaction.fromAccountId },
          lock: { mode: 'pessimistic_write' },
        });
        const toAccount = await queryRunner.manager.findOne(Account, {
          where: { id: transaction.toAccountId },
          lock: { mode: 'pessimistic_write' },
        });

        if (toAccount) {
          toAccount.balance =
            Number(toAccount.balance) - Number(transaction.amount);
          if (toAccount.balance < 0) {
            throw new BadRequestException(
              'Cannot cancel: recipient balance would go negative',
            );
          }
          await queryRunner.manager.save(toAccount);
        }
        if (fromAccount) {
          fromAccount.balance =
            Number(fromAccount.balance) + Number(transaction.amount);
          await queryRunner.manager.save(fromAccount);
        }
      }

      transaction.status = TransactionStatus.CANCELLED;
      const savedTransaction = await queryRunner.manager.save(transaction);

      await queryRunner.commitTransaction();

      this.webhookService
        .sendTransactionEvent(savedTransaction)
        .catch(() => {});

      return savedTransaction;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
