import { IsOptional, IsString } from 'class-validator';

export class CreateStoreDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  address?: string;
}
