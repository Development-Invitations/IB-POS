import { Type } from 'class-transformer';
import { IsString, MinLength, ValidateNested } from 'class-validator';

class CreateOrganizationAdminDto {
  @IsString()
  fullName!: string;

  @IsString()
  login!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class CreateOrganizationDto {
  @IsString()
  name!: string;

  @ValidateNested()
  @Type(() => CreateOrganizationAdminDto)
  admin!: CreateOrganizationAdminDto;
}
