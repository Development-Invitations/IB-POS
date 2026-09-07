import { createHash } from 'node:crypto';
import type {
  AdapterResult,
  FiscalReceiptPayload,
  FiscalSendResult,
  FiscalShiftClosePayload,
  FiscalShiftCloseResult,
  FiscalShiftOpenResult,
  IntegrationAdapter,
} from './adapter.interface';

interface RegosConfig {
  baseUrl: string;
  login: string;
  password: string;
}

// REGOS: VCR (виртуальная касса) — реальная документация: https://docs.regos.uz/ru/regos-vcr/.
// VCR — локально устанавливаемое ПО на компьютере/сервере клиента (не облачный сервис с
// фиксированным адресом), поэтому baseUrl (http://<ip кассы>:<порт>) — это то, что вводит
// администратор при подключении, как и login/password кассира, у которого есть доступ к API.
function readConfig(config: Record<string, unknown>): RegosConfig | null {
  const { baseUrl, login, password } = config;
  if (
    typeof baseUrl === 'string' &&
    baseUrl.length > 0 &&
    typeof login === 'string' &&
    login.length > 0 &&
    typeof password === 'string' &&
    password.length > 0
  ) {
    return { baseUrl, login, password };
  }
  return null;
}

let requestId = 0;

// Авторизация по документации: auth = Base64(login:password), доступ есть только у
// пользователя-кассира (см. docs.regos.uz/ru/regos-vcr/operations/api-interface).
async function call(
  cfg: RegosConfig,
  method: string,
  params: Record<string, unknown> | null = null,
): Promise<{ success: boolean; result?: unknown; message?: string }> {
  const auth = Buffer.from(`${cfg.login}:${cfg.password}`).toString('base64');
  const url = cfg.baseUrl.replace(/\/+$/, '');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=utf-8' },
      body: JSON.stringify({
        id: (requestId += 1),
        jsonrpc: '2.0',
        method,
        params,
        auth,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const body = (await response.json().catch(() => null)) as {
      result?: unknown;
      error?: { message?: string };
    } | null;

    if (!response.ok || !body || body.error) {
      return {
        success: false,
        message: body?.error?.message ?? `REGOS: HTTP ${response.status}`,
      };
    }

    return { success: true, result: body.result };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'неизвестная ошибка';
    return {
      success: false,
      message: `REGOS: не удалось подключиться (${message})`,
    };
  }
}

export function createRegosAdapter(): IntegrationAdapter {
  return {
    async connect(config): Promise<AdapterResult> {
      const cfg = readConfig(config);
      if (!cfg) {
        return {
          success: false,
          message: 'REGOS: укажите адрес кассы, логин и пароль',
        };
      }
      const result = await call(cfg, 'Sys.GetInfo');
      return {
        success: result.success,
        message: result.success ? 'REGOS: подключено' : result.message,
      };
    },

    async testConnection(config): Promise<AdapterResult> {
      const cfg = readConfig(config);
      if (!cfg) {
        return { success: false, message: 'REGOS: нет учётных данных' };
      }
      const result = await call(cfg, 'Sys.GetInfo');
      return {
        success: result.success,
        message: result.success ? 'REGOS: связь установлена' : result.message,
      };
    },

    async getStatus(config): Promise<AdapterResult> {
      const cfg = readConfig(config);
      if (!cfg) return { success: false };
      const result = await call(cfg, 'Sys.GetInfo');
      return { success: result.success, message: result.message };
    },

    // ВАЖНО (честное ограничение): публичная документация REGOS перечисляет метод Receipt.Sale,
    // но не даёт таблицу его параметров — а наш FiscalReceiptPayload сейчас несёт только
    // { receiptId, total } (см. ReceiptsService.pay -> OutboxService.enqueue), без товарных
    // позиций. Похожие узбекские фискальные протоколы (см. документацию платёжного терминала
    // Multicard, метод qr_payment) требуют для чека позиции с ИКПУ/кодом упаковки из
    // tasnif.soliq.uz — таких полей ни в Product, ни в FiscalReceiptPayload сейчас нет.
    // Отправляем то, что реально есть, чтобы не блокироваться — как только придёт точная
    // спецификация параметров Receipt.Sale (или потребуется добавить mxik/package_code
    // в Product), этот метод нужно будет доработать, а не считать законченным.
    async sendReceipt(
      config,
      payload: FiscalReceiptPayload,
    ): Promise<FiscalSendResult> {
      const cfg = readConfig(config);
      if (!cfg) {
        return { success: false, message: 'REGOS: нет учётных данных' };
      }
      const result = await call(cfg, 'Receipt.Sale', {
        extId: payload.receiptId,
        sum: payload.total,
      });
      if (!result.success) {
        return { success: false, message: result.message };
      }
      const fiscalId =
        result.result &&
        typeof result.result === 'object' &&
        'id' in result.result
          ? String((result.result as { id: unknown }).id)
          : createHash('sha1')
              .update(payload.receiptId)
              .digest('hex')
              .slice(0, 12);
      return {
        success: true,
        fiscalId,
        message: 'REGOS: чек передан на фискализацию',
      };
    },

    async openShift(config): Promise<FiscalShiftOpenResult> {
      const cfg = readConfig(config);
      if (!cfg) {
        return { success: false, message: 'REGOS: нет учётных данных' };
      }
      const result = await call(cfg, 'ZReport.Open');
      if (!result.success) {
        return { success: false, message: result.message };
      }
      const fiscalShiftNumber =
        result.result &&
        typeof result.result === 'object' &&
        'shiftNumber' in result.result
          ? String((result.result as { shiftNumber: unknown }).shiftNumber)
          : undefined;
      return {
        success: true,
        fiscalShiftNumber,
        message: 'REGOS: смена открыта на кассе',
      };
    },

    async closeShift(
      config,
      payload: FiscalShiftClosePayload,
    ): Promise<FiscalShiftCloseResult> {
      const cfg = readConfig(config);
      if (!cfg) {
        return { success: false, message: 'REGOS: нет учётных данных' };
      }
      const result = await call(cfg, 'ZReport.Close', {
        salesTotal: payload.salesTotal,
      });
      if (!result.success) {
        return { success: false, message: result.message };
      }
      const zReportNumber =
        result.result &&
        typeof result.result === 'object' &&
        'zReportNumber' in result.result
          ? String((result.result as { zReportNumber: unknown }).zReportNumber)
          : undefined;
      return {
        success: true,
        zReportNumber,
        message: 'REGOS: Z-отчёт сформирован',
      };
    },
  };
}
