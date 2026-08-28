import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';

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
    });
  }

  // История покупок клиента (Этап 7 — модуль "Клиенты").
  async findPurchaseHistory(organizationId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
    });
    if (!customer) {
      throw new NotFoundException('Клиент не найден');
    }

    return this.prisma.receipt.findMany({
      where: { customerId },
      include: { items: true, payments: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
