import { IntegrationProvider } from '@prisma/client';

// Провайдеры фискализации через виртуальную кассу (Этап 5). ONEC (1С) сюда не входит —
// это отдельный протокол синхронизации товаров/остатков, не отправка чеков на фискализацию (Этап 6).
// SMARTPOS убран из списка 2026-09-07: документация, присланная под этим названием, оказалась
// на казахстанский платёжный терминал Kaspi Pay Smart POS (приём карт/QR, без фискального чека
// с ИКПУ) — не то же самое, что подразумевала карточка «SmartPOS» в «Интеграции». Значение
// SMARTPOS оставлено в enum IntegrationProvider (schema.prisma) специально — просто больше не
// используется, чтобы не гонять миграцию, удаляющую enum-значение, ради ещё не подключённого
// провайдера.
export const FISCAL_PROVIDERS = [
  IntegrationProvider.REGOS,
  IntegrationProvider.EPOS,
  IntegrationProvider.ARCAGROUP,
  IntegrationProvider.RAHMATPOS,
  IntegrationProvider.SMARTBIZNES,
] as const;

export type FiscalProvider = (typeof FISCAL_PROVIDERS)[number];

// kind различает продажу и возврат — реальным кассам (Regos: Receipt.Sale/Receipt.Refund,
// Epos: sale/refund) нужен разный метод API, это не просто разный текст в сообщении.
export interface FiscalReceiptPayload {
  receiptId: string;
  total: number;
  kind: 'sale' | 'return';
}

export interface AdapterResult {
  success: boolean;
  message?: string;
}

export interface FiscalSendResult extends AdapterResult {
  fiscalId?: string;
}

export interface FiscalShiftOpenResult extends AdapterResult {
  fiscalShiftNumber?: string;
}

export interface FiscalShiftClosePayload {
  salesTotal: number;
}

export interface FiscalShiftCloseResult extends AdapterResult {
  zReportNumber?: string;
}

// Единый интерфейс адаптера виртуальной кассы: connect / testConnection / sendReceipt / getStatus /
// openShift / closeShift. X/Z-отчёты — обязательная часть фискального цикла смены (открытие смены на
// регистраторе перед первым чеком, Z-отчёт с обнулением счётчиков при закрытии), отдельная операция
// от отправки самих чеков через sendReceipt.
export interface IntegrationAdapter {
  connect(config: Record<string, unknown>): Promise<AdapterResult>;
  testConnection(config: Record<string, unknown>): Promise<AdapterResult>;
  sendReceipt(
    config: Record<string, unknown>,
    payload: FiscalReceiptPayload,
  ): Promise<FiscalSendResult>;
  getStatus(config: Record<string, unknown>): Promise<AdapterResult>;
  openShift(config: Record<string, unknown>): Promise<FiscalShiftOpenResult>;
  closeShift(
    config: Record<string, unknown>,
    payload: FiscalShiftClosePayload,
  ): Promise<FiscalShiftCloseResult>;
}
