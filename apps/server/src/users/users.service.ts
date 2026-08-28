import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hashSecret } from '../common/crypto';
import { sanitizeUser } from '../common/sanitize-user';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    organizationId: string,
    actingUserId: string,
    dto: CreateUserDto,
  ) {
    if (!dto.pin && !dto.password) {
      throw new BadRequestException('Укажите PIN и/или пароль для входа');
    }

    const user = await this.prisma.user.create({
      data: {
        organizationId,
        fullName: dto.fullName,
        login: dto.login,
        role: dto.role,
        pinHash: dto.pin ? await hashSecret(dto.pin) : null,
        passwordHash: dto.password ? await hashSecret(dto.password) : null,
      },
    });

    await this.audit.log(
      organizationId,
      actingUserId,
      'user.created',
      'User',
      user.id,
      {
        login: user.login,
        role: user.role,
      },
    );

    return sanitizeUser(user);
  }

  async findAll(organizationId: string) {
    const users = await this.prisma.user.findMany({
      where: { organizationId },
    });
    return users.map(sanitizeUser);
  }
}
