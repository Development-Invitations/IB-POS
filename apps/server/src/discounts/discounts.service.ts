import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';

@Injectable()
export class DiscountsService {
  constructor(private readonly prisma: PrismaService) {}

  create(organizationId: string, dto: CreateDiscountDto) {
    return this.prisma.discount.create({ data: { ...dto, organizationId } });
  }

  findAll(organizationId: string) {
    return this.prisma.discount.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(organizationId: string, id: string, dto: UpdateDiscountDto) {
    const existing = await this.prisma.discount.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Скидка не найдена');
    }
    return this.prisma.discount.update({ where: { id }, data: dto });
  }

  async remove(organizationId: string, id: string) {
    const existing = await this.prisma.discount.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Скидка не найдена');
    }
    await this.prisma.discount.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
