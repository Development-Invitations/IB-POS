import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional, IsString, ValidateIf } from 'class-validator';
import { CreateEquipmentDto } from './create-equipment.dto';

// isActive добавлено напрямую, а не только через PartialType(CreateEquipmentDto) — тот же
// класс бага, что уже находили в Products/Discounts: PartialType не переносит поля, которых
// нет в CreateDto, а глобальный ValidationPipe({ whitelist: true }) тихо вырезает isActive
// из тела запроса, если явно не объявить его здесь.
export class UpdateEquipmentDto extends PartialType(CreateEquipmentDto) {
  // Переопределено поверх унаследованного из CreateEquipmentDto — там оно строго @IsString()
  // (не принимает null), а здесь нужно явно принять null, чтобы можно было "открепить"
  // оборудование от кассы обратно в общее (см. EquipmentFormModal.tsx — пункт "Общее").
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  workstationId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isConnected?: boolean;
}
