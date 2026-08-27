import { IsString, Length } from 'class-validator';

export class LoginPinDto {
  @IsString()
  organizationId!: string;

  @IsString()
  login!: string;

  @IsString()
  @Length(4, 6)
  pin!: string;
}
