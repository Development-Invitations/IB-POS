import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';

@Injectable()
export class EquipmentService {
  constructor(private readonly prisma: PrismaService) {}

  create(organizationId: string, dto: CreateEquipmentDto) {
    return this.prisma.equipment.create({ data: { ...dto, organizationId } });
  }

  findAll(organizationId: string) {
    return this.prisma.equipment.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(organizationId: string, id: string, dto: UpdateEquipmentDto) {
    const existing = await this.prisma.equipment.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Оборудование не найдено');
    }
    return this.prisma.equipment.update({ where: { id }, data: dto });
  }

  async remove(organizationId: string, id: string) {
    const existing = await this.prisma.equipment.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Оборудование не найдено');
    }
    await this.prisma.equipment.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
