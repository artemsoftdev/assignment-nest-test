import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class TransferDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Recipient account ID',
  })
  @IsUUID()
  toAccountId: string;

  @ApiProperty({ example: 50.0, description: 'Amount to transfer' })
  @IsNumber()
  @IsPositive()
  amount: number;
}
