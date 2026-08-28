import { IsNumber, IsOptional, IsString } from 'class-validator';

export class AdjustBonusDto {
  // Может быть отрицательным — списание бонусов при оплате ими же.
  @IsNumber()
  delta!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
