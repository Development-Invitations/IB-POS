import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  // Пишется в той же транзакции, что и доменное событие (например, создание чека),
  // чтобы запись и постановка в очередь были атомарны — не потеряется при обрыве связи.
  enqueue(
    tx: Prisma.TransactionClient | PrismaService,
    organizationId: string,
    eventType: string,
    payload: object,
  ) {
    return tx.outboxEvent.create({
      data: {
        organizationId,
        eventType,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }

  findPending(organizationId: string) {
    return this.prisma.outboxEvent.findMany({
      where: { organizationId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
  }
}
