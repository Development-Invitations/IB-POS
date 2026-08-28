import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReceiptStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { AuditService } from '../audit/audit.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { PayReceiptDto } from './dto/pay-receipt.dto';

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async create(organizationId: string, dto: CreateReceiptDto) {
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

    const productIds = dto.items.map((item) => item.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, organizationId },
    });
    if (products.length !== new Set(productIds).size) {
      throw new BadRequestException('Один или несколько товаров не найдены');
    }

    const priceById = new Map(products.map((p) => [p.id, p.price]));
    const total = dto.items.reduce(
      (sum, item) =>
        sum + Number(priceById.get(item.productId)) * item.quantity,
      0,
    );

    // Чек создаётся открытым (OPEN) без записи в очередь фискализации — на фискальный
    // регистратор/кассу уходит только фактически оплаченная продажа, см. pay() ниже.
    return this.prisma.receipt.create({
      data: {
        storeId: dto.storeId,
        workstationId: dto.workstationId,
        shiftId: dto.shiftId,
        customerId: dto.customerId,
        total,
        items: {
          create: dto.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: priceById.get(item.productId)!,
          })),
        },
      },
      include: { items: true },
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
