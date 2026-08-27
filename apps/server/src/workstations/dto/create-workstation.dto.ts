import { IsString } from 'class-validator';

export class CreateWorkstationDto {
  @IsString()
  storeId!: string;

  @IsString()
  name!: string;
}
