import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ReceiveStockDto {
  @IsString()
  storeId!: string;

  @IsString()
  productId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
