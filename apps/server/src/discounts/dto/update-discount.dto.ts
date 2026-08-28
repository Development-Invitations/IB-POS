import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateDiscountDto } from './create-discount.dto';

export class UpdateDiscountDto extends PartialType(CreateDiscountDto) {
  // Тот же пробел, что был у UpdateProductDto: PartialType не включает isActive,
  // без него деактивированную скидку нельзя было бы включить обратно.
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
