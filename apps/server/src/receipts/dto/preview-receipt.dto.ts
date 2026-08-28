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

class PreviewReceiptItemDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;
}

export class PreviewReceiptDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  discountPercent?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PreviewReceiptItemDto)
  items!: PreviewReceiptItemDto[];
}
