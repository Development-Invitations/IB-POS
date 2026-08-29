import { Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
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

  async setImage(organizationId: string, id: string, imageUrl: string) {
    const existing = await this.prisma.equipment.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Оборудование не найдено');
    }
    const updated = await this.prisma.equipment.update({
      where: { id },
      data: { imageUrl },
    });

    // Старый файл больше не нужен — иначе каждая замена фото копит мёртвые файлы на диске.
    if (existing.imageUrl && existing.imageUrl !== imageUrl) {
      const oldPath = join(process.cwd(), existing.imageUrl.replace(/^\//, ''));
      if (existsSync(oldPath)) {
        unlinkSync(oldPath);
      }
    }

    return updated;
  }
}
