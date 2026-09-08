import { IsArray, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ReceiveStockDto {
  @IsString()
  storeId!: string;

  @IsString()
  productId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @IsString()
  comment?: string;

  // Не из исходного ТЗ — по прямому запросу клиента: коды маркировки, отсканированные по одному
  // на физическую единицу при приёмке в режиме "Приём по штрихкоду и маркировке" (см.
  // OrganizationSettings.receivingMode). Длина не обязана совпадать с quantity — сервер это не
  // валидирует, источник истины по количеству остаётся quantity.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  markingCodes?: string[];
}
