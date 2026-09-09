import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Role } from '@prisma/client';
import { AiService } from './ai.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

const ALLOWED_INVOICE_MIME =
  /^(image\/(jpeg|png|webp)|application\/pdf|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|application\/vnd\.ms-excel)$/;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly audit: AuditService,
  ) {}

  // Не из исходного ТЗ — по прямому запросу клиента: чтение накладной (фото/PDF/Excel) через
  // ИИ-ассистента, создание товаров по извлечённым позициям (см. план в
  // C:\Users\user\.claude\plans\quizzical-dazzling-stardust.md, этап 2, расширенный на
  // PDF/Excel). Файл держим в памяти (memoryStorage) — на диск не пишем, он нужен только на
  // время одного запроса к Claude.
  @Roles(Role.ADMIN, Role.MANAGER, Role.WAREHOUSE)
  @Post('invoice/extract')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_INVOICE_MIME.test(file.mimetype)) {
          cb(
            new BadRequestException(
              'Допустимы фото (JPEG/PNG/WEBP), PDF или Excel (XLSX/XLS)',
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  async extractInvoice(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Файл не передан');
    }
    const result = await this.ai.extractInvoice(file);
    await this.audit.log(
      user.organizationId,
      user.userId,
      'ai.invoice.extract',
      'Invoice',
      undefined,
      {
        filename: file.originalname,
        mimetype: file.mimetype,
        itemCount: result.items.length,
      },
    );
    return result;
  }
}
