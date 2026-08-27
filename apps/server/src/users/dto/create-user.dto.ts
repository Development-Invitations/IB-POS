import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @IsString()
  fullName!: string;

  @IsString()
  login!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsString()
  @Length(4, 6)
  pin?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
