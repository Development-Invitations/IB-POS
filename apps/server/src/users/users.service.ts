import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hashSecret } from '../common/crypto';
import { sanitizeUser } from '../common/sanitize-user';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

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
      orderBy: { createdAt: 'asc' },
    });
    return users.map(sanitizeUser);
  }

  async update(
    organizationId: string,
    actingUserId: string,
    actingRole: Role,
    id: string,
    dto: UpdateUserDto,
  ) {
    const existing = await this.prisma.user.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Сотрудник не найден');
    }
    // Бухгалтеру этот эндпоинт открыт только ради зарплаты (см. Sidebar.tsx на клиенте —
    // "Сотрудники" не из исходного ТЗ для этой роли). Если он пришёл сюда напрямую через API
    // с чем-то ещё, кроме salary, — честно отказываем, а не тихо игнорируем остальные поля.
    if (actingRole === Role.ACCOUNTANT) {
      const disallowed =
        dto.fullName !== undefined ||
        dto.role !== undefined ||
        dto.isActive !== undefined ||
        dto.pin !== undefined ||
        dto.password !== undefined;
      if (disallowed) {
        throw new ForbiddenException(
          'Бухгалтер может изменять только зарплату сотрудника',
        );
      }
    }
    // Иначе админ может случайно деактивировать сам себя и остаться без доступа к панели —
    // единственный способ вернуть доступ тогда — прямое вмешательство в базу.
    if (id === actingUserId && dto.isActive === false) {
      throw new BadRequestException(
        'Нельзя деактивировать свою же учётную запись',
      );
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        role: dto.role,
        isActive: dto.isActive,
        salary: dto.salary,
        pinHash: dto.pin ? await hashSecret(dto.pin) : undefined,
        passwordHash: dto.password ? await hashSecret(dto.password) : undefined,
      },
    });

    await this.audit.log(
      organizationId,
      actingUserId,
      'user.updated',
      'User',
      user.id,
      {
        fullName: dto.fullName,
        role: dto.role,
        isActive: dto.isActive,
        salaryChanged: dto.salary !== undefined,
        pinChanged: !!dto.pin,
        passwordChanged: !!dto.password,
      },
    );

    return sanitizeUser(user);
  }
}
