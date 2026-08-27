import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ShiftStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OpenShiftDto } from './dto/open-shift.dto';
import { CloseShiftDto } from './dto/close-shift.dto';

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.shift.create({
      data: {
        storeId: dto.storeId,
        workstationId: dto.workstationId,
        userId,
        openingCash: dto.openingCash,
      },
    });
  }

  async close(organizationId: string, id: string, dto: CloseShiftDto) {
    const shift = await this.prisma.shift.findFirst({
      where: { id, store: { organizationId } },
    });
    if (!shift) {
      throw new NotFoundException('Смена не найдена');
    }
    if (shift.status === ShiftStatus.CLOSED) {
      throw new BadRequestException('Смена уже закрыта');
    }

    return this.prisma.shift.update({
      where: { id },
      data: {
        status: ShiftStatus.CLOSED,
        closedAt: new Date(),
        closingCash: dto.closingCash,
      },
    });
  }

  findAll(organizationId: string, storeId?: string) {
    return this.prisma.shift.findMany({
      where: { store: { organizationId }, ...(storeId ? { storeId } : {}) },
    });
  }
}
