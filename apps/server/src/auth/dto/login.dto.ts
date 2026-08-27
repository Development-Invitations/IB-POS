import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  organizationId!: string;

  @IsString()
  login!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
