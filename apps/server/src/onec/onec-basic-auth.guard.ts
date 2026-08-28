import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { IntegrationProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// 1С не делает наш обычный JWT-логин — у обмена свои логин/токен, заданные в карточке
// интеграции "1С" (см. IntegrationsService). Проверяем HTTP Basic Auth против них.
@Injectable()
export class OneCBasicAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const organizationId = request.params.organizationId as string;

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
