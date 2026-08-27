import { IntegrationProvider } from '@prisma/client';
import type { IntegrationAdapter } from './adapter.interface';
import { createMockAdapter } from './mock-adapter';
import { FISCAL_PROVIDERS, type FiscalProvider } from './adapter.interface';

const adapters = new Map<FiscalProvider, IntegrationAdapter>(
  FISCAL_PROVIDERS.map((provider) => [provider, createMockAdapter(provider)]),
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
