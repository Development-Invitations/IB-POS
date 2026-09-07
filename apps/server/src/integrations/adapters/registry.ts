import { IntegrationProvider } from '@prisma/client';
import type { IntegrationAdapter } from './adapter.interface';
import { createMockAdapter } from './mock-adapter';
import { createRegosAdapter } from './regos-adapter';
import { FISCAL_PROVIDERS, type FiscalProvider } from './adapter.interface';

// Regos — единственный из пяти касс с подтверждённой публичной документацией на сегодня
// (docs.regos.uz), поэтому у него реальный адаптер; остальные (Epos, SmartPos, ArcaGroup,
// RahmatPos) остаются на честной симуляции до получения их реальных протоколов.
const adapters = new Map<FiscalProvider, IntegrationAdapter>(
  FISCAL_PROVIDERS.map((provider) => [
    provider,
    provider === IntegrationProvider.REGOS
      ? createRegosAdapter()
      : createMockAdapter(provider),
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
