# IB-POS

Кассовая система для бизнеса. Стек: Tauri + React + TypeScript + Tailwind (клиент), NestJS (backend), PostgreSQL, Device Agent.

Полное пошаговое ТЗ — [docs/Roadmap_TZ.md](docs/Roadmap_TZ.md).

## Структура монорепо

- `apps/client` — Tauri + React + TS + Tailwind, UI кассира
- `apps/server` — NestJS backend (локальный + облако)
- `apps/device-agent` — локальный сервис для оборудования (сканер, фискальный регистратор, денежный ящик, дисплей)
- `packages/shared` — общие типы/константы
- `packages/i18n` — словари RU / UZ (латиница) / ЎЗ (кириллица) + линтер на хардкод строк в UI

## Разработка

```bash
pnpm install

pnpm --filter @ib-pos/client dev      # клиент (Vite)
pnpm --filter @ib-pos/server start:dev # backend
pnpm --filter @ib-pos/device-agent dev # device agent

pnpm lint
pnpm typecheck
pnpm build
pnpm i18n:lint   # проверка на захардкоженные строки в apps/client/src
```
