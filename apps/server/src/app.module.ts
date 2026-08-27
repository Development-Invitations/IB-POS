import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { StoresModule } from './stores/stores.module';
import { WorkstationsModule } from './workstations/workstations.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { CustomersModule } from './customers/customers.module';
import { ShiftsModule } from './shifts/shifts.module';
import { OutboxModule } from './outbox/outbox.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { IntegrationsModule } from './integrations/integrations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    OrganizationsModule,
    StoresModule,
    WorkstationsModule,
    UsersModule,
    ProductsModule,
    CategoriesModule,
    CustomersModule,
    ShiftsModule,
    OutboxModule,
    ReceiptsModule,
    IntegrationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
