import { Module } from '@nestjs/common';
import { BackupsService } from './backups.service';
import { BackupsController } from './backups.controller';

@Module({
  providers: [BackupsService],
  controllers: [BackupsController],
})
export class BackupsModule {}
