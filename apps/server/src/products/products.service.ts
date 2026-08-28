import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { parseCsv, toCsv } from './csv';

const CSV_HEADER = [
  'name',
  'sku',
  'barcode',
  'price',
  'unit',
  'category',
  'isActive',
];

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  create(organizationId: string, dto: CreateProductDto) {
    return this.prisma.product.create({ data: { ...dto, organizationId } });
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
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
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
          data: { name, barcode, price, unit, categoryId },
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
