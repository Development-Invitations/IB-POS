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

    const organization = await this.prisma.organization.create({
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
      },
      include: { users: true },
    });

    return {
      ...organization,
      users: organization.users.map((user) => sanitizeUser(user)),
    };
  }

  findOne(id: string) {
    return this.prisma.organization.findUniqueOrThrow({ where: { id } });
  }
}
