import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OutboxService } from './outbox.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('outbox')
export class OutboxController {
  constructor(private readonly outbox: OutboxService) {}

  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('pending')
  findPending(@CurrentUser() user: AuthenticatedUser) {
    return this.outbox.findPending(user.organizationId);
  }
}
