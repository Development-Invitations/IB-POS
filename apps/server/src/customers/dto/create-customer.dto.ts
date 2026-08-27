import { IsOptional, IsString } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  fullName!: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
