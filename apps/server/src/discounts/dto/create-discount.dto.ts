import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { DiscountType, Role } from '@prisma/client';

export class CreateDiscountDto {
  @IsString()
  name!: string;

  @IsEnum(DiscountType)
  type!: DiscountType;

  @IsNumber()
  @Min(0)
  value!: number;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsEnum(Role)
  minRole?: Role;
}
