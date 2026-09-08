import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
    markingCodes?: string[],
  ) {
    const stock = await client.stock.upsert({
      where: { storeId_productId: { storeId, productId } },
      create: { storeId, productId, quantity: Math.max(0, quantityDelta) },
      update: { quantity: { increment: quantityDelta } },
    });

    await client.stockMovement.create({
      data: { stockId: stock.id, type, quantityDelta, userId, comment, markingCodes },
    });

    return stock;
  }

  // Не из исходного ТЗ — по прямому запросу клиента: "если на складе нету, то через кассу
  // прохода не должно быть" — раньше applyMovement списывал остаток БЕЗ проверки нижней
  // границы (жалоба клиента, скриншот с "-9 pcs" в "Остатках"), клиентская проверка на "нет в
  // наличии" (App.tsx::isProductUnsellable) — только UI-подсказка, легко упускается: не
  // учитывает конкурентную продажу того же товара с двух касс одновременно, и не пересчитывается
  // при ручном увеличении количества в уже открытой строке чека. Здесь — авторитетная проверка
  // прямо в БД: UPDATE с условием quantity >= requested в одном атомарном запросе (не
  // "прочитать, проверить в JS, потом обновить" — это гонка при параллельных продажах;
  // WHERE-условие в самом UPDATE безопасно и под конкурентным доступом, Postgres сериализует
  // конфликтующие обновления одной строки). count === 0 — либо остатка нет вовсе, либо кто-то
  // другой только что списал последнее раньше нас.
  //
  // Не из исходного ТЗ — по прямому запросу клиента: маркировка расходуется вместе с остатком —
  // продали 2 шт., значит 2 "активных" кода маркировки должны перейти в "проданные" (см.
  // ProductMarking.consumedAt в schema.prisma). Без сканирования на кассе — это отдельная, более
  // медленная функция, от которой клиент прямо отказался ("ускорит продажи"); коды выбираются
  // САМИ, по очереди прихода (FIFO — сначала те, что приняли раньше). best-effort: если
  // промаркированных кодов на товар меньше, чем quantity (обычный случай для товара, который
  // приходовали ДО включения режима маркировки, или для организаций без маркировки вовсе) —
  // списываем сколько есть, это не повод отменять продажу.
  async trySale(
    client: Client,
    organizationId: string,
    storeId: string,
    productId: string,
    quantity: number,
    userId: string | null,
    comment?: string,
    receiptItemId?: string,
  ): Promise<boolean> {
    const result = await client.stock.updateMany({
      where: { storeId, productId, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (result.count === 0) return false;

    const stock = await client.stock.findUniqueOrThrow({
      where: { storeId_productId: { storeId, productId } },
    });
    await client.stockMovement.create({
      data: {
        stockId: stock.id,
        type: StockMovementType.SALE,
        quantityDelta: -quantity,
        userId,
        comment,
      },
    });

    const toConsume = await client.productMarking.findMany({
      where: { organizationId, storeId, productId, consumedAt: null },
      orderBy: { createdAt: 'asc' },
      take: quantity,
      select: { id: true },
    });
    if (toConsume.length > 0) {
      await client.productMarking.updateMany({
        where: { id: { in: toConsume.map((m) => m.id) } },
        data: { consumedAt: new Date(), receiptItemId: receiptItemId ?? null },
      });
    }

    return true;
  }

  // Не из исходного ТЗ — по прямому запросу клиента: при возврате чека возвращённые единицы
  // должны "вернуть" именно свои коды маркировки в "активные" (не чужие — поэтому ищем строго
  // по receiptItemId), а не просто увеличить число остатка.
  async restoreMarkings(client: Client, receiptItemId: string, quantity: number) {
    const toRestore = await client.productMarking.findMany({
      where: { receiptItemId, consumedAt: { not: null } },
      orderBy: { consumedAt: 'desc' },
      take: quantity,
      select: { id: true },
    });
    if (toRestore.length > 0) {
      await client.productMarking.updateMany({
        where: { id: { in: toRestore.map((m) => m.id) } },
        data: { consumedAt: null, receiptItemId: null },
      });
    }
  }

  // Не из исходного ТЗ — по прямому запросу клиента: "1 файл активных маркировок который не
  // чистится, 2 файл маркировок товаров которые проданы который можно чистить" — обе половины
  // это одна таблица ProductMarking, разделённая по consumedAt. Чистка удаляет ТОЛЬКО проданные
  // (consumedAt заполнен) — активные (ещё в наличии) не трогает никогда, иначе сломалась бы
  // защита от повторного прихода уже принятого товара.
  async clearMarkingCache(organizationId: string) {
    const result = await this.prisma.productMarking.deleteMany({
      where: { organizationId, consumedAt: { not: null } },
    });
    return { cleared: result.count };
  }

  // Не из исходного ТЗ — по прямому запросу клиента: список кодов маркировки для отображения на
  // клиенте (бейдж/попап в "Остатках" — только активные, ещё физически в наличии — и известные
  // коды для защиты от повторного скана при приёмке — активные и проданные вместе, см.
  // WarehouseScreen.tsx). Отдаём оба состояния одним списком, клиент сам решает, что ему нужно.
  findMarkings(organizationId: string, storeId: string) {
    return this.prisma.productMarking.findMany({
      where: { organizationId, storeId },
      select: { productId: true, code: true, consumedAt: true },
    });
  }

  // Не из исходного ТЗ — по прямому запросу клиента (только Магазин/Аптека — там есть
  // маркировка): постоянный журнал всех кодов маркировки, когда-либо принятых организацией
  // (см. ProductMarking в schema.prisma) — авторитетная, а не только клиентская, защита от
  // повторного прихода товара с уже учтённым кодом. Клиент уже отсеивает известные ему коды
  // сам (см. WarehouseScreen.tsx — known/markingCodesByProduct), это здесь — подстраховка на
  // случай гонки (два человека одновременно принимают один и тот же физический товар) или
  // устаревшего локального кэша на клиенте, а не дублирование той же проверки. Природа
  // маркировки такова, что один и тот же код не может законно встретиться дважды — поэтому вся
  // приёмка отклоняется целиком, а не "тихо" обрезается до новых кодов.
  async receive(organizationId: string, userId: string, dto: ReceiveStockDto) {
    await this.assertBelongsToOrg(organizationId, dto.storeId, dto.productId);

    if (dto.markingCodes && dto.markingCodes.length > 0) {
      return this.prisma.$transaction(async (tx) => {
        const existing = await tx.productMarking.findMany({
          where: { organizationId, code: { in: dto.markingCodes } },
          select: { code: true },
        });
        if (existing.length > 0) {
          throw new BadRequestException(
            `Эти коды маркировки уже были приняты ранее: ${existing.map((e) => e.code).join(', ')}`,
          );
        }
        await tx.productMarking.createMany({
          data: dto.markingCodes!.map((code) => ({
            organizationId,
            storeId: dto.storeId,
            productId: dto.productId,
            code,
          })),
        });
        return this.applyMovement(
          tx,
          dto.storeId,
          dto.productId,
          dto.quantity,
          StockMovementType.RECEIPT_IN,
          userId,
          dto.comment,
          dto.markingCodes,
        );
      });
    }

    return this.applyMovement(
      this.prisma,
      dto.storeId,
      dto.productId,
      dto.quantity,
      StockMovementType.RECEIPT_IN,
      userId,
      dto.comment,
      dto.markingCodes,
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
