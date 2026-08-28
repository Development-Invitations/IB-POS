import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AdjustStockDto {
  @IsString()
  storeId!: string;

  @IsString()
  productId!: string;

  @IsNumber()
  @Min(0)
  newQuantity!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
