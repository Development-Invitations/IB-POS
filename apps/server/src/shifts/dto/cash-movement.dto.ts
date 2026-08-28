import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { CashMovementType } from '@prisma/client';

export class CashMovementDto {
  @IsEnum(CashMovementType)
  type!: CashMovementType;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
