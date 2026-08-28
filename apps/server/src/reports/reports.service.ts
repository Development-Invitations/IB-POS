import { Injectable } from '@nestjs/common';
import { ReceiptStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toCsv } from '../common/csv';

interface PeriodFilter {
  from?: string;
  to?: string;
  storeId?: string;
}

function resolvePeriod(filter: PeriodFilter) {
  const to = filter.to ? new Date(filter.to) : new Date();
  const from = filter.from
    ? new Date(filter.from)
    : new Date(to.getTime() - 24 * 60 * 60 * 1000);
  // Границы дня целиком, если передана только дата без времени.
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

// null — раньше не было данных для сравнения (не 0%, честно "нет базы для сравнения"),
// показывается на клиенте как "—" вместо вводящих в заблуждение "+100%"/"-100%".
function percentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private async computePeriodStats(
    organizationId: string,
    from: Date,
    to: Date,
    storeId?: string,
  ) {
    const receipts = await this.prisma.receipt.findMany({
      where: {
        status: ReceiptStatus.PAID,
        createdAt: { gte: from, lte: to },
        store: {
          organizationId,
          ...(storeId ? { id: storeId } : {}),
        },
      },
      include: { items: true },
    });

    const totalSales = receipts.reduce((sum, r) => sum + Number(r.total), 0);
    const receiptsCount = receipts.length;
    const averageCheck = receiptsCount > 0 ? totalSales / receiptsCount : 0;

    let profit = 0;
    let hasIncompleteCostData = false;
    for (const receipt of receipts) {
      for (const item of receipt.items) {
        if (item.cost === null) {
          hasIncompleteCostData = true;
          continue;
        }
        profit +=
          (Number(item.price) - Number(item.cost)) * Number(item.quantity);
      }
    }

    const salesByHour = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      total: 0,
    }));
    for (const receipt of receipts) {
      const hour = receipt.createdAt.getHours();
      salesByHour[hour].total += Number(receipt.total);
    }

    return {
      totalSales,
      receiptsCount,
      averageCheck,
      profit,
      profitDataIncomplete: hasIncompleteCostData,
      salesByHour,
    };
  }

  // Dashboard: продажи/чеки/средний чек/прибыль + график по часам (Этап 8) + сравнение
  // с предыдущим периодом той же длины (Дополнение — "аналитика" из макета, Панель 7).
  async getDashboard(organizationId: string, filter: PeriodFilter) {
    const { from, to } = resolvePeriod(filter);
    const durationMs = to.getTime() - from.getTime();
    const previousTo = new Date(from.getTime() - 1);
    const previousFrom = new Date(previousTo.getTime() - durationMs);

    const [current, previous] = await Promise.all([
      this.computePeriodStats(organizationId, from, to, filter.storeId),
      this.computePeriodStats(
        organizationId,
        previousFrom,
        previousTo,
        filter.storeId,
      ),
    ]);

    return {
      period: { from, to },
      ...current,
      changeVsPrevious: {
        totalSales: percentChange(current.totalSales, previous.totalSales),
        receiptsCount: percentChange(
          current.receiptsCount,
          previous.receiptsCount,
        ),
        averageCheck: percentChange(
          current.averageCheck,
          previous.averageCheck,
        ),
        profit: percentChange(current.profit, previous.profit),
      },
    };
  }

  // Экспорт чеков за период в CSV (Этап 8 — "экспорт Excel/CSV").
  async exportCsv(
    organizationId: string,
    filter: PeriodFilter,
  ): Promise<string> {
    const { from, to } = resolvePeriod(filter);

    const receipts = await this.prisma.receipt.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        store: {
          organizationId,
          ...(filter.storeId ? { id: filter.storeId } : {}),
        },
      },
      include: { payments: true, store: true },
      orderBy: { createdAt: 'asc' },
    });

    const header = ['date', 'store', 'status', 'total', 'paymentMethods'];
    const rows = receipts.map((r) => [
      r.createdAt.toISOString(),
      r.store.name,
      r.status,
      r.total.toString(),
      r.payments.map((p) => p.method).join('/'),
    ]);

    return toCsv([header, ...rows]);
  }

  // Остатки по товарам (Этап 8/Раздел 3 — доступ Зав. складом: "только по товарам/остаткам").
  async getStockReport(organizationId: string, storeId?: string) {
    return this.prisma.stock.findMany({
      where: {
        product: { organizationId },
        ...(storeId ? { storeId } : {}),
      },
      include: { product: true, store: true },
      orderBy: { product: { name: 'asc' } },
    });
  }

  // Топ товаров по продажам за период (Дополнение — вкладка "Товары" в аналитике).
  async getTopProducts(organizationId: string, filter: PeriodFilter) {
    const { from, to } = resolvePeriod(filter);

    const items = await this.prisma.receiptItem.findMany({
      where: {
        receipt: {
          status: ReceiptStatus.PAID,
          createdAt: { gte: from, lte: to },
          store: {
            organizationId,
            ...(filter.storeId ? { id: filter.storeId } : {}),
          },
        },
      },
      select: { productId: true, quantity: true, price: true },
    });

    const byProduct = new Map<string, { quantity: number; revenue: number }>();
    for (const item of items) {
      const entry = byProduct.get(item.productId) ?? {
        quantity: 0,
        revenue: 0,
      };
      entry.quantity += Number(item.quantity);
      entry.revenue += Number(item.quantity) * Number(item.price);
      byProduct.set(item.productId, entry);
    }

    const productIds = [...byProduct.keys()];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, unit: true },
    });
    const nameById = new Map(products.map((p) => [p.id, p]));

    return [...byProduct.entries()]
      .map(([productId, stats]) => ({
        productId,
        name: nameById.get(productId)?.name ?? productId,
        unit: nameById.get(productId)?.unit ?? '',
        quantity: stats.quantity,
        revenue: stats.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20);
  }
}
