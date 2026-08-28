import { Injectable, Logger } from '@nestjs/common';
import { ReceiptStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseClassifierAndCatalog, parseOffers } from './commerceml-parser';

const FILE_LIMIT_BYTES = 10 * 1024 * 1024; // 10 МБ на файл — разумный лимит для "базового режима"

// Пока экспортируем сюда цифры одним числом за товар, без разбивки по характеристикам/складам —
// это и есть "базовый режим" из ТЗ. Единица, артикул, серии и т.п. учитываются частично.
@Injectable()
export class OneCService {
  private readonly logger = new Logger(OneCService.name);

  // Буфер загруженных файлов до вызова mode=import (протокол шлёт файл и импорт отдельными запросами).
  // Держим в памяти процесса — переживает один сеанс обмена, не переживает рестарт сервера;
  // для базового режима этого достаточно, при росте нагрузки можно вынести в Redis/файловую систему.
  private readonly fileBuffers = new Map<string, Buffer>();
  // Ид чеков, отданных на последнем mode=query, до подтверждения mode=success.
  private readonly pendingExportBatches = new Map<string, string[]>();

  constructor(private readonly prisma: PrismaService) {}

  getInitResponse(): string {
    return `zip=no\nfile_limit=${FILE_LIMIT_BYTES}`;
  }

  saveFile(organizationId: string, filename: string, content: Buffer) {
    this.fileBuffers.set(`${organizationId}:${filename}`, content);
  }

  async importFile(organizationId: string, filename: string): Promise<void> {
    const key = `${organizationId}:${filename}`;
    const content = this.fileBuffers.get(key);
    if (!content) {
      throw new Error(
        `Файл ${filename} не загружен (нет предшествующего mode=file)`,
      );
    }
    this.fileBuffers.delete(key);

    const xml = content.toString('utf8');
    if (filename.toLowerCase().includes('offers')) {
      await this.importOffers(organizationId, xml);
    } else {
      await this.importCatalog(organizationId, xml);
    }
  }

  private async importCatalog(organizationId: string, xml: string) {
    const { groups, products } = parseClassifierAndCatalog(xml);

    for (const group of groups) {
      await this.prisma.category.upsert({
        where: {
          organizationId_externalId: {
            organizationId,
            externalId: group.externalId,
          },
        },
        create: {
          organizationId,
          externalId: group.externalId,
          name: group.name,
        },
        update: { name: group.name },
      });
    }

    for (const product of products) {
      const category = product.groupExternalId
        ? await this.prisma.category.findUnique({
            where: {
              organizationId_externalId: {
                organizationId,
                externalId: product.groupExternalId,
              },
            },
          })
        : null;

      await this.prisma.product.upsert({
        where: {
          organizationId_externalId: {
            organizationId,
            externalId: product.externalId,
          },
        },
        create: {
          organizationId,
          externalId: product.externalId,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          unit: product.unit ?? 'pcs',
          categoryId: category?.id,
          price: 0, // цена придёт отдельным файлом offers.xml
        },
        update: {
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          categoryId: category?.id ?? undefined,
        },
      });
    }

    this.logger.log(
      `1С: импортирован каталог — групп ${groups.length}, товаров ${products.length}`,
    );
  }

  private async importOffers(organizationId: string, xml: string) {
    const offers = parseOffers(xml);

    for (const offer of offers) {
      if (offer.price === undefined) continue;
      await this.prisma.product.updateMany({
        where: { organizationId, externalId: offer.externalId },
        data: { price: offer.price },
      });
      // Остатки по конкретному складу offers.xml обычно не различает без доп. настройки —
      // в базовом режиме количество не привязываем к конкретной точке продаж.
    }

    this.logger.log(
      `1С: импортированы цены/остатки — предложений ${offers.length}`,
    );
  }

  // Направление IB-POS -> 1С: свод продаж и возвратов, ещё не выгруженных.
  // Формат "Документ" — упрощённый CommerceML-подобный свод: точная схема согласуется
  // на внедрении под конкретную конфигурацию клиента (см. ТЗ — экран сопоставления полей).
  async buildSalesDocument(
    organizationId: string,
  ): Promise<{ xml: string; receiptIds: string[] }> {
    const receipts = await this.prisma.receipt.findMany({
      where: {
        exportedToOneCAt: null,
        status: { in: [ReceiptStatus.PAID, ReceiptStatus.RETURNED] },
        store: { organizationId },
      },
      include: { items: { include: { product: true } } },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });

    this.pendingExportBatches.set(
      organizationId,
      receipts.map((r) => r.id),
    );

    const documents = receipts
      .map((r) => {
        const items = r.items
          .map(
            (item) => `      <Товар>
        <Ид>${escapeXml(item.product.externalId ?? item.productId)}</Ид>
        <Наименование>${escapeXml(item.product.name)}</Наименование>
        <Количество>${item.quantity}</Количество>
        <Цена>${item.price}</Цена>
        <Сумма>${(Number(item.price) * Number(item.quantity)).toFixed(2)}</Сумма>
      </Товар>`,
          )
          .join('\n');

        return `    <Документ>
      <Ид>${escapeXml(r.id)}</Ид>
      <ХозОперация>${r.status === ReceiptStatus.RETURNED ? 'Возврат товаров от покупателя' : 'Приход'}</ХозОперация>
      <Дата>${r.createdAt.toISOString().slice(0, 10)}</Дата>
      <Время>${r.createdAt.toISOString().slice(11, 19)}</Время>
      <Сумма>${r.total}</Сумма>
      <Товары>
${items}
      </Товары>
    </Документ>`;
      })
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<КоммерческаяИнформация ВерсияСхемы="2.10" ДатаФормирования="${new Date().toISOString()}">
${documents}
</КоммерческаяИнформация>`;

    return {
      xml,
      receiptIds: receipts.map((r) => r.id),
    };
  }

  async confirmExport(organizationId: string): Promise<void> {
    const receiptIds = this.pendingExportBatches.get(organizationId) ?? [];
    if (receiptIds.length === 0) return;

    await this.prisma.receipt.updateMany({
      where: { id: { in: receiptIds } },
      data: { exportedToOneCAt: new Date() },
    });
    this.pendingExportBatches.delete(organizationId);
    this.logger.log(`1С: подтверждена выгрузка ${receiptIds.length} чеков`);
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
