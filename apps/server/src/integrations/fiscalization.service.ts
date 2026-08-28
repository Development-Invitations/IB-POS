import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OutboxStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  FISCAL_PROVIDERS,
  type FiscalReceiptPayload,
} from './adapters/adapter.interface';
import { getAdapter, isFiscalProvider } from './adapters/registry';

const MAX_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 10_000;
const BATCH_SIZE = 20;

// Очередь с ретраями: событие пишется в outbox не в момент создания чека, а в момент его
// оплаты/возврата (см. ReceiptsService.pay/returnReceipt) — на фискальный регистратор должна
// уходить только завершённая продажа, а не то, что кассир ещё набирает в корзину.
// Работает независимо от сети: событие остаётся PENDING, воркер подбирает его при следующем тике.
// Нет подключённой кассы у организации — событие просто ждёт своей очереди, это не ошибка.
@Injectable()
export class FiscalizationService {
  private readonly logger = new Logger(FiscalizationService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  @Interval(POLL_INTERVAL_MS)
  async handleInterval() {
    await this.processPending();
  }

  async processPending(): Promise<number> {
    if (this.running) return 0;
    this.running = true;

    try {
      const events = await this.prisma.outboxEvent.findMany({
        where: {
          eventType: { in: ['receipt.paid', 'receipt.returned'] },
          status: OutboxStatus.PENDING,
          attempts: { lt: MAX_ATTEMPTS },
        },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
      });

      let processed = 0;
      for (const event of events) {
        const integration = await this.prisma.integration.findFirst({
          where: {
            organizationId: event.organizationId,
            isConnected: true,
            provider: { in: [...FISCAL_PROVIDERS] },
          },
        });

        if (!integration || !isFiscalProvider(integration.provider)) {
          continue; // нет подключённой кассы — ждём, это не ошибка
        }

        const adapter = getAdapter(integration.provider);
        const payload = event.payload as unknown as FiscalReceiptPayload;
        const config = (integration.config as Record<string, unknown>) ?? {};

        const result = await adapter.sendReceipt(config, payload);
        processed++;

        if (result.success) {
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: { status: OutboxStatus.SENT, sentAt: new Date() },
          });
        } else {
          const attempts = event.attempts + 1;
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              attempts,
              lastError: result.message ?? 'Ошибка отправки',
              status:
                attempts >= MAX_ATTEMPTS
                  ? OutboxStatus.FAILED
                  : OutboxStatus.PENDING,
            },
          });
          this.logger.warn(
            `Фискализация ${event.id} не удалась (попытка ${attempts}): ${result.message}`,
          );
        }
      }

      return processed;
    } finally {
      this.running = false;
    }
  }
}
