import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { parseCsv, toCsv } from '../common/csv';

const CSV_HEADER = [
  'name',
  'sku',
  'barcode',
  'price',
  'cost',
  'unit',
  'category',
  'isActive',
];

// Госкаталог товаров и услуг Узбекистана (ИКПУ/MXIK) — публичный, без авторизации, см.
// tasnif.soliq.uz. Не в исходном ТЗ — по прямому запросу клиента: при приёмке на "Склад"
// штрихкод незнакомого товара пробуется здесь, чтобы не вводить название вручную. Эндпоинт
// не документирован официально (найден разбором фронтенда tasnif.soliq.uz), поэтому падение
// или изменение формата ответа не должно ронять приёмку — lookupBarcode всегда возвращает
// { found: false }, а не бросает исключение.
const TASNIF_SEARCH_URL =
  'https://tasnif.soliq.uz/api/cls-api/mxik/search/by-params';
// Второй, более широкий индекс каталога (elasticsearch, тот же, что использует страница
// "search-deep" на самом сайте) — подключён отдельным резервным запросом, ТОЛЬКО когда точный
// поиск по gtin выше ничего не нашёл. Он делает нечёткий полнотекстовый поиск (совпадение по
// похожим цифрам, а не только по точному штрихкоду), поэтому результаты обязательно
// фильтруются ниже до строгого совпадения internationalCode === штрихкод — иначе можно
// показать приёмщику совсем другой товар с просто похожим на вид кодом.
const TASNIF_ELASTIC_URL = 'https://tasnif.soliq.uz/api/cls-api/elasticsearch/search';

interface TasnifItem {
  mxikCode?: string;
  mxikName?: string;
  brandName?: string;
  attributeName?: string;
  unitName?: string;
  commonUnitName?: string;
}

interface TasnifElasticItem {
  mxikCode?: string;
  name?: string;
  internationalCode?: string;
  unitsName?: string;
}

export interface BarcodeLookupItem {
  mxikCode: string;
  name: string;
  unit?: string;
}

export interface BarcodeLookupResult {
  found: boolean;
  items: BarcodeLookupItem[];
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // Один и тот же штрихкод в госкаталоге нередко зарегистрирован под несколькими разными
  // ИКПУ (разные производители/фасовки/варианты одного и того же GTIN — по прямому запросу
  // клиента: "у товара может быть 1 штрихкод, но примерно 20 товар с разными ИКПУ") — поэтому
  // возвращаем ВСЕ найденные варианты, а не наугад первый: приёмщик выбирает нужный сам.
  async lookupBarcode(barcode: string): Promise<BarcodeLookupResult> {
    const gtin = barcode.trim();
    if (!gtin) return { found: false, items: [] };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const url = `${TASNIF_SEARCH_URL}?gtin=${encodeURIComponent(gtin)}&lang=ru`;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return { found: false, items: [] };

      const json = (await response.json()) as {
        data?: { content?: TasnifItem[] };
      };
      const content = json.data?.content ?? [];

      const items: BarcodeLookupItem[] = [];
      for (const item of content) {
        if (!item.mxikCode) continue;
        const name = item.brandName
          ? [item.brandName, item.attributeName].filter(Boolean).join(', ')
          : item.mxikName;
        if (!name) continue;
        items.push({
          mxikCode: item.mxikCode,
          name,
          unit: item.unitName ?? item.commonUnitName ?? undefined,
        });
      }

      if (items.length > 0) return { found: true, items };
      return await this.lookupBarcodeViaElastic(gtin, controller.signal);
    } catch {
      // Нет сети, таймаут, госсайт лёг или сменил формат ответа — не критично, приёмщик
      // просто вводит название вручную, как и раньше.
      return { found: false, items: [] };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async lookupBarcodeViaElastic(
    gtin: string,
    signal: AbortSignal,
  ): Promise<BarcodeLookupResult> {
    try {
      const url = `${TASNIF_ELASTIC_URL}?lang=ru&search=${encodeURIComponent(gtin)}&page=0&size=20`;
      const response = await fetch(url, { signal });
      if (!response.ok) return { found: false, items: [] };

      const json = (await response.json()) as { data?: TasnifElasticItem[] };
      const items: BarcodeLookupItem[] = [];
      for (const item of json.data ?? []) {
        // Строгая фильтрация — elasticsearch ищет нечётко (по похожим цифрам), а не по
        // точному штрихкоду, см. комментарий у TASNIF_ELASTIC_URL выше.
        if (!item.mxikCode || !item.name || item.internationalCode !== gtin) continue;
        items.push({
          mxikCode: item.mxikCode,
          name: item.name,
          unit: item.unitsName?.trim() || undefined,
        });
      }
      return { found: items.length > 0, items };
    } catch {
      return { found: false, items: [] };
    }
  }

  create(organizationId: string, dto: CreateProductDto) {
    const { expiryDate, ...rest } = dto;
    return this.prisma.product.create({
      data: {
        ...rest,
        organizationId,
        // Prisma ждёт полноценный Date, а не "YYYY-MM-DD" — @IsDateString на DTO пропускает
        // и то, и другое, но с голой строкой Prisma падает "premature end of input".
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      },
    });
  }

  findAll(organizationId: string) {
    return this.prisma.product.findMany({ where: { organizationId } });
  }

  async findOne(organizationId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId },
    });
    if (!product) {
      throw new NotFoundException('Товар не найден');
    }
    return product;
  }

  async update(organizationId: string, id: string, dto: UpdateProductDto) {
    await this.findOne(organizationId, id);
    const { expiryDate, ...rest } = dto;
    return this.prisma.product.update({
      where: { id },
      data: {
        ...rest,
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // Настоящее удаление — не то же самое, что деактивация выше: деактивация прячет товар с
  // "Продажи", но сохраняет историю (чек, где он покупался, должен остаться читаемым); удаление
  // стирает саму запись товара безвозвратно и по прямому запросу клиента нужно для мусора вроде
  // тестовых/ошибочно созданных карточек, а не как замена деактивации в обычной работе.
  // ReceiptItem.product ссылается на Product без onDelete (RESTRICT по умолчанию) — товар,
  // который хоть раз был в чеке, Postgres не даст удалить, и это правильно: историю продаж
  // терять нельзя. Остатки/движения/скидки на товар (Stock/StockMovement/Discount) в схеме
  // настроены на onDelete: Cascade и корректно удалятся вместе с товаром.
  async purge(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    try {
      await this.prisma.product.delete({ where: { id } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new BadRequestException(
          'Нельзя удалить товар — по нему есть история продаж. Используйте деактивацию.',
        );
      }
      throw err;
    }
  }

  async setImage(organizationId: string, id: string, imageUrl: string) {
    const existing = await this.findOne(organizationId, id);
    const updated = await this.prisma.product.update({
      where: { id },
      data: { imageUrl },
    });

    // Старый файл больше не нужен — иначе каждая замена фото копит мёртвые файлы на диске.
    if (existing.imageUrl && existing.imageUrl !== imageUrl) {
      const oldPath = join(process.cwd(), existing.imageUrl.replace(/^\//, ''));
      if (existsSync(oldPath)) {
        unlinkSync(oldPath);
      }
    }

    return updated;
  }

  // Экспорт каталога в CSV (Этап 7 — модуль "Товары": импорт/экспорт).
  async exportCsv(organizationId: string): Promise<string> {
    const products = await this.prisma.product.findMany({
      where: { organizationId },
      include: { category: true },
      orderBy: { name: 'asc' },
    });

    const rows = products.map((p) => [
      p.name,
      p.sku ?? '',
      p.barcode ?? '',
      p.price.toString(),
      p.cost?.toString() ?? '',
      p.unit,
      p.category?.name ?? '',
      p.isActive ? 'true' : 'false',
    ]);

    return toCsv([CSV_HEADER, ...rows]);
  }

  // Импорт из CSV: сопоставление по артикулу (sku), если указан — иначе создаётся новый товар.
  // Категория подставляется/создаётся по названию в рамках организации.
  async importCsv(organizationId: string, csv: string) {
    const rows = parseCsv(csv);
    if (rows.length < 2) {
      return { created: 0, updated: 0 };
    }

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (name: string) => header.indexOf(name);
    const nameIdx = col('name');
    const skuIdx = col('sku');
    const barcodeIdx = col('barcode');
    const priceIdx = col('price');
    const costIdx = col('cost');
    const unitIdx = col('unit');
    const categoryIdx = col('category');

    if (nameIdx === -1 || priceIdx === -1) {
      throw new BadRequestException('В CSV обязательны колонки name и price');
    }

    const categoryCache = new Map<string, string>();
    let created = 0;
    let updated = 0;

    for (const row of rows.slice(1)) {
      const name = row[nameIdx]?.trim();
      const priceRaw = row[priceIdx]?.trim();
      if (!name || !priceRaw) continue;

      const price = Number(priceRaw);
      if (Number.isNaN(price)) continue;

      const costRaw = costIdx !== -1 ? row[costIdx]?.trim() : undefined;
      const cost = costRaw ? Number(costRaw) : undefined;

      const sku = skuIdx !== -1 ? row[skuIdx]?.trim() || undefined : undefined;
      const barcode =
        barcodeIdx !== -1 ? row[barcodeIdx]?.trim() || undefined : undefined;
      const unit =
        unitIdx !== -1 ? row[unitIdx]?.trim() || undefined : undefined;
      const categoryName =
        categoryIdx !== -1 ? row[categoryIdx]?.trim() : undefined;

      let categoryId: string | undefined;
      if (categoryName) {
        const cacheKey = categoryName.toLowerCase();
        categoryId = categoryCache.get(cacheKey);
        if (!categoryId) {
          const category = await this.prisma.category.upsert({
            where: {
              organizationId_externalId: {
                organizationId,
                externalId: `csv:${cacheKey}`,
              },
            },
            create: {
              organizationId,
              name: categoryName,
              externalId: `csv:${cacheKey}`,
            },
            update: { name: categoryName },
          });
          categoryId = category.id;
          categoryCache.set(cacheKey, categoryId);
        }
      }

      const existing = sku
        ? await this.prisma.product.findFirst({
            where: { organizationId, sku },
          })
        : null;

      if (existing) {
        await this.prisma.product.update({
          where: { id: existing.id },
          data: { name, barcode, price, cost, unit, categoryId },
        });
        updated++;
      } else {
        await this.prisma.product.create({
          data: {
            organizationId,
            name,
            sku,
            barcode,
            price,
            cost,
            unit: unit ?? 'pcs',
            categoryId,
          },
        });
        created++;
      }
    }

    return { created, updated };
  }
}
