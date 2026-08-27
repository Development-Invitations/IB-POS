import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IntegrationsService } from './integrations.service';
import { FiscalizationService } from './fiscalization.service';
import { ConnectIntegrationDto } from './dto/connect-integration.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly fiscalization: FiscalizationService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.integrations.findAll(user.organizationId);
  }

  @Post(':provider/connect')
  connect(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider') provider: string,
    @Body() dto: ConnectIntegrationDto,
  ) {
    return this.integrations.connect(user.organizationId, provider, dto);
  }

  @Post(':provider/test')
  test(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider') provider: string,
  ) {
    return this.integrations.testConnection(user.organizationId, provider);
  }

  // Ручной запуск воркера очереди фискализации — обычно тикает сам по @Interval,
  // эндпоинт нужен для тестирования и для кнопки "Синхронизировать сейчас" в UI.
  @Post('fiscalize/run')
  async runFiscalization() {
    const processed = await this.fiscalization.processPending();
    return { processed };
  }
}
