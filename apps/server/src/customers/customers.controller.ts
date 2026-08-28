import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { AdjustBonusDto } from './dto/adjust-bonus.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Roles(Role.ADMIN, Role.MANAGER, Role.CASHIER)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customers.create(user.organizationId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.CASHIER, Role.ACCOUNTANT)
  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
  ) {
    return this.customers.findAll(user.organizationId, search);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.CASHIER)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(user.organizationId, id, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.CASHIER)
  @Post(':id/bonus')
  adjustBonus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AdjustBonusDto,
  ) {
    return this.customers.adjustBonus(user.organizationId, id, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.CASHIER, Role.ACCOUNTANT)
  @Get(':id/receipts')
  findPurchaseHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.customers.findPurchaseHistory(user.organizationId, id);
  }
}
