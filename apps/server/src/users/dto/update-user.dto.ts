import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';

// isActive явно, а не только через PartialType(CreateUserDto) — тот же класс бага, что уже
// находили в Products/Discounts/Equipment: PartialType не переносит поля, которых нет в
// CreateDto, а глобальный ValidationPipe({ whitelist: true }) тихо вырезает isActive из тела
// запроса, если явно не объявить его здесь.
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @Length(4, 6)
  pin?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  // Не из исходного ТЗ — доступно и Бухгалтеру (см. Roles на UsersController.update и
  // проверку в UsersService.update, которая для Бухгалтера пропускает только это поле).
  @IsOptional()
  @IsNumber()
  @Min(0)
  salary?: number;
}
