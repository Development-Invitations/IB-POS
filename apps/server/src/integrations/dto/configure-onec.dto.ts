import { IsOptional, IsString, MinLength } from 'class-validator';

export class ConfigureOneCDto {
  @IsOptional()
  @IsString()
  login?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  token?: string;
}
