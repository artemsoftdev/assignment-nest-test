import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Transaction } from '../common/entities/transaction.entity.js';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly webhookUrl: string;

  constructor(private configService: ConfigService) {
    this.webhookUrl = this.configService.get<string>('WEBHOOK_URL') || '';
  }

  async sendTransactionEvent(transaction: Transaction): Promise<void> {
    if (!this.webhookUrl) {
      this.logger.warn('Webhook URL not configured, skipping notification');
      return;
    }

    try {
      await axios.post(this.webhookUrl, {
        event: 'transaction',
        data: {
          id: transaction.id,
          type: transaction.type,
          amount: transaction.amount,
          status: transaction.status,
          fromAccountId: transaction.fromAccountId,
          toAccountId: transaction.toAccountId,
          createdAt: transaction.createdAt,
        },
      });
      this.logger.log(`Webhook sent for transaction ${transaction.id}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Webhook failed for transaction ${transaction.id}: ${message}`,
      );
    }
  }
}
