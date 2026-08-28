import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from "@ib-pos/i18n";
import { ApiError, getBackups, getProductsCsv, getSettings, runBackup, updateSettings } from "../lib/api";
import { loadShowProductImages, saveShowProductImages } from "../lib/preferences";
import type { ApiBackup, ApiSettings } from "../types/api";
import type { AuthSession } from "../types/auth";

interface SettingsScreenProps {
  session: AuthSession;
}

type Tab = "general" | "sale" | "discounts" | "receipts" | "notifications";

const CAN_MANAGE_ROLES: AuthSession["role"][] = ["ADMIN"];
const TABS: Tab[] = ["general", "sale", "discounts", "receipts", "notifications"];
const CURRENCIES = ["UZS", "USD"];

export function SettingsScreen({ session }: SettingsScreenProps) {
  const { t, i18n } = useTranslation();
  const canManage = CAN_MANAGE_ROLES.includes(session.role);

  const [tab, setTab] = useState<Tab>("general");
  const [settings, setSettings] = useState<ApiSettings | null>(null);
  const [backups, setBackups] = useState<ApiBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("UZS");
  const [defaultLanguage, setDefaultLanguage] = useState("ru");
  const [taxRatePercent, setTaxRatePercent] = useState("");
  const [showProductImages, setShowProductImages] = useState(loadShowProductImages());

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    if (!canManage) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const [settingsResult, backupList] = await Promise.all([
          getSettings(session.accessToken),
          getBackups(session.accessToken),
        ]);
        if (cancelled) return;
        setSettings(settingsResult);
        setBackups(backupList);
        setName(settingsResult.name);
        setCurrency(settingsResult.currency);
        setDefaultLanguage(settingsResult.defaultLanguage);
        setTaxRatePercent(settingsResult.taxRatePercent ?? "");
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 403) {
            setAccessDenied(true);
          } else {
            setLoadError(err instanceof ApiError ? err.message : t("settings.loadError"));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken]);

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const updated = await updateSettings(session.accessToken, {
        name: name.trim(),
        currency,
        defaultLanguage,
        taxRatePercent: taxRatePercent === "" ? undefined : Number(taxRatePercent),
      });
      setSettings(updated);
      setSaveMessage(t("settings.saved"));
    } catch (err) {
      setSaveMessage(err instanceof ApiError ? err.message : t("settings.saveError"));
    } finally {
      setSaving(false);
    }
  }

  function handleToggleImages(value: boolean) {
    setShowProductImages(value);
    saveShowProductImages(value);
  }

  async function handleCreateBackup() {
    setBackupBusy(true);
    try {
      const backup = await runBackup(session.accessToken);
      setBackups((prev) => [backup, ...prev]);
    } catch {
      // не критично — кнопка остаётся доступной для повтора
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleExportCsv() {
    setExportBusy(true);
    try {
      const csv = await getProductsCsv(session.accessToken);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "products.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // не критично
    } finally {
      setExportBusy(false);
    }
  }

  if (accessDenied) {
    return (
      <div className="mx-auto max-w-md pt-16 text-center">
        <p className="text-sm text-slate-500">{t("settings.accessDenied")}</p>
      </div>
    );
  }

  const lastBackup = backups[0];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">{t("nav.settings")}</h1>

      <div className="flex flex-wrap gap-2 rounded-lg bg-slate-100 p-1">
        {TABS.map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              tab === tabKey ? "bg-accent text-white" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t(`settings.tabs.${tabKey}`)}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}
      {loadError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{loadError}</p>}

      {!loading && !loadError && tab === "general" && settings && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
            <label className="block text-xs font-medium text-slate-500">
              {t("settings.companyName")}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-slate-500">
                {t("settings.currency")}
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-500">
                {t("settings.language")}
                <select
                  value={defaultLanguage}
                  onChange={(e) => {
                    setDefaultLanguage(e.target.value);
                    i18n.changeLanguage(e.target.value);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  {SUPPORTED_LOCALES.map((locale: Locale) => (
                    <option key={locale} value={locale}>
                      {LOCALE_LABELS[locale]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-xs font-medium text-slate-500">
              {t("settings.taxRate")}
              <input
                type="number"
                min={0}
                max={100}
                value={taxRatePercent}
                onChange={(e) => setTaxRatePercent(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>

            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-sm text-slate-600">{t("settings.showProductImages")}</span>
              <button
                role="switch"
                aria-checked={showProductImages}
                onClick={() => handleToggleImages(!showProductImages)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ease-in-out ${
                  showProductImages ? "bg-accent" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 block h-5 w-5 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-200 ease-in-out ${
                    showProductImages ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {settings.warnings.length > 0 && (
              <div className="space-y-1 rounded-lg bg-amber-50 px-3 py-2">
                {settings.warnings.map((w) => (
                  <p key={w} className="text-xs text-amber-700">
                    {w}
                  </p>
                ))}
              </div>
            )}

            {saveMessage && <p className="text-xs text-slate-500">{saveMessage}</p>}

            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
            >
              {saving ? t("common.loading") : t("settings.save")}
            </button>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">{t("settings.backupTitle")}</h3>
              <p className="text-xs text-slate-400">
                {lastBackup
                  ? `${t("settings.lastBackup")}: ${new Date(lastBackup.createdAt).toLocaleString("ru-RU")}`
                  : t("settings.noBackups")}
              </p>
              <button
                onClick={handleCreateBackup}
                disabled={backupBusy}
                className="mt-3 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                {backupBusy ? t("common.loading") : t("settings.createBackup")}
              </button>
            </div>

            <div className="rounded-xl bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">{t("settings.exportTitle")}</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleExportCsv}
                  disabled={exportBusy}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  {exportBusy ? t("common.loading") : t("settings.exportCsv")}
                </button>
                <button
                  onClick={() => window.print()}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  {t("settings.printSettings")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && !loadError && ["sale", "discounts", "receipts", "notifications"].includes(tab) && (
        <div className="rounded-xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-400">{t("settings.tabNotReady")}</p>
        </div>
      )}
    </div>
  );
}
