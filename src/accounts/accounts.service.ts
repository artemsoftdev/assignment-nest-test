import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Account } from '../common/entities/account.entity.js';
import { Transaction } from '../common/entities/transaction.entity.js';
import { TransactionType } from '../common/enums/transaction-type.enum.js';
import { TransactionStatus } from '../common/enums/transaction-status.enum.js';
import { WebhookService } from '../transactions/webhook.service.js';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account) private accountRepository: Repository<Account>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    private dataSource: DataSource,
    private webhookService: WebhookService,
  ) {}

  async getAccount(userId: string) {
    const account = await this.accountRepository.findOne({
      where: { userId },
    });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  async deposit(userId: string, amount: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const account = await queryRunner.manager.findOne(Account, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!account) throw new NotFoundException('Account not found');

      account.balance = Number(account.balance) + amount;
      await queryRunner.manager.save(account);

      const transaction = queryRunner.manager.create(Transaction, {
        type: TransactionType.DEPOSIT,
        amount,
        status: TransactionStatus.COMPLETED,
        toAccountId: account.id,
        fromAccountId: undefined,
      });
      const savedTransaction = await queryRunner.manager.save(transaction);

      await queryRunner.commitTransaction();

      this.webhookService
        .sendTransactionEvent(savedTransaction)
        .catch(() => {});

      return {
        transaction: savedTransaction,
        balance: account.balance,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async transfer(userId: string, toAccountId: string, amount: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const fromAccount = await queryRunner.manager.findOne(Account, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!fromAccount) throw new NotFoundException('Source account not found');

      if (fromAccount.id === toAccountId) {
        throw new BadRequestException('Cannot transfer to the same account');
      }

      if (Number(fromAccount.balance) < amount) {
        throw new BadRequestException('Insufficient funds');
      }

      const toAccount = await queryRunner.manager.findOne(Account, {
        where: { id: toAccountId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!toAccount)
        throw new NotFoundException('Destination account not found');

      fromAccount.balance = Number(fromAccount.balance) - amount;
      toAccount.balance = Number(toAccount.balance) + amount;

      await queryRunner.manager.save([fromAccount, toAccount]);

      const transaction = queryRunner.manager.create(Transaction, {
        type: TransactionType.TRANSFER,
        amount,
        status: TransactionStatus.COMPLETED,
        fromAccountId: fromAccount.id,
        toAccountId: toAccount.id,
      });
      const savedTransaction = await queryRunner.manager.save(transaction);

      await queryRunner.commitTransaction();

      this.webhookService
        .sendTransactionEvent(savedTransaction)
        .catch(() => {});

      return {
        transaction: savedTransaction,
        balance: fromAccount.balance,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
