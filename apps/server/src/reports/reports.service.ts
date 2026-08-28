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

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // Dashboard: продажи/чеки/средний чек/прибыль + график по часам (Этап 8).
  async getDashboard(organizationId: string, filter: PeriodFilter) {
    const { from, to } = resolvePeriod(filter);

    const receipts = await this.prisma.receipt.findMany({
      where: {
        status: ReceiptStatus.PAID,
        createdAt: { gte: from, lte: to },
        store: {
          organizationId,
          ...(filter.storeId ? { id: filter.storeId } : {}),
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
      period: { from, to },
      totalSales,
      receiptsCount,
      averageCheck,
      profit,
      profitDataIncomplete: hasIncompleteCostData,
      salesByHour,
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
}
