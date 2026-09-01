import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  // Не из исходного ТЗ — актуально для профиля "Аптека" (см. BusinessType), но поле не
  // привязано к нему жёстко: у любого товара может быть срок годности.
  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}
