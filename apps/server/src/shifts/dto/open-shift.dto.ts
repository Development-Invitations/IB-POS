import { IsNumber, IsString, Min } from 'class-validator';

export class OpenShiftDto {
  @IsString()
  storeId!: string;

  @IsString()
  workstationId!: string;

  @IsNumber()
  @Min(0)
  openingCash!: number;
}
