import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { Socket } from 'net';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';

const execFileAsync = promisify(execFile);

// Строгий IPv4 (каждый октет 0–255) с необязательным портом через двоеточие — единственный
// способ подключения, который можно честно проверить без реального драйвера устройства
// (см. testConnection ниже). COM-порт/модель и т.п. остаются на ручное подтверждение админом.
const IP_PATTERN =
  /\b((?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})(?::(\d{1,5}))?\b/;

function tcpProbe(
  host: string,
  port: number,
  timeoutMs = 2500,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function pingProbe(host: string): Promise<boolean> {
  const args =
    process.platform === 'win32'
      ? ['-n', '1', '-w', '2000', host]
      : ['-c', '1', '-W', '2', host];
  try {
    await execFileAsync('ping', args);
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class EquipmentService {
  constructor(private readonly prisma: PrismaService) {}

  create(organizationId: string, dto: CreateEquipmentDto) {
    return this.prisma.equipment.create({ data: { ...dto, organizationId } });
  }

  findAll(organizationId: string) {
    return this.prisma.equipment.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(organizationId: string, id: string, dto: UpdateEquipmentDto) {
    const existing = await this.prisma.equipment.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Оборудование не найдено');
    }
    return this.prisma.equipment.update({ where: { id }, data: dto });
  }

  async remove(organizationId: string, id: string) {
    const existing = await this.prisma.equipment.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Оборудование не найдено');
    }
    await this.prisma.equipment.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async setImage(organizationId: string, id: string, imageUrl: string) {
    const existing = await this.prisma.equipment.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Оборудование не найдено');
    }
    const updated = await this.prisma.equipment.update({
      where: { id },
      data: { imageUrl },
    });

    // Старый файл больше не нужен — иначе каждая замена фото копит мёртвые файлы на диске.
    if (existing.imageUrl && existing.imageUrl !== imageUrl) {
      const oldPath = join(process.cwd(), existing.imageUrl.replace(/^\//, ''));
      if (existsSync(oldPath)) {
        unlinkSync(oldPath);
      }
    }

    return updated;
  }

  async testConnection(organizationId: string, id: string) {
    const existing = await this.prisma.equipment.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Оборудование не найдено');
    }

    const match = existing.connectionInfo?.match(IP_PATTERN);
    if (!match) {
      throw new BadRequestException(
        'В параметрах подключения не найден IP-адрес — автоматическая проверка доступна только для сетевых устройств. Для остальных отметьте подключение вручную.',
      );
    }
    const host = match[1];
    const port = match[2] ? Number(match[2]) : undefined;

    const reachable = port ? await tcpProbe(host, port) : await pingProbe(host);

    if (reachable) {
      const updated = await this.prisma.equipment.update({
        where: { id },
        data: { isConnected: true },
      });
      return {
        equipment: updated,
        reachable: true,
        message: port
          ? `Устройство отвечает на ${host}:${port}`
          : `${host} отвечает на ping`,
      };
    }

    return {
      equipment: existing,
      reachable: false,
      message: port
        ? `Нет ответа от ${host}:${port}. Проверьте, что устройство включено, IP и порт указаны верно, и оно в одной сети с этим компьютером.`
        : `${host} не отвечает на ping. Проверьте, что устройство включено, IP указан верно, и оно в одной сети с этим компьютером.`,
    };
  }
}
