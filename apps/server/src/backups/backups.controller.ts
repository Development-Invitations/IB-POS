import { Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { BackupTrigger, Role } from '@prisma/client';
import { BackupsService } from './backups.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('backups')
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Post('run')
  run(@CurrentUser() user: AuthenticatedUser) {
    return this.backups.createBackup(
      user.organizationId,
      BackupTrigger.MANUAL,
      user.userId,
    );
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.backups.findAll(user.organizationId);
  }

  @Get(':id/download')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const backup = await this.backups.getSnapshot(user.organizationId, id);
    res
      .status(200)
      .set({
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="backup-${id}.json"`,
      })
      .send(JSON.stringify(backup.snapshot, null, 2));
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.backups.restore(user.organizationId, id);
  }
}
