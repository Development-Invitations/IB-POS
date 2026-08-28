import {
  All,
  Controller,
  Header,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { OneCService } from './onec.service';
import { OneCBasicAuthGuard } from './onec-basic-auth.guard';

// Реализация "Протокола обмена с сайтом" 1С (CommerceML 2) — базовый режим (Этап 6):
// https://v8.1c.ru/tekhnologii/obmen-dannymi-i-integratsiya/standarty-i-formaty/protokol-obmena-s-saytom/
// 1С сама вызывает этот единственный URL с разными query-параметрами type/mode — так устроен
// протокол, отдельные REST-эндпоинты под каждый шаг тут не подойдут.
@UseGuards(OneCBasicAuthGuard)
@Controller('onec/:organizationId/exchange')
export class OneCController {
  constructor(private readonly onec: OneCService) {}

  @All()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async exchange(
    @Param('organizationId') organizationId: string,
    @Query('type') type: string,
    @Query('mode') mode: string,
    @Query('filename') filename: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      const body = await this.handle(organizationId, type, mode, filename, req);
      res.status(200).send(body);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Неизвестная ошибка';
      res.status(200).send(`failure\n${message}`);
    }
  }

  private async handle(
    organizationId: string,
    type: string,
    mode: string,
    filename: string | undefined,
    req: Request,
  ): Promise<string> {
    if (mode === 'checkauth') {
      // Basic Auth уже проверен гардом; куки протоколу нужны формально — авторизацию
      // на каждый запрос всё равно перепроверяет гард, состояние сессии нам не критично.
      return 'success\nib_pos_session\nok';
    }

    if (mode === 'init') {
      return this.onec.getInitResponse();
    }

    if (type === 'catalog' && mode === 'file') {
      if (!filename) throw new Error('Не передан filename');
      // Body — Buffer, потому что для пути /onec подключён express.raw() (см. main.ts):
      // 1С шлёт файл с произвольным/пустым Content-Type, обычный JSON body-parser его не ловит.
      const content = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      this.onec.saveFile(organizationId, filename, content);
      return 'success';
    }

    if (type === 'catalog' && mode === 'import') {
      if (!filename) throw new Error('Не передан filename');
      await this.onec.importFile(organizationId, filename);
      return 'success';
    }

    if (type === 'sale' && mode === 'query') {
      const { xml } = await this.onec.buildSalesDocument(organizationId);
      return xml;
    }

    if (type === 'sale' && mode === 'success') {
      await this.onec.confirmExport(organizationId);
      return 'success';
    }

    throw new Error(`Неподдерживаемая комбинация type=${type}&mode=${mode}`);
  }
}
