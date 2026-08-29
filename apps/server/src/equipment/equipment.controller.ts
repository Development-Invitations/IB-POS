import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { Role } from '@prisma/client';
import { EquipmentService } from './equipment.service';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

// Фото оборудования хранятся на диске, как и фото товаров (см. products.controller.ts) —
// не в базе, не в облаке (облачного хранилища у проекта пока нет, см. Этап 8).
const UPLOADS_DIR = join(process.cwd(), 'uploads', 'equipment');
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Раздел 3 ТЗ: «Оборудование» — Админ полный доступ, Управляющий и Кассир только просмотр
// статуса устройств, остальным ролям раздел не показывается вовсе.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('equipment')
export class EquipmentController {
  constructor(private readonly equipment: EquipmentService) {}

  @Roles(Role.ADMIN)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEquipmentDto,
  ) {
    return this.equipment.create(user.organizationId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.CASHIER)
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.equipment.findAll(user.organizationId);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateEquipmentDto,
  ) {
    return this.equipment.update(user.organizationId, id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.equipment.remove(user.organizationId, id);
  }

  @Roles(Role.ADMIN)
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
    return this.equipment.setImage(
      user.organizationId,
      id,
      `/uploads/equipment/${file.filename}`,
    );
  }
}
