import { BadRequestException, Injectable } from '@nestjs/common';
import { IntegrationProvider, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  FISCAL_PROVIDERS,
  type FiscalProvider,
} from './adapters/adapter.interface';
import { getAdapter, isFiscalProvider } from './adapters/registry';
import { ConnectIntegrationDto } from './dto/connect-integration.dto';

function assertFiscalProvider(provider: string): FiscalProvider {
  if (
    !Object.values(IntegrationProvider).includes(
      provider as IntegrationProvider,
    )
  ) {
    throw new BadRequestException(`Неизвестный провайдер: ${provider}`);
  }
  const typed = provider as IntegrationProvider;
  if (!isFiscalProvider(typed)) {
    throw new BadRequestException(
      `${provider} не является кассовой интеграцией`,
    );
  }
  return typed;
}

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  // Показываем и уже подключённые, и ещё доступные провайдеры — как в макете
  // (разделы "Активные интеграции" / "Доступные интеграции").
  async findAll(organizationId: string) {
    const connected = await this.prisma.integration.findMany({
      where: { organizationId },
    });
    const connectedByProvider = new Map(connected.map((i) => [i.provider, i]));

    return FISCAL_PROVIDERS.map((provider) => {
      const existing = connectedByProvider.get(provider);
      return {
        provider,
        isConnected: existing?.isConnected ?? false,
        config: existing?.config ?? null,
        updatedAt: existing?.updatedAt ?? null,
      };
    });
  }

  async connect(
    organizationId: string,
    providerParam: string,
    dto: ConnectIntegrationDto,
  ) {
    const provider = assertFiscalProvider(providerParam);
    const adapter = getAdapter(provider);
    const config = dto.config ?? {};

    const result = await adapter.connect(config);

    const integration = await this.prisma.integration.upsert({
      where: { organizationId_provider: { organizationId, provider } },
      create: {
        organizationId,
        provider,
        config: config as Prisma.InputJsonValue,
        isConnected: result.success,
      },
      update: {
        config: config as Prisma.InputJsonValue,
        isConnected: result.success,
      },
    });

    return { ...result, integration };
  }

  async testConnection(organizationId: string, providerParam: string) {
    const provider = assertFiscalProvider(providerParam);
    const adapter = getAdapter(provider);

    const integration = await this.prisma.integration.findUnique({
      where: { organizationId_provider: { organizationId, provider } },
    });
    if (!integration) {
      throw new BadRequestException('Интеграция не настроена');
    }

    const config = (integration.config as Record<string, unknown>) ?? {};
    return adapter.testConnection(config);
  }
}
