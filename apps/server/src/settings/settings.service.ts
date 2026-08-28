import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FISCAL_PROVIDERS } from '../integrations/adapters/adapter.interface';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(organizationId: string) {
    const [organization, settings, hasFiscalIntegration] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
      }),
      this.prisma.organizationSettings.upsert({
        where: { organizationId },
        create: { organizationId },
        update: {},
      }),
      this.prisma.integration.findFirst({
        where: {
          organizationId,
          isConnected: true,
          provider: { in: [...FISCAL_PROVIDERS] },
        },
      }),
    ]);

    return {
      name: organization.name,
      currency: settings.currency,
      defaultLanguage: settings.defaultLanguage,
      taxRatePercent: settings.taxRatePercent,
      autoBackupEnabled: settings.autoBackupEnabled,
      warnings: this.buildTaxWarnings(
        settings.taxRatePercent,
        Boolean(hasFiscalIntegration),
      ),
    };
  }

  // Налоги и фискализация: предупреждения при несовместимых параметрах (Этап 9).
  private buildTaxWarnings(
    taxRatePercent: unknown,
    hasFiscalIntegration: boolean,
  ): string[] {
    const warnings: string[] = [];

    if (taxRatePercent === null || taxRatePercent === undefined) {
      warnings.push(
        'Не указана налоговая ставка — фискализация чеков будет использовать значение по умолчанию',
      );
    }
    if (
      taxRatePercent !== null &&
      taxRatePercent !== undefined &&
      !hasFiscalIntegration
    ) {
      warnings.push(
        'Налоговая ставка задана, но ни одна касса для фискализации не подключена (см. раздел Интеграции)',
      );
    }

    return warnings;
  }

  async update(organizationId: string, dto: UpdateSettingsDto) {
    if (dto.name) {
      await this.prisma.organization.update({
        where: { id: organizationId },
        data: { name: dto.name },
      });
    }

    await this.prisma.organizationSettings.upsert({
      where: { organizationId },
      create: {
        organizationId,
        currency: dto.currency,
        defaultLanguage: dto.defaultLanguage,
        taxRatePercent: dto.taxRatePercent,
        autoBackupEnabled: dto.autoBackupEnabled,
      },
      update: {
        currency: dto.currency,
        defaultLanguage: dto.defaultLanguage,
        taxRatePercent: dto.taxRatePercent,
        autoBackupEnabled: dto.autoBackupEnabled,
      },
    });

    return this.get(organizationId);
  }
}
