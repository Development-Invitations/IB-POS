import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Журнал действий сотрудников (Этап 7 — модуль "Сотрудники"). Пишется best-effort:
// ошибка записи в аудит не должна ронять основную операцию.
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    organizationId: string,
    userId: string | null,
    action: string,
    entity: string,
    entityId?: string,
    metadata: Record<string, unknown> = {},
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId,
          userId,
          action,
          entity,
          entityId,
          metadata: metadata as Prisma.InputJsonValue,
        },
      });
    } catch {
      // намеренно проглатываем — аудит не должен блокировать бизнес-операцию
    }
  }

  findAll(organizationId: string, userId?: string) {
    return this.prisma.auditLog.findMany({
      where: { organizationId, ...(userId ? { userId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { id: true, fullName: true, login: true } } },
    });
  }
}
