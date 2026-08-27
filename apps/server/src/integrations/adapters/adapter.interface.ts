import { IntegrationProvider } from '@prisma/client';

// Провайдеры фискализации через виртуальную кассу (Этап 5). ONEC (1С) сюда не входит —
// это отдельный протокол синхронизации товаров/остатков, не отправка чеков на фискализацию (Этап 6).
export const FISCAL_PROVIDERS = [
  IntegrationProvider.REGOS,
  IntegrationProvider.EPOS,
  IntegrationProvider.SMARTPOS,
  IntegrationProvider.ARCAGROUP,
  IntegrationProvider.RAHMATPOS,
] as const;

export type FiscalProvider = (typeof FISCAL_PROVIDERS)[number];

export interface FiscalReceiptPayload {
  receiptId: string;
  total: number;
}

export interface AdapterResult {
  success: boolean;
  message?: string;
}

export interface FiscalSendResult extends AdapterResult {
  fiscalId?: string;
}

// Единый интерфейс адаптера виртуальной кассы: connect / testConnection / sendReceipt / getStatus.
export interface IntegrationAdapter {
  connect(config: Record<string, unknown>): Promise<AdapterResult>;
  testConnection(config: Record<string, unknown>): Promise<AdapterResult>;
  sendReceipt(
    config: Record<string, unknown>,
    payload: FiscalReceiptPayload,
  ): Promise<FiscalSendResult>;
  getStatus(config: Record<string, unknown>): Promise<AdapterResult>;
}
