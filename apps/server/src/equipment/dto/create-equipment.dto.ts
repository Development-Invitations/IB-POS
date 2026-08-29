import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { EquipmentKind } from '@prisma/client';

export class CreateEquipmentDto {
  @IsEnum(EquipmentKind)
  kind!: EquipmentKind;

  @IsString()
  @MaxLength(120)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
