import { IntegrationProvider } from '@prisma/client';
import type { IntegrationAdapter } from './adapter.interface';
import { createMockAdapter } from './mock-adapter';
import { createRegosAdapter } from './regos-adapter';
import { createEposAdapter } from './epos-adapter';
import { createRahmatPosAdapter } from './rahmatpos-adapter';
import { FISCAL_PROVIDERS, type FiscalProvider } from './adapter.interface';

// Regos, Epos и RahmatPos — три из четырёх касс (см. FISCAL_PROVIDERS — SMARTPOS убран
// 2026-09-07) с подтверждённой документацией на сегодня, поэтому у них реальные адаптеры;
// ArcaGroup остаётся на честной симуляции до получения его реального протокола.
const REAL_ADAPTERS: Partial<Record<FiscalProvider, () => IntegrationAdapter>> =
  {
    [IntegrationProvider.REGOS]: createRegosAdapter,
    [IntegrationProvider.EPOS]: createEposAdapter,
    [IntegrationProvider.RAHMATPOS]: createRahmatPosAdapter,
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
