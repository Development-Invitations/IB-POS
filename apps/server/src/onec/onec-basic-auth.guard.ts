import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { IntegrationProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// 1С не делает наш обычный JWT-логин — у обмена свои логин/токен, заданные в карточке
// интеграции "1С" (см. IntegrationsService). Проверяем HTTP Basic Auth против них.
@Injectable()
export class OneCBasicAuthGuard implements CanActivate {
  private readonly logger = new Logger(OneCBasicAuthGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const organizationId = request.params.organizationId as string;

    // Не из исходного ТЗ: при внедрении у клиента "не подключается" почти всегда сводится к
    // одному из трёх — запрос вообще не доходит (сеть/прокси/адрес), доходит без Authorization
    // (1С настроена неверно), или доходит с неверными кредами (логин/токен разошлись с тем, что
    // выдано в карточке интеграции). Эта пара строк логов сразу показывает, какой из трёх случай.
    this.logger.log(
      `1С exchange запрос: ${request.method} ${request.originalUrl} | Authorization: ${request.headers.authorization ? 'есть' : 'ОТСУТСТВУЕТ'}`,
    );

    const credentials = parseBasicAuth(request.headers.authorization);
    if (!credentials) {
      throw new UnauthorizedException('Требуется Basic Auth');
    }

    const integration = await this.prisma.integration.findUnique({
      where: {
        organizationId_provider: {
          organizationId,
          provider: IntegrationProvider.ONEC,
        },
      },
    });

    const config = (integration?.config as Record<string, unknown>) ?? {};
    if (
      !integration?.isConnected ||
      config.login !== credentials.login ||
      config.token !== credentials.token
    ) {
      this.logger.warn(
        `1С exchange: неверные креды для org=${organizationId}, login=${credentials.login}`,
      );
      throw new UnauthorizedException('Неверный логин или токен обмена с 1С');
    }

    request.organizationId = organizationId;
    return true;
  }
}

function parseBasicAuth(
  header: string | undefined,
): { login: string; token: string } | null {
  if (!header?.startsWith('Basic ')) return null;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) return null;
  return {
    login: decoded.slice(0, separatorIndex),
    token: decoded.slice(separatorIndex + 1),
  };
}
