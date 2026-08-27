import { IsNumber, Min } from 'class-validator';

export class CloseShiftDto {
  @IsNumber()
  @Min(0)
  closingCash!: number;
}
