import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ImportProductsCsvDto } from './dto/import-products-csv.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

// Фото товаров хранятся на диске (не в базе — см. Product.imageUrl), не в облаке: облачного
// хранилища у проекта пока нет (см. Этап 8, sync-worker). Каталог создаётся один раз при
// старте процесса.
const UPLOADS_DIR = join(process.cwd(), 'uploads', 'products');
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Roles(Role.ADMIN, Role.MANAGER, Role.WAREHOUSE)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductDto,
  ) {
    return this.products.create(user.organizationId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.products.findAll(user.organizationId);
  }

  // Должно идти раньше @Get(':id'), иначе "export" попадёт в параметр :id.
  @Get('export')
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const csv = await this.products.exportCsv(user.organizationId);
    res
      .status(200)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="products.csv"',
      })
      .send(csv);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.WAREHOUSE)
  @Post('import')
  importCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportProductsCsvDto,
  ) {
    return this.products.importCsv(user.organizationId, dto.csv);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.products.findOne(user.organizationId, id);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.WAREHOUSE)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(user.organizationId, id, dto);
  }

  // Клиент уменьшает фото до превью размером через canvas перед отправкой (см.
  // apps/client ProductFormModal), но лимит на бэкенде — не доверяем клиенту.
  @Roles(Role.ADMIN, Role.MANAGER, Role.WAREHOUSE)
  @Post(':id/image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 3 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
          cb(
            new BadRequestException('Допустимы только JPEG, PNG, WEBP'),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Файл не передан');
    }
    return this.products.setImage(
      user.organizationId,
      id,
      `/uploads/products/${file.filename}`,
    );
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.WAREHOUSE)
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.products.remove(user.organizationId, id);
  }
}
