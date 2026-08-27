import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoreDto } from './dto/create-store.dto';

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  create(organizationId: string, dto: CreateStoreDto) {
    return this.prisma.store.create({ data: { ...dto, organizationId } });
  }

  findAll(organizationId: string) {
    return this.prisma.store.findMany({ where: { organizationId } });
  }

  findOne(organizationId: string, id: string) {
    return this.prisma.store.findFirstOrThrow({
      where: { id, organizationId },
    });
  }
}
