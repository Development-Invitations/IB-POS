import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ApiError,
  configureOneC,
  connectIntegration,
  getIntegrations,
  getOneCStatus,
  runFiscalizationQueue,
  testIntegration,
} from "../lib/api";
import type { ApiIntegration, FiscalProviderName, OneCCredentials, OneCStatus } from "../types/api";
import type { AuthSession } from "../types/auth";
import arcaGroupLogo from "../assets/integrations/arcagroup.svg";
import eposLogo from "../assets/integrations/epos.svg";
import rahmatPosLogo from "../assets/integrations/rahmatpos.svg";
import smartPosLogo from "../assets/integrations/smartpos.svg";
import regosLogo from "../assets/integrations/regos.png";
import onecLogo from "../assets/integrations/1c.png";

interface IntegrationsScreenProps {
  session: AuthSession;
}

// Лого касс, для которых оно предоставлено (см. apps/client/src/assets/integrations/) —
// показывается как есть на светлой карточке. Пока лого нет — цветная плашка с инициалами
// провайдера (как у Slack/Stripe для интеграций без загруженной иконки); заменяется на
// реальное лого по мере поступления.
const PROVIDER_META: Record<
  FiscalProviderName,
  { label: string; initials: string; color: string; logo?: string }
> = {
  REGOS: { label: "Regos", initials: "RG", color: "bg-slate-100", logo: regosLogo },
  EPOS: { label: "Epos", initials: "EP", color: "bg-teal-600", logo: eposLogo },
  SMARTPOS: { label: "SmartPOS", initials: "SP", color: "bg-slate-100", logo: smartPosLogo },
  ARCAGROUP: { label: "ArcaGroup", initials: "AG", color: "bg-slate-100", logo: arcaGroupLogo },
  RAHMATPOS: { label: "RahmatPOS", initials: "RP", color: "bg-slate-100", logo: rahmatPosLogo },
};

const CAN_MANAGE_ROLES: AuthSession["role"][] = ["ADMIN"];

export function IntegrationsScreen({ session }: IntegrationsScreenProps) {
  const { t } = useTranslation();
  const canManage = CAN_MANAGE_ROLES.includes(session.role);

  const [integrations, setIntegrations] = useState<ApiIntegration[]>([]);
  const [oneC, setOneC] = useState<OneCStatus | null>(null);
  const [oneCCredentials, setOneCCredentials] = useState<OneCCredentials | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  const [activeProvider, setActiveProvider] = useState<FiscalProviderName | null>(null);
  const [login, setLogin] = useState("");
  const [providerToken, setProviderToken] = useState("");
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerMessage, setProviderMessage] = useState<string | null>(null);

  const [queueBusy, setQueueBusy] = useState(false);
  const [queueMessage, setQueueMessage] = useState<string | null>(null);
  const [oneCBusy, setOneCBusy] = useState(false);

  // quiet=true — фоновое обновление после успешного действия (подключение/тест):
  // не должно прятать уже отрисованный экран за "Загрузка...", иначе карточки
  // дёргаются (пропадают и появляются заново) при каждом клике.
  async function load(quiet = false) {
    if (!quiet) setLoading(true);
    setLoadError(null);
    try {
      const [integrationList, oneCStatus] = await Promise.all([
        getIntegrations(session.accessToken),
        getOneCStatus(session.accessToken),
      ]);
      setIntegrations(integrationList);
      setOneC(oneCStatus);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setAccessDenied(true);
      } else {
        setLoadError(err instanceof ApiError ? err.message : t("integrations.loadError"));
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken]);

  function openProviderForm(provider: FiscalProviderName) {
    setActiveProvider(provider);
    setLogin("");
    setProviderToken("");
    setProviderMessage(null);
  }

  async function handleConnect() {
    if (!activeProvider) return;
    setProviderBusy(true);
    setProviderMessage(null);
    try {
      const result = await connectIntegration(session.accessToken, activeProvider, login.trim(), providerToken.trim());
      setProviderMessage(result.message ?? (result.success ? t("integrations.connected") : t("integrations.connectError")));
      if (result.success) {
        await load(true);
        setActiveProvider(null);
      }
    } catch (err) {
      setProviderMessage(err instanceof ApiError ? err.message : t("integrations.connectError"));
    } finally {
      setProviderBusy(false);
    }
  }

  async function handleTest(provider: FiscalProviderName) {
    setProviderBusy(true);
    setProviderMessage(null);
    try {
      const result = await testIntegration(session.accessToken, provider);
      setProviderMessage(result.message ?? (result.success ? t("integrations.testOk") : t("integrations.testError")));
    } catch (err) {
      setProviderMessage(err instanceof ApiError ? err.message : t("integrations.testError"));
    } finally {
      setProviderBusy(false);
    }
  }

  async function handleRunQueue() {
    setQueueBusy(true);
    setQueueMessage(null);
    try {
      const result = await runFiscalizationQueue(session.accessToken);
      setQueueMessage(t("integrations.queueProcessed", { count: result.processed }));
    } catch (err) {
      setQueueMessage(err instanceof ApiError ? err.message : t("integrations.queueError"));
    } finally {
      setQueueBusy(false);
    }
  }

  async function handleConfigureOneC() {
    setOneCBusy(true);
    try {
      const credentials = await configureOneC(session.accessToken);
      setOneCCredentials(credentials);
      // Ответ уже содержит всё нужное — полный рефетч не нужен, обновляем статус на месте.
      setOneC({
        isConnected: true,
        login: credentials.login,
        exchangePath: credentials.exchangePath,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // ошибку молча игнорируем — кнопка остаётся доступной для повтора
    } finally {
      setOneCBusy(false);
    }
  }

  if (accessDenied) {
    return (
      <div className="mx-auto max-w-md pt-16 text-center">
        <p className="text-sm text-slate-500">{t("integrations.accessDenied")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-800">{t("nav.integrations")}</h1>

      {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}
      {loadError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{loadError}</p>}

      {!loading && !loadError && (
        <>
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">{t("integrations.kassaTitle")}</h2>
              {canManage && (
                <button
                  onClick={handleRunQueue}
                  disabled={queueBusy}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-accent/40 hover:text-accent disabled:opacity-40"
                >
                  {queueBusy ? t("common.loading") : t("integrations.runQueue")}
                </button>
              )}
            </div>
            {queueMessage && <p className="text-xs text-slate-500">{queueMessage}</p>}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {integrations.map((integration) => {
                const meta = PROVIDER_META[integration.provider];
                return (
                  <div key={integration.provider} className="rounded-xl bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      {meta.logo ? (
                        <img
                          src={meta.logo}
                          alt={meta.label}
                          className="h-8 max-w-[88px] shrink-0 object-contain object-left"
                        />
                      ) : (
                        <span
                          className={`flex h-10 w-16 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${meta.color}`}
                        >
                          {meta.initials}
                        </span>
                      )}
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-slate-800">{meta.label}</div>
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${integration.isConnected ? "bg-emerald-500" : "bg-slate-300"}`}
                          />
                          {integration.isConnected ? t("integrations.connected") : t("integrations.notConnected")}
                        </div>
                      </div>
                    </div>

                    {canManage && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => openProviderForm(integration.provider)}
                          className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-semibold text-slate-600 hover:border-accent/40 hover:text-accent"
                        >
                          {integration.isConnected ? t("integrations.reconfigure") : t("integrations.configure")}
                        </button>
                        {integration.isConnected && (
                          <button
                            onClick={() => handleTest(integration.provider)}
                            disabled={providerBusy}
                            className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-semibold text-slate-600 hover:border-accent/40 hover:text-accent disabled:opacity-40"
                          >
                            {t("integrations.testConnection")}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <img src={onecLogo} alt="1C" className="h-10 max-w-[64px] shrink-0 object-contain object-left" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-800">{t("integrations.onecTitle")}</div>
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${oneC?.isConnected ? "bg-emerald-500" : "bg-slate-300"}`}
                  />
                  {oneC?.isConnected ? t("integrations.connected") : t("integrations.notConnected")}
                </div>
              </div>
              {canManage && (
                <button
                  onClick={handleConfigureOneC}
                  disabled={oneCBusy}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-accent/40 hover:text-accent disabled:opacity-40"
                >
                  {oneCBusy ? t("common.loading") : t("integrations.generateOnec")}
                </button>
              )}
            </div>

            {oneC?.exchangePath && (
              <p className="mt-3 text-xs text-slate-400">
                {t("integrations.exchangePath")}: <span className="font-mono text-slate-600">{oneC.exchangePath}</span>
              </p>
            )}

            {oneCCredentials && (
              <div className="mt-3 space-y-1 rounded-lg border border-accent/30 bg-accent/5 px-3 py-3 text-xs">
                <p className="text-slate-500">{t("integrations.onecHint")}</p>
                <div>
                  {t("auth.login")}: <span className="font-mono font-semibold text-slate-800">{oneCCredentials.login}</span>
                </div>
                <div>
                  {t("integrations.token")}: <span className="font-mono font-semibold text-slate-800">{oneCCredentials.token}</span>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {activeProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-800">{PROVIDER_META[activeProvider].label}</h2>
            </div>
            <div className="space-y-3 px-5 py-4">
              <label className="block text-xs font-medium text-slate-500">
                {t("auth.login")}
                <input
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  autoFocus
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
              <label className="block text-xs font-medium text-slate-500">
                {t("integrations.token")}
                <input
                  value={providerToken}
                  onChange={(e) => setProviderToken(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
              {providerMessage && <p className="text-xs text-slate-500">{providerMessage}</p>}
            </div>
            <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
              <button
                onClick={() => setActiveProvider(null)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50"
              >
                {t("returns.cancel")}
              </button>
              <button
                onClick={handleConnect}
                disabled={providerBusy || !login.trim() || !providerToken.trim()}
                className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
              >
                {providerBusy ? t("common.loading") : t("integrations.connect")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
