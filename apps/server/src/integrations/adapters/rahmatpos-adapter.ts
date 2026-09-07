import { createHmac } from 'node:crypto';
import type {
  AdapterResult,
  FiscalSendResult,
  FiscalShiftCloseResult,
  FiscalShiftOpenResult,
  IntegrationAdapter,
} from './adapter.interface';

interface RahmatPosConfig {
  baseUrl: string;
  secretKey: string;
}

function readConfig(config: Record<string, unknown>): RahmatPosConfig | null {
  const { baseUrl, secretKey } = config;
  if (
    typeof baseUrl === 'string' &&
    baseUrl.length > 0 &&
    typeof secretKey === 'string' &&
    secretKey.length > 0
  ) {
    return { baseUrl, secretKey };
  }
  return null;
}

// RahmatPOS — документация клиента ("Интеграция через HTTP API" v1.1): базовый URL
// http://<terminal_ip>:<port>, авторизация подписью в заголовках X-Timestamp/X-Signature.
// signature = HMAC_SHA256(body + timestamp, secret_key) — кодировка результата (hex/base64)
// в документации не указана явно, взят hex как самый распространённый вариант для такого
// рода заголовков; нужно свериться на реальном терминале при первом реальном подключении.
function sign(secretKey: string, body: string, timestamp: number): string {
  return createHmac('sha256', secretKey)
    .update(body + timestamp)
    .digest('hex');
}

async function call(
  cfg: RahmatPosConfig,
  path: string,
  body: Record<string, unknown>,
): Promise<{
  success: boolean;
  body?: Record<string, unknown>;
  message?: string;
}> {
  const timestamp = Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify(body);
  const signature = sign(cfg.secretKey, rawBody, timestamp);
  const url = cfg.baseUrl.replace(/\/+$/, '') + path;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Timestamp': String(timestamp),
        'X-Signature': signature,
      },
      body: rawBody,
      signal: AbortSignal.timeout(10_000),
    });

    const parsed = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!response.ok || !parsed) {
      return { success: false, message: `RAHMATPOS: HTTP ${response.status}` };
    }
    if (parsed.success === false) {
      const desc =
        typeof parsed.desc_ru === 'string'
          ? parsed.desc_ru
          : 'ошибка терминала';
      return { success: false, message: `RAHMATPOS: ${desc}` };
    }
    return { success: true, body: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'неизвестная ошибка';
    return {
      success: false,
      message: `RAHMATPOS: не удалось подключиться (${message})`,
    };
  }
}

export function createRahmatPosAdapter(): IntegrationAdapter {
  return {
    // ВАЖНО: в документации нет отдельного ping/status/info-метода без побочных эффектов —
    // единственный кандидат на "проверку подключения" это /reconciliation (сверка итогов):
    // тело пустое, и по смыслу это операция чтения текущих итогов терминала, а не оплата —
    // в отличие от /pay, /qr_payment и т.п. она не показывает ничего покупателю и не двигает
    // деньги. Используем её и для connect/testConnection — заодно это реально проверяет, что
    // secret_key верный (подпись), а не просто "хост отвечает на пинг".
    async connect(config): Promise<AdapterResult> {
      const cfg = readConfig(config);
      if (!cfg) {
        return {
          success: false,
          message: 'RAHMATPOS: укажите адрес терминала и secret_key',
        };
      }
      const result = await call(cfg, '/reconciliation', {});
      return {
        success: result.success,
        message: result.success ? 'RAHMATPOS: подключено' : result.message,
      };
    },

    async testConnection(config): Promise<AdapterResult> {
      const cfg = readConfig(config);
      if (!cfg) {
        return { success: false, message: 'RAHMATPOS: нет учётных данных' };
      }
      const result = await call(cfg, '/reconciliation', {});
      return {
        success: result.success,
        message: result.success
          ? 'RAHMATPOS: связь установлена'
          : result.message,
      };
    },

    async getStatus(config): Promise<AdapterResult> {
      const cfg = readConfig(config);
      if (!cfg) return { success: false };
      const result = await call(cfg, '/reconciliation', {});
      return { success: result.success, message: result.message };
    },

    // ВАЖНО (архитектурное несоответствие, не просто нехватка данных, как у Regos/Epos):
    // /qr_payment в этом API не "уведомляет кассу об уже оплаченном чеке", а реально
    // ЗАПУСКАЕТ приём оплаты — показывает QR покупателю и ждёт скан. У нас FiscalizationService
    // вызывает sendReceipt асинхронно, из фоновой очереди, уже ПОСЛЕ того как чек оплачен
    // (наличными/картой через другой канал) — покупателя может уже не быть у кассы. Дёргать
    // этот метод отсюда значит либо ничего не зафискализирует, либо (хуже) попытается второй
    // раз получить деньги с покупателя. Поэтому фискализация через RahmatPOS в текущем виде
    // не реализована — честно возвращаем понятную ошибку вместо того, чтобы притворяться,
    // что чек ушёл на фискализацию. Чтобы это реально заработало, RahmatPOS нужно подключать
    // как способ оплаты прямо в PaymentModal (как Click/Payme), а не как фоновую фискализацию.
    async sendReceipt(): Promise<FiscalSendResult> {
      return {
        success: false,
        message:
          'RAHMATPOS: фискализация постфактум не поддерживается этим терминалом — оплата и чек оформляются вместе через сам терминал (см. Roadmap_TZ.md)',
      };
    },

    // В документации RahmatPOS нет понятия открытия/закрытия смены (Z-отчёта) — терминал
    // работает по транзакциям, а не по кассовым сменам. Честно возвращаем "не поддерживается";
    // ShiftsService открывает/закрывает смену локально независимо от результата (офлайн-first).
    async openShift(): Promise<FiscalShiftOpenResult> {
      return {
        success: false,
        message:
          'RAHMATPOS: понятие смены/Z-отчёта не документировано для этого терминала',
      };
    },

    async closeShift(): Promise<FiscalShiftCloseResult> {
      return {
        success: false,
        message:
          'RAHMATPOS: понятие смены/Z-отчёта не документировано для этого терминала',
      };
    },
  };
}
