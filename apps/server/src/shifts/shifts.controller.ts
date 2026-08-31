import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ShiftsService } from './shifts.service';
import { OpenShiftDto } from './dto/open-shift.dto';
import { CloseShiftDto } from './dto/close-shift.dto';
import { CashMovementDto } from './dto/cash-movement.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER, Role.CASHIER)
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Post('open')
  open(@CurrentUser() user: AuthenticatedUser, @Body() dto: OpenShiftDto) {
    return this.shifts.open(user.organizationId, user.userId, dto);
  }

  @Post(':id/close')
  close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CloseShiftDto,
  ) {
    return this.shifts.close(user.organizationId, user.userId, id, dto);
  }

  // Не из исходного ТЗ (там у Бухгалтера "Смены" ❌) — добавлено по прямому запросу клиента:
  // Бухгалтеру нужен просмотр смен. Только список и отчёт — открытие/закрытие и внесение/
  // изъятие наличных остаются на классовом @Roles (Админ/Управляющий/Кассир), Бухгалтеру
  // эти операции недоступны совсем, даже не задизейблены на клиенте, а закрыты и на сервере.
  @Roles(Role.ADMIN, Role.MANAGER, Role.CASHIER, Role.ACCOUNTANT)
  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('storeId') storeId?: string,
  ) {
    return this.shifts.findAll(user.organizationId, storeId);
  }

  @Post(':id/cash-movements')
  addCashMovement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CashMovementDto,
  ) {
    return this.shifts.addCashMovement(
      user.organizationId,
      user.userId,
      id,
      dto,
    );
  }

  // Отчёт смены — финансовые данные, доступ как у "Отчётов и аналитики" в целом:
  // Бухгалтеру нужен полный доступ, а не только ролям, у которых есть операционный
  // доступ к самим сменам (перекрывает @Roles контроллера).
  @Roles(Role.ADMIN, Role.MANAGER, Role.CASHIER, Role.ACCOUNTANT)
  @Get(':id/report')
  getReport(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.shifts.getReport(user.organizationId, id);
  }
}
