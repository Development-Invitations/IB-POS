import { IntegrationProvider } from '@prisma/client';
import type { IntegrationAdapter } from './adapter.interface';
import { createMockAdapter } from './mock-adapter';
import { createRegosAdapter } from './regos-adapter';
import { createEposAdapter } from './epos-adapter';
import { FISCAL_PROVIDERS, type FiscalProvider } from './adapter.interface';

// Regos и Epos — единственные из пяти касс с подтверждённой документацией на сегодня
// (docs.regos.uz, Postman-коллекция клиента на Epos "Universal Communicator"), поэтому у них
// реальные адаптеры; SmartPos/ArcaGroup/RahmatPos остаются на честной симуляции до получения
// их реальных протоколов.
const REAL_ADAPTERS: Partial<Record<FiscalProvider, () => IntegrationAdapter>> =
  {
    [IntegrationProvider.REGOS]: createRegosAdapter,
    [IntegrationProvider.EPOS]: createEposAdapter,
  };

const adapters = new Map<FiscalProvider, IntegrationAdapter>(
  FISCAL_PROVIDERS.map((provider) => [
    provider,
    (REAL_ADAPTERS[provider] ?? (() => createMockAdapter(provider)))(),
  ]),
);

export function isFiscalProvider(
  provider: IntegrationProvider,
): provider is FiscalProvider {
  return (FISCAL_PROVIDERS as readonly IntegrationProvider[]).includes(
    provider,
  );
}

export function getAdapter(provider: FiscalProvider): IntegrationAdapter {
  const adapter = adapters.get(provider);
  if (!adapter) {
    throw new Error(`Нет адаптера для провайдера ${provider}`);
  }
  return adapter;
}
