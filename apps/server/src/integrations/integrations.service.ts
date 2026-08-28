import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { IntegrationProvider, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  FISCAL_PROVIDERS,
  type FiscalProvider,
} from './adapters/adapter.interface';
import { getAdapter, isFiscalProvider } from './adapters/registry';
import { ConnectIntegrationDto } from './dto/connect-integration.dto';
import { ConfigureOneCDto } from './dto/configure-onec.dto';

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

  // 1С не подключаем изнутри (нет адаптера, который бы "звонил" наружу) — наоборот, 1С сама
  // обращается к нашему /onec/:organizationId/exchange с этими логином/токеном (Basic Auth).
  // См. apps/server/src/onec — реализация протокола "Обмен с сайтом" (CommerceML 2).
  async configureOneC(organizationId: string, dto: ConfigureOneCDto) {
    const login = dto.login ?? `ib_pos_${organizationId.slice(0, 8)}`;
    const token = dto.token ?? randomBytes(16).toString('hex');

    const integration = await this.prisma.integration.upsert({
      where: {
        organizationId_provider: {
          organizationId,
          provider: IntegrationProvider.ONEC,
        },
      },
      create: {
        organizationId,
        provider: IntegrationProvider.ONEC,
        config: { login, token },
        isConnected: true,
      },
      update: { config: { login, token }, isConnected: true },
    });

    return {
      login,
      token,
      exchangePath: `/onec/${organizationId}/exchange`,
      integration,
    };
  }

  async getOneC(organizationId: string) {
    const integration = await this.prisma.integration.findUnique({
      where: {
        organizationId_provider: {
          organizationId,
          provider: IntegrationProvider.ONEC,
        },
      },
    });

    const config = (integration?.config as { login?: string } | null) ?? null;
    return {
      isConnected: integration?.isConnected ?? false,
      login: config?.login ?? null,
      exchangePath: `/onec/${organizationId}/exchange`,
      updatedAt: integration?.updatedAt ?? null,
    };
  }
}
