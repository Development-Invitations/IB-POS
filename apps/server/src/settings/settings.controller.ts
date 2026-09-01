import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  // Доступно всем ролям (в отличие от остального контроллера) — экран "Продажа" должен знать
  // профиль бизнеса независимо от того, кто за кассой.
  @Roles(
    Role.ADMIN,
    Role.MANAGER,
    Role.CASHIER,
    Role.WAREHOUSE,
    Role.ACCOUNTANT,
  )
  @Get('business-type')
  getBusinessType(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.getBusinessType(user.organizationId);
  }

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.get(user.organizationId);
  }

  @Patch()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.settings.update(user.organizationId, dto);
  }
}
