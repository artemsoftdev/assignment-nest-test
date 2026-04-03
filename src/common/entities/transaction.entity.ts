import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Account } from './account.entity.js';
import { TransactionStatus } from '../enums/transaction-status.enum.js';
import { TransactionType } from '../enums/transaction-type.enum.js';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.COMPLETED,
  })
  status: TransactionStatus;

  @ManyToOne(() => Account, (account) => account.outgoingTransactions, {
    nullable: true,
  })
  @JoinColumn({ name: 'fromAccountId' })
  fromAccount: Account;

  @Column({ nullable: true })
  fromAccountId: string;

  @ManyToOne(() => Account, (account) => account.incomingTransactions)
  @JoinColumn({ name: 'toAccountId' })
  toAccount: Account;

  @Column()
  toAccountId: string;

  @CreateDateColumn()
  createdAt: Date;
}
