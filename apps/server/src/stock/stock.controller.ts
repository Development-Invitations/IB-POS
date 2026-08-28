import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { StockService } from './stock.service';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

// Остатки/склад — доступ по Разделу 3 ТЗ: полный у Зав. складом и Админа,
// просмотр у Управляющего и Бухгалтера, Кассиру не нужен вовсе.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('stock')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Roles(Role.ADMIN, Role.WAREHOUSE)
  @Post('receive')
  receive(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReceiveStockDto,
  ) {
    return this.stock.receive(user.organizationId, user.userId, dto);
  }

  @Roles(Role.ADMIN, Role.WAREHOUSE)
  @Post('adjust')
  adjust(@CurrentUser() user: AuthenticatedUser, @Body() dto: AdjustStockDto) {
    return this.stock.adjust(user.organizationId, user.userId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.WAREHOUSE, Role.ACCOUNTANT)
  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('storeId') storeId?: string,
  ) {
    return this.stock.findAll(user.organizationId, storeId);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.WAREHOUSE, Role.ACCOUNTANT)
  @Get('movements')
  findMovements(
    @CurrentUser() user: AuthenticatedUser,
    @Query('storeId') storeId?: string,
    @Query('productId') productId?: string,
  ) {
    return this.stock.findMovements(user.organizationId, storeId, productId);
  }
}
