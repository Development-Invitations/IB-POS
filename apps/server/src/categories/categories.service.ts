import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  create(organizationId: string, dto: CreateCategoryDto) {
    return this.prisma.category.create({ data: { ...dto, organizationId } });
  }

  findAll(organizationId: string) {
    return this.prisma.category.findMany({ where: { organizationId } });
  }
}
