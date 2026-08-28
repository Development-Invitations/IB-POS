import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  // Не в CreateProductDto: новый товар всегда создаётся активным, а деактивация/
  // реактивация — отдельное действие поверх уже существующего товара (см. также
  // ProductsService.remove(), который выставляет isActive: false тем же способом).
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
