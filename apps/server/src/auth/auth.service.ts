import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { LoginPinDto } from './dto/login-pin.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async loginWithPassword(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        organizationId: dto.organizationId,
        login: dto.login,
        isActive: true,
      },
    });

    if (
      !user?.passwordHash ||
      !(await bcrypt.compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    return this.issueToken(user.id, user.organizationId, user.role, user.login);
  }

  async loginWithPin(dto: LoginPinDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        organizationId: dto.organizationId,
        login: dto.login,
        isActive: true,
      },
    });

    if (!user?.pinHash || !(await bcrypt.compare(dto.pin, user.pinHash))) {
      throw new UnauthorizedException('Неверный логин или PIN');
    }

    return this.issueToken(user.id, user.organizationId, user.role, user.login);
  }

  private issueToken(
    userId: string,
    organizationId: string,
    role: string,
    login: string,
  ) {
    const accessToken = this.jwt.sign({
      sub: userId,
      organizationId,
      role,
      login,
    });
    return { accessToken };
  }
}
