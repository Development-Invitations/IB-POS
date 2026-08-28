import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  // 1С шлёт XML-файлы через POST с произвольным/пустым Content-Type (не application/json) —
  // стандартный body-parser Nest их не разбирает и не сохраняет, тело теряется. Ловим сырые
  // байты явно для этого пути (apps/server/src/onec) до основных JSON/urlencoded парсеров.
  app.use('/onec', express.raw({ type: () => true, limit: '10mb' }));

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
