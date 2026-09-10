import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  create(organizationId: string, dto: CreateSupplierDto) {
    return this.prisma.supplier.create({ data: { ...dto, organizationId } });
  }

  findAll(organizationId: string) {
    return this.prisma.supplier.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }
}
