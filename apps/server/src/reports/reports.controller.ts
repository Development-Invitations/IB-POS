import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Roles(Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @Get('dashboard')
  getDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.reports.getDashboard(user.organizationId, {
      from,
      to,
      storeId,
    });
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @Get('export')
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('storeId') storeId?: string,
  ) {
    const csv = await this.reports.exportCsv(user.organizationId, {
      from,
      to,
      storeId,
    });
    res
      .status(200)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="report.csv"',
      })
      .send(csv);
  }

  // "Только по товарам/остаткам" — доступ Зав. складом (см. Раздел 3 ТЗ).
  @Roles(Role.ADMIN, Role.MANAGER, Role.WAREHOUSE)
  @Get('stock')
  getStockReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query('storeId') storeId?: string,
  ) {
    return this.reports.getStockReport(user.organizationId, storeId);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @Get('top-products')
  getTopProducts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.reports.getTopProducts(user.organizationId, {
      from,
      to,
      storeId,
    });
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @Get('staff')
  getStaffReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.reports.getStaffReport(user.organizationId, {
      from,
      to,
      storeId,
    });
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @Get('finance')
  getFinanceReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.reports.getFinanceReport(user.organizationId, {
      from,
      to,
      storeId,
    });
  }
}
