import { Module } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { ReceiptsController } from './receipts.controller';
import { OutboxModule } from '../outbox/outbox.module';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [OutboxModule, StockModule],
  providers: [ReceiptsService],
  controllers: [ReceiptsController],
})
export class ReceiptsModule {}
