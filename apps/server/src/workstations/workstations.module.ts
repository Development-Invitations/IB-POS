import { Module } from '@nestjs/common';
import { WorkstationsService } from './workstations.service';
import { WorkstationsController } from './workstations.controller';

@Module({
  providers: [WorkstationsService],
  controllers: [WorkstationsController],
})
export class WorkstationsModule {}
