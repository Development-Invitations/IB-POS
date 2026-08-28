import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hashSecret } from '../common/crypto';
import { sanitizeUser } from '../common/sanitize-user';
import { CreateOrganizationDto } from './dto/create-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrganizationDto) {
    const passwordHash = await hashSecret(dto.admin.password);

    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: dto.name,
          users: {
            create: {
              fullName: dto.admin.fullName,
              login: dto.admin.login,
              passwordHash,
              role: Role.ADMIN,
            },
          },
          stores: {
            create: { name: dto.name },
          },
        },
        include: { users: true, stores: true },
      });

      // Workstation.organizationId — денормализованный скаляр без Prisma-relation
      // (см. schema.prisma), вложенным create через Store он не заполняется сам.
      // Без хотя бы одной кассы новый админ не может открыть смену и попадает в тупик
      // на экране выбора кассы (пустые списки без объяснения).
      await tx.workstation.create({
        data: {
          organizationId: organization.id,
          storeId: organization.stores[0].id,
          name: 'Касса 1',
        },
      });

      return {
        ...organization,
        users: organization.users.map((user) => sanitizeUser(user)),
      };
    });
  }

  findOne(id: string) {
    return this.prisma.organization.findUniqueOrThrow({ where: { id } });
  }
}
