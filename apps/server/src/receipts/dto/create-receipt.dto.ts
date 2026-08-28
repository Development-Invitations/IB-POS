import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class ReceiptItemDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;
}

export class CreateReceiptDto {
  @IsString()
  storeId!: string;

  @IsString()
  workstationId!: string;

  @IsString()
  shiftId!: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  // Скидка на весь чек в процентах (кнопки +/-5% на экране "Продажа").
  // Позиционные/акционные скидки из модуля "Скидки и акции" — отдельная, ещё не подключённая к чеку логика.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  discountPercent?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiptItemDto)
  items!: ReceiptItemDto[];
}
