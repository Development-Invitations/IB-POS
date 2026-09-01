import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { BusinessType } from '@prisma/client';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  defaultLanguage?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxRatePercent?: number;

  @IsOptional()
  @IsBoolean()
  autoBackupEnabled?: boolean;

  // Не из исходного ТЗ — по прямому запросу клиента: профиль бизнеса меняет поведение экрана
  // "Продажа" (см. ProductGrid.tsx на клиенте) и в будущем — других разделов под конкретную
  // отрасль (общепит/розница/аптека).
  @IsOptional()
  @IsEnum(BusinessType)
  businessType?: BusinessType;

  // Раздел 3 ТЗ: Кассир применяет ручную скидку "в рамках лимита" — null снимает
  // ограничение явно (не то же самое, что "не передано").
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  maxCashierDiscountPercent?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lowStockThreshold?: number | null;

  // Не из исходного ТЗ — заполняет вкладку "Продажа": кнопки быстрых сумм наличными в
  // PaymentModal.tsx. Пустой массив — кнопки выключены, только ручной ввод, как было раньше.
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Min(1, { each: true })
  quickCashAmounts?: number[];
}
