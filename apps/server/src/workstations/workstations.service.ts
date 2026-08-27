import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkstationDto } from './dto/create-workstation.dto';

@Injectable()
export class WorkstationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateWorkstationDto) {
    const store = await this.prisma.store.findFirst({
      where: { id: dto.storeId, organizationId },
    });
    if (!store) {
      throw new NotFoundException('Точка продаж не найдена');
    }

    return this.prisma.workstation.create({
      data: { name: dto.name, storeId: dto.storeId, organizationId },
    });
  }

  findAll(organizationId: string) {
    return this.prisma.workstation.findMany({ where: { organizationId } });
  }
}
