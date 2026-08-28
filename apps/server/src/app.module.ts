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
import { OneCModule } from './onec/onec.module';
import { DiscountsModule } from './discounts/discounts.module';
import { AuditModule } from './audit/audit.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { BackupsModule } from './backups/backups.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
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
    OneCModule,
    DiscountsModule,
    ReportsModule,
    SettingsModule,
    BackupsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
