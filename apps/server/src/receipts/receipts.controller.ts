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
import { ReceiptsService } from './receipts.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { PayReceiptDto } from './dto/pay-receipt.dto';
import { PreviewReceiptDto } from './dto/preview-receipt.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Roles(Role.ADMIN, Role.MANAGER, Role.CASHIER)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReceiptDto,
  ) {
    return this.receipts.create(user.organizationId, user.role, dto);
  }

  // Предпросчёт итога с учётом авто-скидок (без сохранения чека) — экран «Продажа» вызывает
  // это при каждом изменении корзины, чтобы кассир видел ту же сумму, что спишется при оплате.
  @Roles(Role.ADMIN, Role.MANAGER, Role.CASHIER)
  @Post('preview')
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PreviewReceiptDto,
  ) {
    return this.receipts.preview(
      user.organizationId,
      user.role,
      dto.items,
      dto.discountPercent,
    );
  }

  // Список чеков для поиска перед возвратом (экран «Возвраты») и для истории покупок клиента.
  @Roles(Role.ADMIN, Role.MANAGER, Role.CASHIER, Role.ACCOUNTANT)
  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('storeId') storeId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
  ) {
    return this.receipts.findAll(user.organizationId, {
      storeId,
      status,
      from,
      to,
      search,
    });
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.CASHIER, Role.ACCOUNTANT)
  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.receipts.findOne(user.organizationId, id);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.CASHIER)
  @Post(':id/pay')
  pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PayReceiptDto,
  ) {
    return this.receipts.pay(user.organizationId, user.userId, id, dto);
  }

  // Подтверждение возврата — права управляющего/администратора (см. Раздел 3 ТЗ и
  // клиентский ReturnConfirmModal, который пока проверяет PIN локально-заглушкой).
  @Roles(Role.ADMIN, Role.MANAGER)
  @Post(':id/return')
  returnReceipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.receipts.returnReceipt(user.organizationId, user.userId, id);
  }
}
