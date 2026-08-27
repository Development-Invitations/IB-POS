import { Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { OutboxController } from './outbox.controller';

@Module({
  providers: [OutboxService],
  controllers: [OutboxController],
  exports: [OutboxService],
})
export class OutboxModule {}
