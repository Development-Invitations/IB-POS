import { Injectable, Logger } from '@nestjs/common';
import {
  IntegrationProvider,
  ReceiptStatus,
  ShiftStatus,
  StockMovementType,
} from '@prisma/client';
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

    // Не из исходного ТЗ — по прямому запросу клиента: 1С — источник истины по остаткам,
    // при каждом обмене перезаписывает то, что в IB-POS (не суммирует, не сравнивает — именно
    // перезаписывает). offers.xml в базовом режиме не разбивает количество по складам, поэтому
    // применяем только когда у организации ровно один склад — иначе непонятно, в какой из
    // нескольких точек продаж писать чужое общее число, и мы его осознанно не трогаем совсем
    // (остаток остаётся таким, каким его ведёт сам IB-POS, до появления разбивки по складам
    // на стороне 1С).
    const stores = await this.prisma.store.findMany({
      where: { organizationId },
    });
    const singleStoreId = stores.length === 1 ? stores[0].id : null;
    let quantityApplied = 0;

    for (const offer of offers) {
      const data: { price?: number } = {};
      if (offer.price !== undefined) data.price = offer.price;
      if (Object.keys(data).length > 0) {
        await this.prisma.product.updateMany({
          where: { organizationId, externalId: offer.externalId },
          data,
        });
      }

      if (offer.quantity === undefined || !singleStoreId) continue;
      const product = await this.prisma.product.findUnique({
        where: {
          organizationId_externalId: {
            organizationId,
            externalId: offer.externalId,
          },
        },
      });
      if (!product) continue;

      const existing = await this.prisma.stock.findUnique({
        where: {
          storeId_productId: { storeId: singleStoreId, productId: product.id },
        },
      });
      const delta = offer.quantity - Number(existing?.quantity ?? 0);

      const stock = await this.prisma.stock.upsert({
        where: {
          storeId_productId: { storeId: singleStoreId, productId: product.id },
        },
        create: {
          storeId: singleStoreId,
          productId: product.id,
          quantity: offer.quantity,
        },
        update: { quantity: offer.quantity },
      });
      if (delta !== 0) {
        await this.prisma.stockMovement.create({
          data: {
            stockId: stock.id,
            type: StockMovementType.ADJUSTMENT,
            quantityDelta: delta,
            comment: 'Остаток из 1С (обмен через сайт)',
          },
        });
      }
      quantityApplied++;
    }

    this.logger.log(
      `1С: импортированы предложения — ${offers.length}` +
        (singleStoreId
          ? `, остаток применён к ${quantityApplied} товарам`
          : stores.length === 0
            ? ' (склад не найден — остаток не применялся)'
            : ` (складов ${stores.length} — остаток не применялся, offers.xml не различает склад)`),
    );
  }

  // Направление IB-POS -> 1С: три вида документов, ещё не выгруженных — поступления по складу,
  // отчёты о розничных продажах по закрытым сменам, возвраты от покупателей. Раньше здесь был
  // один упрощённый документ на каждый чек ("Приход"/"Возврат") — не настоящая схема 1С и без
  // прихода на склад вообще. Точные теги ("Товар"/"Контрагент" и т.п.) — общий формат
  // "Документ" из протокола "Обмен через сайт"; какая именно 1С-конфигурация как их
  // интерпретирует ("Приход" vs "Оприходование", например) — уточняется на внедрении.
  async buildExportDocuments(organizationId: string): Promise<{ xml: string }> {
    const [receiptDocs, salesReportDocs, returnDocs] = await Promise.all([
      this.buildGoodsReceiptDocuments(organizationId),
      this.buildRetailSalesReportDocuments(organizationId),
      this.buildReturnDocuments(organizationId),
    ]);

    const documents = [...receiptDocs, ...salesReportDocs, ...returnDocs].join(
      '\n',
    );
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<КоммерческаяИнформация ВерсияСхемы="2.10" ДатаФормирования="${new Date().toISOString()}">
${documents}
</КоммерческаяИнформация>`;

    return { xml };
  }

  // "Поступление товаров и услуг" — по одному документу на партию (поставщик + дата), а не на
  // каждое отдельное нажатие "Оприходовать" на Складе: так это выглядит и в реальной накладной.
  // ЦенаЗаЕдиницу берётся из Product.cost (себестоимость на момент выгрузки) — IB-POS не хранит
  // закупочную цену отдельно по каждой приёмке, только текущую себестоимость товара; это
  // известное упрощение, а не то же самое, что цена именно в этой накладной у поставщика.
  private async buildGoodsReceiptDocuments(
    organizationId: string,
  ): Promise<string[]> {
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        type: StockMovementType.RECEIPT_IN,
        exportedToOneCAt: null,
        stock: { store: { organizationId } },
      },
      include: { stock: { include: { product: true } }, supplier: true },
      take: 500,
      orderBy: { createdAt: 'asc' },
    });
    if (movements.length === 0) return [];

    await this.prisma.stockMovement.updateMany({
      where: { id: { in: movements.map((m) => m.id) } },
      data: { exportPendingAt: new Date() },
    });

    const groups = new Map<string, typeof movements>();
    for (const m of movements) {
      const dateKey = m.createdAt.toISOString().slice(0, 10);
      const key = `${m.supplierId ?? 'none'}:${dateKey}`;
      const list = groups.get(key) ?? [];
      list.push(m);
      groups.set(key, list);
    }

    return [...groups.entries()].map(([key, group]) => {
      const supplier = group[0].supplier;
      const date = group[0].createdAt;
      let total = 0;
      const items = group
        .map((m) => {
          const product = m.stock.product;
          const price = product.cost ? Number(product.cost) : 0;
          const qty = Number(m.quantityDelta);
          total += price * qty;
          return `      <Товар>
        <Ид>${escapeXml(product.externalId ?? product.id)}</Ид>
        <Наименование>${escapeXml(product.name)}</Наименование>
        <Количество>${qty}</Количество>
        <ЦенаЗаЕдиницу>${price}</ЦенаЗаЕдиницу>
        <Сумма>${(price * qty).toFixed(2)}</Сумма>
      </Товар>`;
        })
        .join('\n');

      const contragent = supplier
        ? `      <Контрагенты>
        <Контрагент>
          <Ид>${escapeXml(supplier.externalId ?? supplier.id)}</Ид>
          <Наименование>${escapeXml(supplier.name)}</Наименование>
        </Контрагент>
      </Контрагенты>\n`
        : '';

      return `    <Документ>
      <Ид>receipt-${escapeXml(key)}</Ид>
      <ХозОперация>Поступление товаров и услуг</ХозОперация>
      <Дата>${date.toISOString().slice(0, 10)}</Дата>
      <Время>${date.toISOString().slice(11, 19)}</Время>
${contragent}      <Сумма>${total.toFixed(2)}</Сумма>
      <Товары>
${items}
      </Товары>
    </Документ>`;
    });
  }

  // "Отчет о розничных продажах" — по одному документу на закрытую смену (как реальный
  // Z-отчёт), а не на каждый чек: сотни отдельных документов в день для розницы нестандартно и
  // неудобно бухгалтеру. Открытые смены не выгружаются — набор чеков в них ещё может измениться.
  private async buildRetailSalesReportDocuments(
    organizationId: string,
  ): Promise<string[]> {
    const shifts = await this.prisma.shift.findMany({
      where: {
        status: ShiftStatus.CLOSED,
        store: { organizationId },
        receipts: {
          some: { status: ReceiptStatus.PAID, exportedToOneCAt: null },
        },
      },
      include: {
        receipts: {
          where: { status: ReceiptStatus.PAID, exportedToOneCAt: null },
          include: { items: { include: { product: true } } },
        },
      },
      take: 50,
      orderBy: { closedAt: 'asc' },
    });
    if (shifts.length === 0) return [];

    await this.prisma.receipt.updateMany({
      where: { id: { in: shifts.flatMap((s) => s.receipts.map((r) => r.id)) } },
      data: { exportPendingAt: new Date() },
    });

    return shifts.map((shift) => {
      const items = shift.receipts
        .flatMap((r) => r.items)
        .map(
          (item) => `      <Товар>
        <Ид>${escapeXml(item.product.externalId ?? item.productId)}</Ид>
        <Наименование>${escapeXml(item.product.name)}</Наименование>
        <Количество>${item.quantity}</Количество>
        <ЦенаЗаЕдиницу>${item.price}</ЦенаЗаЕдиницу>
        <Сумма>${(Number(item.price) * Number(item.quantity)).toFixed(2)}</Сумма>
      </Товар>`,
        )
        .join('\n');
      const total = shift.receipts.reduce((sum, r) => sum + Number(r.total), 0);
      const closedAt = shift.closedAt ?? shift.openedAt;

      return `    <Документ>
      <Ид>shift-${escapeXml(shift.id)}</Ид>
      <ХозОперация>Отчет о розничных продажах</ХозОперация>
      <Дата>${closedAt.toISOString().slice(0, 10)}</Дата>
      <Время>${closedAt.toISOString().slice(11, 19)}</Время>
      <Сумма>${total.toFixed(2)}</Сумма>
      <Товары>
${items}
      </Товары>
    </Документ>`;
    });
  }

  // "Возврат товаров от покупателя" — по одному документу на чек-возврат, как и раньше:
  // возвраты, в отличие от продаж, происходят не пачками, отдельный документ на каждый уместен.
  private async buildReturnDocuments(
    organizationId: string,
  ): Promise<string[]> {
    const receipts = await this.prisma.receipt.findMany({
      where: {
        status: ReceiptStatus.RETURNED,
        exportedToOneCAt: null,
        store: { organizationId },
      },
      include: { items: { include: { product: true } } },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
    if (receipts.length === 0) return [];

    await this.prisma.receipt.updateMany({
      where: { id: { in: receipts.map((r) => r.id) } },
      data: { exportPendingAt: new Date() },
    });

    return receipts.map((r) => {
      const items = r.items
        .map(
          (item) => `      <Товар>
        <Ид>${escapeXml(item.product.externalId ?? item.productId)}</Ид>
        <Наименование>${escapeXml(item.product.name)}</Наименование>
        <Количество>${item.quantity}</Количество>
        <ЦенаЗаЕдиницу>${item.price}</ЦенаЗаЕдиницу>
        <Сумма>${(Number(item.price) * Number(item.quantity)).toFixed(2)}</Сумма>
      </Товар>`,
        )
        .join('\n');

      return `    <Документ>
      <Ид>${escapeXml(r.id)}</Ид>
      <ХозОперация>Возврат товаров от покупателя</ХозОперация>
      <Дата>${r.createdAt.toISOString().slice(0, 10)}</Дата>
      <Время>${r.createdAt.toISOString().slice(11, 19)}</Время>
      <Сумма>${r.total}</Сумма>
      <Товары>
${items}
      </Товары>
    </Документ>`;
    });
  }

  async confirmExport(organizationId: string): Promise<void> {
    const [receiptResult, movementResult] = await Promise.all([
      this.prisma.receipt.updateMany({
        where: { exportPendingAt: { not: null }, store: { organizationId } },
        data: { exportedToOneCAt: new Date(), exportPendingAt: null },
      }),
      this.prisma.stockMovement.updateMany({
        where: {
          exportPendingAt: { not: null },
          stock: { store: { organizationId } },
        },
        data: { exportedToOneCAt: new Date(), exportPendingAt: null },
      }),
    ]);
    const total = receiptResult.count + movementResult.count;
    if (total > 0) {
      this.logger.log(
        `1С: подтверждена выгрузка — чеков ${receiptResult.count}, движений склада ${movementResult.count}`,
      );
    }
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
