import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';

type Client = PrismaService | Prisma.TransactionClient;

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  // Общая точка изменения остатка + журналирование движения. Используется и напрямую
  // (приёмка/инвентаризация), и изнутри ReceiptsService.pay/returnReceipt в их транзакциях —
  // поэтому принимает произвольный Prisma-клиент (обычный или транзакционный).
  async applyMovement(
    client: Client,
    storeId: string,
    productId: string,
    quantityDelta: number,
    type: StockMovementType,
    userId: string | null,
    comment?: string,
  ) {
    const stock = await client.stock.upsert({
      where: { storeId_productId: { storeId, productId } },
      create: { storeId, productId, quantity: Math.max(0, quantityDelta) },
      update: { quantity: { increment: quantityDelta } },
    });

    await client.stockMovement.create({
      data: { stockId: stock.id, type, quantityDelta, userId, comment },
    });

    return stock;
  }

  async receive(organizationId: string, userId: string, dto: ReceiveStockDto) {
    await this.assertBelongsToOrg(organizationId, dto.storeId, dto.productId);
    return this.applyMovement(
      this.prisma,
      dto.storeId,
      dto.productId,
      dto.quantity,
      StockMovementType.RECEIPT_IN,
      userId,
      dto.comment,
    );
  }

  async adjust(organizationId: string, userId: string, dto: AdjustStockDto) {
    await this.assertBelongsToOrg(organizationId, dto.storeId, dto.productId);

    const current = await this.prisma.stock.findUnique({
      where: {
        storeId_productId: { storeId: dto.storeId, productId: dto.productId },
      },
    });
    const delta = dto.newQuantity - Number(current?.quantity ?? 0);
    if (delta === 0) {
      return (
        current ??
        this.applyMovement(
          this.prisma,
          dto.storeId,
          dto.productId,
          0,
          StockMovementType.ADJUSTMENT,
          userId,
        )
      );
    }

    return this.applyMovement(
      this.prisma,
      dto.storeId,
      dto.productId,
      delta,
      StockMovementType.ADJUSTMENT,
      userId,
      dto.reason,
    );
  }

  findAll(organizationId: string, storeId?: string) {
    return this.prisma.stock.findMany({
      where: { product: { organizationId }, ...(storeId ? { storeId } : {}) },
      include: { product: true, store: true },
      orderBy: { product: { name: 'asc' } },
    });
  }

  findMovements(organizationId: string, storeId?: string, productId?: string) {
    return this.prisma.stockMovement.findMany({
      where: {
        stock: {
          product: { organizationId },
          ...(storeId ? { storeId } : {}),
          ...(productId ? { productId } : {}),
        },
      },
      include: { stock: { include: { product: true, store: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  private async assertBelongsToOrg(
    organizationId: string,
    storeId: string,
    productId: string,
  ) {
    const [store, product] = await Promise.all([
      this.prisma.store.findFirst({ where: { id: storeId, organizationId } }),
      this.prisma.product.findFirst({
        where: { id: productId, organizationId },
      }),
    ]);
    if (!store) throw new NotFoundException('Точка продаж не найдена');
    if (!product) throw new NotFoundException('Товар не найден');
  }
}
