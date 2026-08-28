import { Module } from '@nestjs/common';
import { OneCController } from './onec.controller';
import { OneCService } from './onec.service';
import { OneCBasicAuthGuard } from './onec-basic-auth.guard';

@Module({
  controllers: [OneCController],
  providers: [OneCService, OneCBasicAuthGuard],
})
export class OneCModule {}
