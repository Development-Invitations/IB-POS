import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BackupTrigger, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Прикладной снимок данных организации в JSON — не физический pg_dump (одна база на всех
// арендаторов, средствами Postgres бэкап по организациям не разделить). Покрывает основные
// операционные данные; интеграции/устройства/аудит в снимок пока не входят.
interface BackupSnapshot {
  version: 1;
  organization: unknown;
  settings: unknown;
  stores: unknown[];
  workstations: unknown[];
  users: unknown[];
  categories: unknown[];
  products: unknown[];
  customers: unknown[];
  discounts: unknown[];
  shifts: unknown[];
  receipts: unknown[];
}

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async buildSnapshot(organizationId: string): Promise<BackupSnapshot> {
    const [
      organization,
      settings,
      stores,
      workstations,
      users,
      categories,
      products,
      customers,
      discounts,
      shifts,
      receipts,
    ] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
      }),
      this.prisma.organizationSettings.findUnique({
        where: { organizationId },
      }),
      this.prisma.store.findMany({ where: { organizationId } }),
      this.prisma.workstation.findMany({ where: { organizationId } }),
      this.prisma.user.findMany({ where: { organizationId } }),
      this.prisma.category.findMany({ where: { organizationId } }),
      this.prisma.product.findMany({ where: { organizationId } }),
      this.prisma.customer.findMany({ where: { organizationId } }),
      this.prisma.discount.findMany({ where: { organizationId } }),
      this.prisma.shift.findMany({ where: { store: { organizationId } } }),
      this.prisma.receipt.findMany({
        where: { store: { organizationId } },
        include: { items: true, payments: true },
      }),
    ]);

    return {
      version: 1,
      organization,
      settings,
      stores,
      workstations,
      users,
      categories,
      products,
      customers,
      discounts,
      shifts,
      receipts,
    };
  }

  async createBackup(
    organizationId: string,
    trigger: BackupTrigger,
    userId: string | null,
  ) {
    const snapshot = await this.buildSnapshot(organizationId);
    const json = JSON.stringify(snapshot);

    return this.prisma.backup.create({
      data: {
        organizationId,
        trigger,
        createdByUserId: userId,
        sizeBytes: Buffer.byteLength(json, 'utf8'),
        snapshot: JSON.parse(json) as Prisma.InputJsonValue,
      },
      select: { id: true, trigger: true, sizeBytes: true, createdAt: true },
    });
  }

  findAll(organizationId: string) {
    return this.prisma.backup.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, trigger: true, sizeBytes: true, createdAt: true },
    });
  }

  async getSnapshot(organizationId: string, id: string) {
    const backup = await this.prisma.backup.findFirst({
      where: { id, organizationId },
    });
    if (!backup) {
      throw new NotFoundException('Резервная копия не найдена');
    }
    return backup;
  }

  // Восстановление — безопасное (upsert по исходным id), не стирает текущие данные,
  // а доливает недостающее/обновляет совпадающее. Полный wipe-and-replace — отдельная,
  // более рискованная операция, которую сознательно не делаем без явного отдельного шага.
  async restore(organizationId: string, id: string) {
    const backup = await this.getSnapshot(organizationId, id);
    const snapshot = backup.snapshot as unknown as BackupSnapshot;

    let restored = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const store of snapshot.stores as Prisma.StoreCreateManyInput[]) {
        await tx.store.upsert({
          where: { id: store.id },
          create: store,
          update: store,
        });
        restored++;
      }
      for (const ws of snapshot.workstations as Prisma.WorkstationCreateManyInput[]) {
        await tx.workstation.upsert({
          where: { id: ws.id },
          create: ws,
          update: ws,
        });
        restored++;
      }
      for (const user of snapshot.users as Prisma.UserCreateManyInput[]) {
        await tx.user.upsert({
          where: { id: user.id },
          create: user,
          update: user,
        });
        restored++;
      }
      for (const category of snapshot.categories as Prisma.CategoryCreateManyInput[]) {
        await tx.category.upsert({
          where: { id: category.id },
          create: category,
          update: category,
        });
        restored++;
      }
      for (const product of snapshot.products as Prisma.ProductCreateManyInput[]) {
        await tx.product.upsert({
          where: { id: product.id },
          create: product,
          update: product,
        });
        restored++;
      }
      for (const customer of snapshot.customers as Prisma.CustomerCreateManyInput[]) {
        await tx.customer.upsert({
          where: { id: customer.id },
          create: customer,
          update: customer,
        });
        restored++;
      }
      for (const discount of snapshot.discounts as Prisma.DiscountCreateManyInput[]) {
        await tx.discount.upsert({
          where: { id: discount.id },
          create: discount,
          update: discount,
        });
        restored++;
      }
      for (const shift of snapshot.shifts as Prisma.ShiftCreateManyInput[]) {
        await tx.shift.upsert({
          where: { id: shift.id },
          create: shift,
          update: shift,
        });
        restored++;
      }
      for (const receiptWithChildren of snapshot.receipts as Array<
        Prisma.ReceiptCreateManyInput & {
          items: Prisma.ReceiptItemCreateManyInput[];
          payments: Prisma.PaymentCreateManyInput[];
        }
      >) {
        const { items, payments, ...receipt } = receiptWithChildren;
        await tx.receipt.upsert({
          where: { id: receipt.id },
          create: receipt,
          update: receipt,
        });
        for (const item of items) {
          await tx.receiptItem.upsert({
            where: { id: item.id },
            create: item,
            update: item,
          });
        }
        for (const payment of payments) {
          await tx.payment.upsert({
            where: { id: payment.id },
            create: payment,
            update: payment,
          });
        }
        restored++;
      }
    });

    this.logger.log(
      `Восстановлено ${restored} записей из резервной копии ${id}`,
    );
    return { restored };
  }

  // Автобэкап (Этап 9 — "ручное/авто") — раз в сутки для организаций с включённой опцией.
  @Cron('0 3 * * *')
  async runAutoBackups() {
    const orgs = await this.prisma.organizationSettings.findMany({
      where: { autoBackupEnabled: true },
      select: { organizationId: true },
    });

    for (const { organizationId } of orgs) {
      try {
        await this.createBackup(organizationId, BackupTrigger.AUTO, null);
      } catch (error) {
        this.logger.error(
          `Автобэкап организации ${organizationId} не удался`,
          error,
        );
      }
    }
  }
}
