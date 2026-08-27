import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
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

    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.create({
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

      // Пишется в той же транзакции — при отсутствии сети чек остаётся сохранённым
      // локально, а событие остаётся в очереди PENDING до следующей попытки синка (Этап 8).
      await this.outbox.enqueue(tx, organizationId, 'receipt.created', {
        receiptId: receipt.id,
        total: receipt.total,
      });

      return receipt;
    });
  }

  findOne(organizationId: string, id: string) {
    return this.prisma.receipt.findFirstOrThrow({
      where: { id, store: { organizationId } },
      include: { items: true, payments: true },
    });
  }
}
