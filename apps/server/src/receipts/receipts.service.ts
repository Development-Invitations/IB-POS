import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, ReceiptStatus, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { AuditService } from '../audit/audit.service';
import { StockService } from '../stock/stock.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { PayReceiptDto } from './dto/pay-receipt.dto';

// Скидки из модуля «Скидки и акции» применяются автоматически при создании чека — сервер
// сам решает, что применимо (не доверяя клиенту), в отличие от ручного discountPercent
// (кнопки +/-5% на экране «Продажа»), который остаётся честным клиентским оверрайдом кассира.
// minRole — это не иерархия ролей вообще, а порог именно для экрана «Продажа»: кассир видит
// только скидки с minRole=CASHIER, управляющий/админ — вообще все (см. Раздел 3 ТЗ: кассир
// «применяет в рамках лимита», управляющий/админ полным доступом).
const SALE_ROLE_RANK: Partial<Record<Role, number>> = {
  [Role.CASHIER]: 0,
  [Role.MANAGER]: 1,
  [Role.ADMIN]: 1,
};

function isDiscountAllowedForRole(
  minRole: Role,
  requestingRole: Role,
): boolean {
  const requestingRank = SALE_ROLE_RANK[requestingRole] ?? 1;
  const minRank = SALE_ROLE_RANK[minRole] ?? 0;
  return requestingRank >= minRank;
}

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly stock: StockService,
  ) {}

  // Общая логика расчёта скидок для create() и preview() — вынесена отдельно, чтобы кассир
  // видел на экране «Продажа» ДО оплаты те же цифры, что сервер реально спишет при создании
  // чека (иначе PaymentModal показывал бы сумму без учёта авто-скидок из «Скидки и акции»).
  private async calculateTotals(
    organizationId: string,
    requestingRole: Role,
    items: { productId: string; quantity: number }[],
    discountPercent: number | undefined,
  ) {
    const productIds = items.map((item) => item.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, organizationId },
    });
    if (products.length !== new Set(productIds).size) {
      throw new BadRequestException('Один или несколько товаров не найдены');
    }

    const priceById = new Map(products.map((p) => [p.id, p.price]));
    const costById = new Map(products.map((p) => [p.id, p.cost]));
    const categoryById = new Map(products.map((p) => [p.id, p.categoryId]));
    const subtotal = items.reduce(
      (sum, item) =>
        sum + Number(priceById.get(item.productId)) * item.quantity,
      0,
    );

    const categoryIds = [
      ...new Set(
        products.map((p) => p.categoryId).filter((id): id is string => !!id),
      ),
    ];
    const activeDiscounts = await this.prisma.discount.findMany({
      where: {
        organizationId,
        isActive: true,
        OR: [
          { productId: { in: productIds } },
          { categoryId: { in: categoryIds } },
          { AND: [{ productId: null }, { categoryId: null }] },
        ],
      },
    });
    const allowedDiscounts = activeDiscounts.filter((d) =>
      isDiscountAllowedForRole(d.minRole, requestingRole),
    );

    // Для каждой позиции чека — лучшая (максимальная по сумме) применимая скидка на товар
    // или на его категорию; скидки не суммируются между собой на одной позиции.
    let lineDiscountTotal = 0;
    for (const item of items) {
      const lineTotal = Number(priceById.get(item.productId)) * item.quantity;
      const categoryId = categoryById.get(item.productId) ?? null;
      const candidates = allowedDiscounts.filter(
        (d) =>
          d.productId === item.productId ||
          (d.categoryId && d.categoryId === categoryId),
      );
      const bestAmount = candidates.reduce((best, d) => {
        const amount =
          d.type === 'PERCENT'
            ? (lineTotal * Number(d.value)) / 100
            : Math.min(Number(d.value), lineTotal);
        return Math.max(best, amount);
      }, 0);
      lineDiscountTotal += bestAmount;
    }

    // Скидки на весь чек (без привязки к товару/категории) — берём одну лучшую, применяем
    // к остатку после позиционных скидок, чтобы не давать двойного вычета с одной и той же суммы.
    const afterLineDiscounts = subtotal - lineDiscountTotal;
    const receiptWideCandidates = allowedDiscounts.filter(
      (d) => !d.productId && !d.categoryId,
    );
    const receiptWideDiscount = receiptWideCandidates.reduce((best, d) => {
      const amount =
        d.type === 'PERCENT'
          ? (afterLineDiscounts * Number(d.value)) / 100
          : Math.min(Number(d.value), afterLineDiscounts);
      return Math.max(best, amount);
    }, 0);

    const afterAutoDiscounts = afterLineDiscounts - receiptWideDiscount;
    const autoDiscountTotal = Math.round(
      lineDiscountTotal + receiptWideDiscount,
    );

    // Раздел 3 ТЗ: Кассир применяет ручную скидку "в рамках лимита" — не доверяем клиенту,
    // тот же принцип, что и для авто-скидок выше. Управляющий/Админ лимитом не ограничены.
    let effectiveDiscountPercent = discountPercent ?? 0;
    if (requestingRole === Role.CASHIER) {
      const settings = await this.prisma.organizationSettings.findUnique({
        where: { organizationId },
      });
      if (settings?.maxCashierDiscountPercent != null) {
        effectiveDiscountPercent = Math.min(
          effectiveDiscountPercent,
          settings.maxCashierDiscountPercent,
        );
      }
    }

    const manualDiscountAmount = Math.round(
      (afterAutoDiscounts * effectiveDiscountPercent) / 100,
    );
    const discountTotal = autoDiscountTotal + manualDiscountAmount;
    const total = subtotal - discountTotal;

    return {
      priceById,
      costById,
      subtotal,
      autoDiscountTotal,
      manualDiscountAmount,
      discountTotal,
      total,
    };
  }

  async preview(
    organizationId: string,
    requestingRole: Role,
    items: { productId: string; quantity: number }[],
    discountPercent: number | undefined,
  ) {
    const {
      subtotal,
      autoDiscountTotal,
      manualDiscountAmount,
      discountTotal,
      total,
    } = await this.calculateTotals(
      organizationId,
      requestingRole,
      items,
      discountPercent,
    );
    return {
      subtotal,
      autoDiscountTotal,
      manualDiscountAmount,
      discountTotal,
      total,
    };
  }

  async create(
    organizationId: string,
    requestingRole: Role,
    dto: CreateReceiptDto,
  ) {
    const shift = await this.prisma.shift.findFirst({
      where: {
        id: dto.shiftId,
        storeId: dto.storeId,
        workstationId: dto.workstationId,
      },
    });
    if (!shift) {
      throw new NotFoundException('Смена не найдена');
    }

    const { priceById, costById, discountTotal, total } =
      await this.calculateTotals(
        organizationId,
        requestingRole,
        dto.items,
        dto.discountPercent,
      );

    // Чек создаётся открытым (OPEN) без записи в очередь фискализации — на фискальный
    // регистратор/кассу уходит только фактически оплаченная продажа, см. pay() ниже.
    // Себестоимость снимается в момент продажи (как и цена) — см. ReceiptItem.cost.
    return this.prisma.receipt.create({
      data: {
        storeId: dto.storeId,
        workstationId: dto.workstationId,
        shiftId: dto.shiftId,
        customerId: dto.customerId,
        total,
        discountTotal,
        items: {
          create: dto.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: priceById.get(item.productId)!,
            cost: costById.get(item.productId) ?? undefined,
          })),
        },
      },
      include: { items: true },
    });
  }

  async findAll(
    organizationId: string,
    filter: {
      storeId?: string;
      status?: string;
      from?: string;
      to?: string;
      search?: string;
    },
  ) {
    const validStatuses = Object.values(ReceiptStatus) as string[];
    const status = validStatuses.includes(filter.status ?? '')
      ? (filter.status as ReceiptStatus)
      : undefined;

    const to = filter.to ? new Date(filter.to) : new Date();
    const from = filter.from
      ? new Date(filter.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    to.setHours(23, 59, 59, 999);

    return this.prisma.receipt.findMany({
      where: {
        store: {
          organizationId,
          ...(filter.storeId ? { id: filter.storeId } : {}),
        },
        createdAt: { gte: from, lte: to },
        ...(status ? { status } : {}),
        ...(filter.search
          ? {
              OR: [
                { id: { startsWith: filter.search, mode: 'insensitive' } },
                {
                  customer: {
                    fullName: { contains: filter.search, mode: 'insensitive' },
                  },
                },
                { customer: { phone: { contains: filter.search } } },
              ],
            }
          : {}),
      },
      include: { items: true, payments: true, customer: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  findOne(organizationId: string, id: string) {
    return this.prisma.receipt.findFirstOrThrow({
      where: { id, store: { organizationId } },
      include: { items: true, payments: true },
    });
  }

  async pay(
    organizationId: string,
    userId: string,
    id: string,
    dto: PayReceiptDto,
  ) {
    const receipt = await this.prisma.receipt.findFirst({
      where: { id, store: { organizationId } },
    });
    if (!receipt) {
      throw new NotFoundException('Чек не найден');
    }
    if (receipt.status !== ReceiptStatus.OPEN) {
      throw new BadRequestException('Чек уже оплачен, возвращён или отменён');
    }

    // Сумма строк оплаты должна ровно совпадать с суммой чека: для наличных клиент
    // сам считает сдачу (см. apps/client PaymentModal) и присылает сюда только ту часть,
    // что реально идёт в оплату — иначе сдача задвоилась бы как выручка в отчёте смены.
    const paidSum = dto.payments.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(paidSum - Number(receipt.total)) > 0.01) {
      throw new BadRequestException(
        'Сумма оплаты должна совпадать с суммой чека',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.payment.createMany({
        data: dto.payments.map((p) => ({
          receiptId: id,
          method: p.method,
          amount: p.amount,
        })),
      });

      const updated = await tx.receipt.update({
        where: { id },
        data: { status: ReceiptStatus.PAID },
        include: { items: true, payments: true },
      });

      // Списываем остаток по каждой позиции в той же транзакции, что и оплата.
      for (const item of updated.items) {
        await this.stock.applyMovement(
          tx,
          updated.storeId,
          item.productId,
          -Number(item.quantity),
          StockMovementType.SALE,
          userId,
        );
      }

      // Пишется в той же транзакции, что и оплата — при отсутствии сети чек остаётся
      // оплаченным локально, а событие остаётся в очереди PENDING до синка (Этап 5/8).
      await this.outbox.enqueue(tx, organizationId, 'receipt.paid', {
        receiptId: updated.id,
        total: updated.total,
      });

      await this.audit.log(
        organizationId,
        userId,
        'receipt.paid',
        'Receipt',
        id,
        {
          total: updated.total,
          methods: dto.payments.map((p) => p.method),
        },
      );

      return updated;
    });
  }

  async returnReceipt(organizationId: string, userId: string, id: string) {
    const receipt = await this.prisma.receipt.findFirst({
      where: { id, store: { organizationId } },
    });
    if (!receipt) {
      throw new NotFoundException('Чек не найден');
    }
    if (receipt.status !== ReceiptStatus.PAID) {
      throw new BadRequestException('Вернуть можно только оплаченный чек');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.receipt.update({
        where: { id },
        data: { status: ReceiptStatus.RETURNED },
        include: { items: true, payments: true },
      });

      // Возвращаем товар на остаток по каждой позиции в той же транзакции.
      for (const item of updated.items) {
        await this.stock.applyMovement(
          tx,
          updated.storeId,
          item.productId,
          Number(item.quantity),
          StockMovementType.RETURN,
          userId,
        );
      }

      await this.outbox.enqueue(tx, organizationId, 'receipt.returned', {
        receiptId: updated.id,
        total: updated.total,
      });

      await this.audit.log(
        organizationId,
        userId,
        'receipt.returned',
        'Receipt',
        id,
        {
          total: updated.total,
        },
      );

      return updated;
    });
  }
}
