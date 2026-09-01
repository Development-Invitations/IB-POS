import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

class ReturnReceiptItemDto {
  @IsString()
  receiptItemId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;
}

// Не из исходного ТЗ — по прямому запросу клиента: возврат отдельных позиций чека, а не только
// целиком. items не передан — возвращаем весь чек целиком (прежнее поведение, обратная
// совместимость с быстрым возвратом последнего чека на экране «Продажа»).
export class ReturnReceiptDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnReceiptItemDto)
  items?: ReturnReceiptItemDto[];
}
