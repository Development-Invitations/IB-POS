import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, ShiftStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OpenShiftDto } from './dto/open-shift.dto';
import { CloseShiftDto } from './dto/close-shift.dto';
import { CashMovementDto } from './dto/cash-movement.dto';

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async open(organizationId: string, userId: string, dto: OpenShiftDto) {
    const workstation = await this.prisma.workstation.findFirst({
      where: { id: dto.workstationId, storeId: dto.storeId, organizationId },
    });
    if (!workstation) {
      throw new NotFoundException('Касса не найдена');
    }

    const alreadyOpen = await this.prisma.shift.findFirst({
      where: { workstationId: dto.workstationId, status: ShiftStatus.OPEN },
    });
    if (alreadyOpen) {
      throw new BadRequestException('На этой кассе уже открыта смена');
    }

    const shift = await this.prisma.shift.create({
      data: {
        storeId: dto.storeId,
        workstationId: dto.workstationId,
        userId,
        openingCash: dto.openingCash,
      },
    });

    await this.audit.log(
      organizationId,
      userId,
      'shift.opened',
      'Shift',
      shift.id,
      {
        workstationId: dto.workstationId,
        openingCash: dto.openingCash,
      },
    );

    return shift;
  }

  async close(
    organizationId: string,
    userId: string,
    id: string,
    dto: CloseShiftDto,
  ) {
    const shift = await this.prisma.shift.findFirst({
      where: { id, store: { organizationId } },
    });
    if (!shift) {
      throw new NotFoundException('Смена не найдена');
    }
    if (shift.status === ShiftStatus.CLOSED) {
      throw new BadRequestException('Смена уже закрыта');
    }

    const updated = await this.prisma.shift.update({
      where: { id },
      data: {
        status: ShiftStatus.CLOSED,
        closedAt: new Date(),
        closingCash: dto.closingCash,
      },
    });

    await this.audit.log(organizationId, userId, 'shift.closed', 'Shift', id, {
      closingCash: dto.closingCash,
    });

    return updated;
  }

  findAll(organizationId: string, storeId?: string) {
    return this.prisma.shift.findMany({
      where: { store: { organizationId }, ...(storeId ? { storeId } : {}) },
    });
  }

  private async findOwnedShift(organizationId: string, id: string) {
    const shift = await this.prisma.shift.findFirst({
      where: { id, store: { organizationId } },
    });
    if (!shift) {
      throw new NotFoundException('Смена не найдена');
    }
    return shift;
  }

  async addCashMovement(
    organizationId: string,
    userId: string,
    shiftId: string,
    dto: CashMovementDto,
  ) {
    const shift = await this.findOwnedShift(organizationId, shiftId);
    if (shift.status === ShiftStatus.CLOSED) {
      throw new BadRequestException(
        'Смена закрыта — внесение/изъятие недоступно',
      );
    }

    return this.prisma.cashMovement.create({
      data: {
        shiftId,
        userId,
        type: dto.type,
        amount: dto.amount,
        comment: dto.comment,
      },
    });
  }

  // Отчёт по смене: продажи по способам оплаты, внесения/изъятия, ожидаемая
  // сумма наличных в ящике (Этап 7 — "отчёт смены").
  async getReport(organizationId: string, shiftId: string) {
    const shift = await this.findOwnedShift(organizationId, shiftId);

    const [receipts, payments, cashMovements] = await Promise.all([
      this.prisma.receipt.findMany({
        where: { shiftId },
        select: { id: true, total: true, status: true },
      }),
      this.prisma.payment.groupBy({
        by: ['method'],
        where: { receipt: { shiftId } },
        _sum: { amount: true },
      }),
      this.prisma.cashMovement.findMany({
        where: { shiftId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const salesTotal = receipts.reduce((sum, r) => sum + Number(r.total), 0);
    const paymentsByMethod = Object.fromEntries(
      payments.map((p) => [p.method, Number(p._sum.amount ?? 0)]),
    ) as Partial<Record<PaymentMethod, number>>;

    const deposits = cashMovements
      .filter((m) => m.type === 'DEPOSIT')
      .reduce((sum, m) => sum + Number(m.amount), 0);
    const withdrawals = cashMovements
      .filter((m) => m.type === 'WITHDRAWAL')
      .reduce((sum, m) => sum + Number(m.amount), 0);

    const cashSales = paymentsByMethod.CASH ?? 0;
    const expectedCash =
      Number(shift.openingCash) + cashSales + deposits - withdrawals;

    return {
      shift,
      receiptsCount: receipts.length,
      salesTotal,
      paymentsByMethod,
      cashMovements,
      deposits,
      withdrawals,
      expectedCash,
    };
  }
}
