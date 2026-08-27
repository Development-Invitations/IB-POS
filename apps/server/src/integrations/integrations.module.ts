import { Module } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { FiscalizationService } from './fiscalization.service';

@Module({
  providers: [IntegrationsService, FiscalizationService],
  controllers: [IntegrationsController],
  exports: [FiscalizationService],
})
export class IntegrationsModule {}
