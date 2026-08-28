import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { AdjustBonusDto } from './dto/adjust-bonus.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  create(organizationId: string, dto: CreateCustomerDto) {
    return this.prisma.customer.create({ data: { ...dto, organizationId } });
  }

  findAll(organizationId: string, search?: string) {
    return this.prisma.customer.findMany({
      where: {
        organizationId,
        ...(search
          ? {
              OR: [
                { fullName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async update(organizationId: string, id: string, dto: UpdateCustomerDto) {
    await this.assertExists(organizationId, id);
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  // Бонусный баланс — поле есть в схеме с самого начала, но им никто не пользовался
  // (см. также docs/Roadmap_TZ.md, Этап 7: "Модуль «Клиенты»: ... бонусы").
  async adjustBonus(organizationId: string, id: string, dto: AdjustBonusDto) {
    await this.assertExists(organizationId, id);
    return this.prisma.customer.update({
      where: { id },
      data: { bonusBalance: { increment: dto.delta } },
    });
  }

  // История покупок клиента (Этап 7 — модуль "Клиенты").
  async findPurchaseHistory(organizationId: string, customerId: string) {
    await this.assertExists(organizationId, customerId);

    return this.prisma.receipt.findMany({
      where: { customerId },
      include: { items: true, payments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async assertExists(organizationId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId },
    });
    if (!customer) {
      throw new NotFoundException('Клиент не найден');
    }
    return customer;
  }
}
