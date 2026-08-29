import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateEquipmentDto } from './create-equipment.dto';

// isActive добавлено напрямую, а не только через PartialType(CreateEquipmentDto) — тот же
// класс бага, что уже находили в Products/Discounts: PartialType не переносит поля, которых
// нет в CreateDto, а глобальный ValidationPipe({ whitelist: true }) тихо вырезает isActive
// из тела запроса, если явно не объявить его здесь.
export class UpdateEquipmentDto extends PartialType(CreateEquipmentDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isConnected?: boolean;
}
