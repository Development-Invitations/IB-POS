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

// Строгий IPv4 (каждый октет 0–255) с необязательным портом через двоеточие — сетевые
// устройства можно честно проверить без реального драйвера (см. testConnection ниже).
const IP_PATTERN =
  /\b((?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})(?::(\d{1,5}))?\b/;

// "BT <имя устройства>" — второй проверяемый способ (см. EquipmentFormModal.tsx, режим
// "По Bluetooth"). COM-порт/модель и произвольный текст остаются на ручное подтверждение —
// для них честной проверки без реального драйвера нет.
const BT_PATTERN = /^BT\s+(.+)$/i;

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

// Windows-only: спрашиваем у диспетчера устройств, есть ли Bluetooth-устройство с таким именем
// в состоянии "OK". Ограничение честности: PnP-статус на Windows не всегда отличает "устройство
// сопряжено, но сейчас выключено/вне зоны" от "реально подключено прямо сейчас" — это тот же
// класс приближения, что и ping для IP, не гарантия работы устройства. Имя передаём отдельным
// аргументом процесса (через $args[0] в скрипте), а не подставляем в текст команды, чтобы
// свободный текст пользователя не мог быть интерпретирован как часть PowerShell-скрипта.
async function bluetoothProbe(name: string): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  const script =
    '$n = $args[0]; ' +
    'Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | ' +
    "Where-Object { $_.FriendlyName -like ('*' + $n + '*') -and $_.Status -eq 'OK' } | " +
    "Select-Object -First 1 | ForEach-Object { 'FOUND' }";
  try {
    const { stdout } = await execFileAsync('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
      name,
    ]);
    return stdout.includes('FOUND');
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

    const ipMatch = existing.connectionInfo?.match(IP_PATTERN);
    const btMatch = !ipMatch
      ? existing.connectionInfo?.match(BT_PATTERN)
      : undefined;

    if (!ipMatch && !btMatch) {
      throw new BadRequestException(
        'В параметрах подключения не найден ни IP-адрес, ни Bluetooth-устройство — автоматическая проверка доступна только для них. Для остальных отметьте подключение вручную.',
      );
    }

    let reachable: boolean;
    let successMessage: string;
    let failureMessage: string;

    if (ipMatch) {
      const host = ipMatch[1];
      const port = ipMatch[2] ? Number(ipMatch[2]) : undefined;
      reachable = port ? await tcpProbe(host, port) : await pingProbe(host);
      successMessage = port
        ? `Устройство отвечает на ${host}:${port}`
        : `${host} отвечает на ping`;
      failureMessage = port
        ? `Нет ответа от ${host}:${port}. Проверьте, что устройство включено, IP и порт указаны верно, и оно в одной сети с этим компьютером.`
        : `${host} не отвечает на ping. Проверьте, что устройство включено, IP указан верно, и оно в одной сети с этим компьютером.`;
    } else {
      const name = btMatch![1].trim();
      reachable = await bluetoothProbe(name);
      successMessage = `Bluetooth-устройство «${name}» подключено`;
      failureMessage =
        process.platform === 'win32'
          ? `Bluetooth-устройство «${name}» не найдено среди подключённых. Проверьте, что оно включено и сопряжено с этим компьютером.`
          : 'Автоматическая проверка Bluetooth поддерживается только на Windows. Отметьте подключение вручную.';
    }

    if (reachable) {
      const updated = await this.prisma.equipment.update({
        where: { id },
        data: { isConnected: true },
      });
      return { equipment: updated, reachable: true, message: successMessage };
    }

    return { equipment: existing, reachable: false, message: failureMessage };
  }
}
