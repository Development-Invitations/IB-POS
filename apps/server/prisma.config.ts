import "dotenv/config";
import { defineConfig } from "prisma/config";

// env("DATABASE_URL") (строгий хелпер Prisma) кидает PrismaConfigEnvError, если переменная не
// резолвится вообще — локально это маскировалось тем, что apps/server/.env (не в git) всегда
// задавал реальный DATABASE_URL. В CI/Release workflow'ах .env нет и DATABASE_URL нигде не
// задан, а `prisma generate` (теперь запускается автоматически через postinstall, см.
// package.json) для генерации типов реальное подключение к БД не открывает — упал сам "pnpm
// install" с "Cannot resolve environment variable: DATABASE_URL". Заглушка ниже удовлетворяет
// синтаксическую проверку конфига, не требуя реальной БД для одной только генерации клиента.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://user:password@localhost:5432/ib_pos",
  },
});
