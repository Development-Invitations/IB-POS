import type {
  AdapterResult,
  FiscalReceiptPayload,
  FiscalSendResult,
  FiscalShiftCloseResult,
  FiscalShiftOpenResult,
  IntegrationAdapter,
} from './adapter.interface';

interface EposConfig {
  baseUrl: string;
  token: string;
  companyName?: string;
  companyAddress?: string;
  companyInn?: string;
}

// Epos "Universal Communicator" — реальная документация: Postman-коллекция клиента
// (https://documenter.getpostman.com/view/33048620/2sB34ZsQHg). Коммуникатор — локальное
// ПО на компьютере кассы, слушает фиксированный путь /uzpos на порту по умолчанию 8347;
// baseUrl вводится администратором целиком (http://<ip кассы>:8347/uzpos), т.к. порт/адрес
// зависят от конкретной установки. Авторизация — не HTTP-заголовок, а поле token в самом
// теле запроса; метод операции — тоже поле в теле (method), единая точка входа, как у Regos.
function readConfig(config: Record<string, unknown>): EposConfig | null {
  const { baseUrl, token, companyName, companyAddress, companyInn } = config;
  if (
    typeof baseUrl === 'string' &&
    baseUrl.length > 0 &&
    typeof token === 'string' &&
    token.length > 0
  ) {
    return {
      baseUrl,
      token,
      companyName: typeof companyName === 'string' ? companyName : undefined,
      companyAddress:
        typeof companyAddress === 'string' ? companyAddress : undefined,
      companyInn: typeof companyInn === 'string' ? companyInn : undefined,
    };
  }
  return null;
}

// Формат ответа не единый JSON-RPC, как у Regos, а простой { error: boolean, message } —
// message бывает и строкой (описание ошибки), и объектом (данные при успехе некоторых методов).
async function call(
  cfg: EposConfig,
  method: string,
  extra: Record<string, unknown> = {},
): Promise<{
  success: boolean;
  body?: Record<string, unknown>;
  message?: string;
}> {
  try {
    const response = await fetch(cfg.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: cfg.token, method, ...extra }),
      signal: AbortSignal.timeout(10_000),
    });

    const body = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!response.ok || !body) {
      return { success: false, message: `EPOS: HTTP ${response.status}` };
    }
    if (body.error) {
      const message =
        typeof body.message === 'string'
          ? body.message
          : 'ошибка коммуникатора';
      return { success: false, message: `EPOS: ${message}` };
    }
    return { success: true, body };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'неизвестная ошибка';
    return {
      success: false,
      message: `EPOS: не удалось подключиться (${message})`,
    };
  }
}

export function createEposAdapter(): IntegrationAdapter {
  return {
    async connect(config): Promise<AdapterResult> {
      const cfg = readConfig(config);
      if (!cfg) {
        return {
          success: false,
          message: 'EPOS: укажите адрес коммуникатора и токен',
        };
      }
      const result = await call(cfg, 'checkStatus');
      return {
        success: result.success,
        message: result.success ? 'EPOS: подключено' : result.message,
      };
    },

    async testConnection(config): Promise<AdapterResult> {
      const cfg = readConfig(config);
      if (!cfg) {
        return { success: false, message: 'EPOS: нет учётных данных' };
      }
      const result = await call(cfg, 'checkStatus');
      return {
        success: result.success,
        message: result.success ? 'EPOS: связь установлена' : result.message,
      };
    },

    async getStatus(config): Promise<AdapterResult> {
      const cfg = readConfig(config);
      if (!cfg) return { success: false };
      const result = await call(cfg, 'checkStatus');
      return { success: result.success, message: result.message };
    },

    // ВАЖНО (честное ограничение, серьёзнее, чем у Regos): документация Epos прямо требует
    // в params.items[] реальные ИКПУ (classCode) и код упаковки (packageCode) из
    // tasnif.soliq.uz на каждую позицию чека — коммуникатор проверяет их у себя в базе и
    // отклоняет чек, если код не найден ("Коды ИКПУ с указанными значениями не найдены в базе
    // данных"). У нас в Product таких полей нет вообще, а FiscalReceiptPayload несёт только
    // { receiptId, total } без позиций — реальных названий/цен товаров тоже нет.
    // Ниже — рабочая, полностью соответствующая протоколу отправка (адрес/token/sale-vs-refund/
    // openZreport/closeZreport все настоящие), но с одной синтетической позицией на всю сумму
    // чека без classCode/packageCode — коммуникатор её гарантированно отклонит с понятной
    // ошибкой (fail-safe: он проверяет код у себя, а не молча принимает чек с неверными
    // налоговыми данными). Чтобы sendReceipt реально заработал, нужно завести classCode/
    // packageCode/vatPercent на Product и прокинуть реальные позиции чека в FiscalReceiptPayload.
    async sendReceipt(
      config,
      payload: FiscalReceiptPayload,
    ): Promise<FiscalSendResult> {
      const cfg = readConfig(config);
      if (!cfg) {
        return { success: false, message: 'EPOS: нет учётных данных' };
      }
      const method = payload.kind === 'return' ? 'refund' : 'sale';
      const result = await call(cfg, method, {
        companyName: cfg.companyName ?? '',
        companyAddress: cfg.companyAddress ?? '',
        companyINN: cfg.companyInn ?? '',
        params: {
          items: [
            {
              price: payload.total,
              discount: 0,
              barcode: '',
              amount: 1000,
              vatPercent: 0,
              vat: 0,
              name: `Чек ${payload.receiptId}`,
              classCode: '',
              packageCode: '',
              other: 0,
            },
          ],
        },
      });
      if (!result.success) {
        return { success: false, message: result.message };
      }
      const fiscalSign =
        result.body &&
        typeof result.body.message === 'object' &&
        result.body.message !== null
          ? String(
              (result.body.message as { fiscalSign?: unknown }).fiscalSign ??
                '',
            )
          : undefined;
      return {
        success: true,
        fiscalId: fiscalSign || undefined,
        message:
          payload.kind === 'return'
            ? 'EPOS: возврат передан на фискализацию'
            : 'EPOS: чек передан на фискализацию',
      };
    },

    async openShift(config): Promise<FiscalShiftOpenResult> {
      const cfg = readConfig(config);
      if (!cfg) {
        return { success: false, message: 'EPOS: нет учётных данных' };
      }
      const result = await call(cfg, 'openZreport');
      if (!result.success) {
        return { success: false, message: result.message };
      }
      return { success: true, message: 'EPOS: смена открыта на кассе' };
    },

    // closeZreport по документации Epos не принимает сумму продаж за смену — второй параметр
    // интерфейса (payload) здесь не нужен, TypeScript допускает реализацию с меньшим числом
    // параметров, чем в объявлении интерфейса.
    async closeShift(config): Promise<FiscalShiftCloseResult> {
      const cfg = readConfig(config);
      if (!cfg) {
        return { success: false, message: 'EPOS: нет учётных данных' };
      }
      const result = await call(cfg, 'closeZreport');
      if (!result.success) {
        return { success: false, message: result.message };
      }
      return { success: true, message: 'EPOS: Z-отчёт сформирован' };
    },
  };
}
