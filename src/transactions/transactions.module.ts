import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionsService } from './transactions.service.js';
import { TransactionsController } from './transactions.controller.js';
import { WebhookService } from './webhook.service.js';
import { Transaction } from '../common/entities/transaction.entity.js';
import { Account } from '../common/entities/account.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, Account])],
  controllers: [TransactionsController],
  providers: [TransactionsService, WebhookService],
  exports: [WebhookService],
})
export class TransactionsModule {}
