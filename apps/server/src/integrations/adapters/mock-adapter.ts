import type { IntegrationProvider } from '@prisma/client';
import type {
  AdapterResult,
  FiscalReceiptPayload,
  FiscalSendResult,
  IntegrationAdapter,
} from './adapter.interface';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasCredentials(config: Record<string, unknown>): boolean {
  return (
    typeof config.login === 'string' &&
    config.login.length > 0 &&
    typeof config.token === 'string' &&
    config.token.length > 0
  );
}

// Настоящих API/SDK этих касс (Regos, Epos, SmartPos, ArcaGroup, RahmatPos) у нас нет —
// у каждого клиента будет своя касса и свои учётные данные, протокол выбирается на внедрении
// (см. ТЗ Этап 5). До тех пор — честная симуляция по общему контракту IntegrationAdapter:
// проверяем наличие логина/токена в конфиге, а "отправку чека" эмулируем с задержкой,
// чтобы можно было разрабатывать и тестировать очередь синка уже сейчас.
export function createMockAdapter(
  provider: IntegrationProvider,
): IntegrationAdapter {
  return {
    async connect(config): Promise<AdapterResult> {
      await delay(300);
      if (!hasCredentials(config)) {
        return {
          success: false,
          message: `${provider}: укажите login и token`,
        };
      }
      return { success: true, message: `${provider}: подключено (симуляция)` };
    },

    async testConnection(config): Promise<AdapterResult> {
      await delay(300);
      if (!hasCredentials(config)) {
        return { success: false, message: `${provider}: нет учётных данных` };
      }
      return {
        success: true,
        message: `${provider}: связь установлена (симуляция)`,
      };
    },

    async sendReceipt(
      config,
      payload: FiscalReceiptPayload,
    ): Promise<FiscalSendResult> {
      await delay(500);
      if (!hasCredentials(config)) {
        return { success: false, message: `${provider}: нет учётных данных` };
      }
      return {
        success: true,
        fiscalId: `${provider}-${payload.receiptId.slice(0, 8)}`,
        message: `${provider}: чек передан на фискализацию (симуляция)`,
      };
    },

    async getStatus(config): Promise<AdapterResult> {
      await delay(100);
      return { success: hasCredentials(config) };
    },
  };
}
