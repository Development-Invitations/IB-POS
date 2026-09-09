import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { EquipmentKind } from '@prisma/client';

export class CreateEquipmentDto {
  // Не из исходного ТЗ — по прямому запросу клиента: закрепление оборудования за конкретной
  // кассой, см. schema.prisma Equipment.workstationId. Не указано — общее, видно на всех кассах.
  @IsOptional()
  @IsString()
  workstationId?: string;

  @IsEnum(EquipmentKind)
  kind!: EquipmentKind;

  @IsString()
  @MaxLength(120)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  connectionInfo?: string;
}
