import { Injectable, Logger } from '@nestjs/common';
import { IntegrationProvider, ReceiptStatus } from '@prisma/client';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { parseClassifierAndCatalog, parseOffers } from './commerceml-parser';

const FILE_LIMIT_BYTES = 10 * 1024 * 1024; // 10 МБ на файл — разумный лимит для "базового режима"

// Не под uploads/ — та папка отдаётся наружу статикой (см. main.ts useStaticAssets), а тут
// сырые файлы каталога/цен от 1С клиента, светить их по предсказуемому публичному URL нельзя.
const BUFFER_DIR = join(process.cwd(), 'onec-buffer');
if (!existsSync(BUFFER_DIR)) {
  mkdirSync(BUFFER_DIR, { recursive: true });
}

// Пока экспортируем сюда цифры одним числом за товар, без разбивки по характеристикам/складам —
// это и есть "базовый режим" из ТЗ. Единица, артикул, серии и т.п. учитываются частично.
@Injectable()
export class OneCService {
  private readonly logger = new Logger(OneCService.name);

  constructor(private readonly prisma: PrismaService) {}

  getInitResponse(): string {
    return `zip=no\nfile_limit=${FILE_LIMIT_BYTES}`;
  }

  // Вызывается на каждый входящий запрос от 1С (см. OneCController.exchange), независимо от
  // type/mode — сам факт обращения с верной Basic Auth уже подтверждает, что 1С реально здесь
  // была, в отличие от Integration.updatedAt, который двигается и от простой генерации токена.
  async touchLastSync(organizationId: string): Promise<void> {
    await this.prisma.integration.updateMany({
      where: { organizationId, provider: IntegrationProvider.ONEC },
      data: { lastSyncAt: new Date() },
    });
  }

  // Буфер загруженных файлов до вызова mode=import (протокол шлёт файл и импорт отдельными
  // запросами) — раньше держали в памяти процесса, терялось при рестарте сервера посреди
  // обмена. На диске (не в БД — файлы каталога могут быть на несколько МБ, гонять их через
  // Postgres лишнее) переживает рестарт, 1С в следующей сессии просто повторит mode=file.
  async saveFile(
    organizationId: string,
    filename: string,
    content: Buffer,
  ): Promise<void> {
    await mkdir(join(BUFFER_DIR, organizationId), { recursive: true });
    await writeFile(this.bufferPath(organizationId, filename), content);
  }

  async importFile(organizationId: string, filename: string): Promise<void> {
    const path = this.bufferPath(organizationId, filename);
    let content: Buffer;
    try {
      content = await readFile(path);
    } catch {
      throw new Error(
        `Файл ${filename} не загружен (нет предшествующего mode=file)`,
      );
    }
    await rm(path, { force: true });

    const xml = content.toString('utf8');
    if (filename.toLowerCase().includes('offers')) {
      await this.importOffers(organizationId, xml);
    } else {
      await this.importCatalog(organizationId, xml);
    }
  }

  // filename приходит от 1С как query-параметр — не доверяем ему буквально при сборке пути на
  // диске (обход через "../" иначе мог бы читать/писать за пределами BUFFER_DIR). Оставляем
  // только базовое имя файла, без разделителей директорий.
  private bufferPath(organizationId: string, filename: string): string {
    const safeName = filename.replace(/[/\\]/g, '_');
    return join(BUFFER_DIR, organizationId, safeName);
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

    // Не из исходного ТЗ: раньше id чеков в этой партии держали в памяти процесса до
    // mode=success — терялось при рестарте сервера, и confirmExport не знал бы, что
    // подтверждать. exportPendingAt на самих чеках переживает рестарт: 1С в следующей сессии
    // просто получит тот же набор ещё раз (запрос выше и так исключает только exportedToOneCAt,
    // не exportPendingAt) — протокол это ожидает, mode=query идемпотентен, пока нет success.
    if (receipts.length > 0) {
      await this.prisma.receipt.updateMany({
        where: { id: { in: receipts.map((r) => r.id) } },
        data: { exportPendingAt: new Date() },
      });
    }

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
    const { count } = await this.prisma.receipt.updateMany({
      where: { exportPendingAt: { not: null }, store: { organizationId } },
      data: { exportedToOneCAt: new Date(), exportPendingAt: null },
    });
    if (count > 0) {
      this.logger.log(`1С: подтверждена выгрузка ${count} чеков`);
    }
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
