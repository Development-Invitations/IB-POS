import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from "@ib-pos/i18n";
import {
  ApiError,
  clearHistory,
  clearMarkingCache,
  createProduct,
  downloadBackup,
  getBackups,
  getProducts,
  getProductsCsv,
  getSettings,
  runBackup,
  updateProduct,
  updateSettings,
  type ClearHistoryResult,
  type ClearMarkingCacheResult,
} from "../lib/api";
import { loadShowProductImages, saveShowProductImages } from "../lib/preferences";
import { loadApiBase, loadConnectionMode } from "../lib/server-config";
import { AmountInput } from "./AmountInput";
import { ConfirmDialog } from "./ConfirmDialog";
import { ServerConnectionScreen } from "./ServerConnectionScreen";
import type { ApiBackup, ApiProduct, ApiSettings, BusinessType, ReceivingMode } from "../types/api";
import type { AuthSession } from "../types/auth";

interface SettingsScreenProps {
  session: AuthSession;
}

type Tab = "general" | "sale" | "discounts" | "receipts" | "notifications";

const CAN_MANAGE_ROLES: AuthSession["role"][] = ["ADMIN"];
const TABS: Tab[] = ["general", "sale", "discounts", "receipts", "notifications"];
const CURRENCIES = ["UZS", "USD"];
const BUSINESS_TYPES: BusinessType[] = ["RESTAURANT", "STORE", "PHARMACY"];

export function SettingsScreen({ session }: SettingsScreenProps) {
  const { t, i18n } = useTranslation();
  const canManage = CAN_MANAGE_ROLES.includes(session.role);

  const [tab, setTab] = useState<Tab>("general");
  const [connectionScreenOpen, setConnectionScreenOpen] = useState(false);
  const currentApiBase = loadApiBase();
  const connectionMode = loadConnectionMode();
  // Очистка тестовых чеков/смен (не из исходного ТЗ, по прямому запросу клиента) — необратимо,
  // поэтому отдельное подтверждение с явным предупреждением, как у "Удалить товар безвозвратно".
  const [clearHistoryOpen, setClearHistoryOpen] = useState(false);
  const [clearHistorySubmitting, setClearHistorySubmitting] = useState(false);
  const [clearHistoryError, setClearHistoryError] = useState<string | null>(null);
  const [clearHistoryResult, setClearHistoryResult] = useState<ClearHistoryResult | null>(null);
  // Не из исходного ТЗ — по прямому запросу клиента: очистка "кеша" уже ПРОДАННЫХ кодов
  // маркировки (см. ProductMarking.consumedAt) — сервер никогда не трогает активные (ещё в
  // наличии) коды, эта кнопка не может испортить защиту от повторного прихода товара, который
  // реально ещё на складе. Раз в месяц-два, по словам клиента.
  const [clearMarkingsOpen, setClearMarkingsOpen] = useState(false);
  const [clearMarkingsSubmitting, setClearMarkingsSubmitting] = useState(false);
  const [clearMarkingsError, setClearMarkingsError] = useState<string | null>(null);
  const [clearMarkingsResult, setClearMarkingsResult] = useState<ClearMarkingCacheResult | null>(null);
  const [settings, setSettings] = useState<ApiSettings | null>(null);
  const [backups, setBackups] = useState<ApiBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("UZS");
  const [defaultLanguage, setDefaultLanguage] = useState("ru");
  const [taxRatePercent, setTaxRatePercent] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType>("RESTAURANT");
  const [maxCashierDiscountPercent, setMaxCashierDiscountPercent] = useState("");
  const [lowStockThreshold, setLowStockThreshold] = useState("");
  const [quickCashAmounts, setQuickCashAmounts] = useState("");
  const [showConsumablesPanel, setShowConsumablesPanel] = useState(false);
  const [receivingMode, setReceivingMode] = useState<ReceivingMode>("MANUAL");
  const [showProductImages, setShowProductImages] = useState(loadShowProductImages());

  // Управление расходниками (посуда/пакет, не из исходного ТЗ) прямо из Настроек — по прямому
  // запросу клиента, чтобы не заходить в каждый товар в Товарах и искать там галочку вручную.
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [consumableAddQuery, setConsumableAddQuery] = useState("");
  const [newConsumableName, setNewConsumableName] = useState("");
  const [newConsumablePrice, setNewConsumablePrice] = useState(0);
  const [consumableBusy, setConsumableBusy] = useState(false);
  const [consumableError, setConsumableError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [downloadingBackupId, setDownloadingBackupId] = useState<string | null>(null);
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
        const [settingsResult, backupList, productList] = await Promise.all([
          getSettings(session.accessToken),
          getBackups(session.accessToken),
          getProducts(session.accessToken),
        ]);
        if (cancelled) return;
        setSettings(settingsResult);
        setBackups(backupList);
        setProducts(productList);
        setName(settingsResult.name);
        setCurrency(settingsResult.currency);
        setDefaultLanguage(settingsResult.defaultLanguage);
        setTaxRatePercent(settingsResult.taxRatePercent ?? "");
        setBusinessType(settingsResult.businessType);
        setMaxCashierDiscountPercent(
          settingsResult.maxCashierDiscountPercent != null ? String(settingsResult.maxCashierDiscountPercent) : "",
        );
        setLowStockThreshold(
          settingsResult.lowStockThreshold != null ? String(settingsResult.lowStockThreshold) : "",
        );
        setQuickCashAmounts(settingsResult.quickCashAmounts.join(", "));
        setShowConsumablesPanel(settingsResult.showConsumablesPanel);
        setReceivingMode(settingsResult.receivingMode);
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
        businessType,
        maxCashierDiscountPercent: maxCashierDiscountPercent === "" ? null : Number(maxCashierDiscountPercent),
        lowStockThreshold: lowStockThreshold === "" ? null : Number(lowStockThreshold),
        quickCashAmounts: quickCashAmounts
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n) && n > 0),
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

  // Тип бизнеса — не поле формы вперемешку с валютой/налогом, а отдельный самодостаточный
  // выбор (как переключатель "Показывать фото товаров" выше) — жалоба клиента "выбрал Магазин,
  // при следующем входе снова Ресторан" оказалась тем, что выбор карточки визуально выглядит
  // завершённым действием, а реально требовал ещё отдельного нажатия общей кнопки "Сохранить"
  // ниже по странице, вне поля зрения. Сохраняем сразу по клику, не дожидаясь общего "Сохранить".
  const [businessTypeSaving, setBusinessTypeSaving] = useState(false);
  const [businessTypeError, setBusinessTypeError] = useState<string | null>(null);

  async function handleSelectBusinessType(bt: BusinessType) {
    const previous = businessType;
    setBusinessType(bt);
    setBusinessTypeSaving(true);
    setBusinessTypeError(null);
    try {
      const updated = await updateSettings(session.accessToken, { businessType: bt });
      setSettings(updated);
    } catch (err) {
      setBusinessType(previous);
      setBusinessTypeError(err instanceof ApiError ? err.message : t("settings.saveError"));
    } finally {
      setBusinessTypeSaving(false);
    }
  }

  // Тот же паттерн авто-сохранения по клику, что и у businessType выше — переключатель
  // выглядит завершённым действием сам по себе, отдельная кнопка "Сохранить" ниже для него
  // была бы той же ловушкой, что уже поймали на businessType.
  async function handleToggleConsumablesPanel(value: boolean) {
    const previous = showConsumablesPanel;
    setShowConsumablesPanel(value);
    try {
      const updated = await updateSettings(session.accessToken, { showConsumablesPanel: value });
      setSettings(updated);
    } catch {
      setShowConsumablesPanel(previous);
    }
  }

  // Тот же паттерн авто-сохранения по клику, что и у businessType/showConsumablesPanel выше.
  // Не из исходного ТЗ — по прямому запросу клиента: только для Магазина (см. карточку в
  // General — скрыта для остальных профилей), способ приёма товара на "Складе".
  const [receivingModeSaving, setReceivingModeSaving] = useState(false);

  async function handleSelectReceivingMode(mode: ReceivingMode) {
    const previous = receivingMode;
    setReceivingMode(mode);
    setReceivingModeSaving(true);
    try {
      const updated = await updateSettings(session.accessToken, { receivingMode: mode });
      setSettings(updated);
    } catch {
      setReceivingMode(previous);
    } finally {
      setReceivingModeSaving(false);
    }
  }

  const consumableProducts = useMemo(
    () => products.filter((p) => p.isConsumable && p.isActive),
    [products],
  );
  const consumableSearchResults = useMemo(() => {
    const query = consumableAddQuery.trim().toLowerCase();
    if (!query) return [];
    return products.filter((p) => p.isActive && !p.isConsumable && p.name.toLowerCase().includes(query)).slice(0, 8);
  }, [products, consumableAddQuery]);

  async function handleAddExistingConsumable(product: ApiProduct) {
    setConsumableBusy(true);
    setConsumableError(null);
    try {
      const updated = await updateProduct(session.accessToken, product.id, { isConsumable: true });
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setConsumableAddQuery("");
    } catch (err) {
      setConsumableError(err instanceof ApiError ? err.message : t("settings.consumablesError"));
    } finally {
      setConsumableBusy(false);
    }
  }

  async function handleRemoveConsumable(product: ApiProduct) {
    setConsumableBusy(true);
    setConsumableError(null);
    try {
      const updated = await updateProduct(session.accessToken, product.id, { isConsumable: false });
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err) {
      setConsumableError(err instanceof ApiError ? err.message : t("settings.consumablesError"));
    } finally {
      setConsumableBusy(false);
    }
  }

  async function handleCreateConsumable() {
    if (!newConsumableName.trim() || newConsumablePrice <= 0) return;
    setConsumableBusy(true);
    setConsumableError(null);
    try {
      const created = await createProduct(session.accessToken, {
        name: newConsumableName.trim(),
        price: newConsumablePrice,
        isConsumable: true,
      });
      setProducts((prev) => [...prev, created]);
      setNewConsumableName("");
      setNewConsumablePrice(0);
    } catch (err) {
      setConsumableError(err instanceof ApiError ? err.message : t("settings.consumablesError"));
    } finally {
      setConsumableBusy(false);
    }
  }

  async function handleClearHistory() {
    setClearHistorySubmitting(true);
    setClearHistoryError(null);
    try {
      const result = await clearHistory(session.accessToken);
      setClearHistoryResult(result);
      setClearHistoryOpen(false);
    } catch (err) {
      setClearHistoryError(err instanceof ApiError ? err.message : t("settings.clearHistoryError"));
    } finally {
      setClearHistorySubmitting(false);
    }
  }

  async function handleClearMarkingCache() {
    setClearMarkingsSubmitting(true);
    setClearMarkingsError(null);
    try {
      const result = await clearMarkingCache(session.accessToken);
      setClearMarkingsResult(result);
      setClearMarkingsOpen(false);
    } catch (err) {
      setClearMarkingsError(err instanceof ApiError ? err.message : t("settings.clearMarkingsError"));
    } finally {
      setClearMarkingsSubmitting(false);
    }
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

  async function handleDownloadBackup(backup: ApiBackup) {
    setDownloadingBackupId(backup.id);
    try {
      const json = await downloadBackup(session.accessToken, backup.id);
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-${backup.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // не критично — кнопка остаётся доступной для повтора
    } finally {
      setDownloadingBackupId(null);
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
        <div className="space-y-4">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="mb-1 text-sm font-semibold text-slate-700">{t("settings.businessType")}</h3>
            <p className="mb-3 text-xs text-slate-400">{t("settings.businessTypeHint")}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {BUSINESS_TYPES.map((bt) => (
                <button
                  key={bt}
                  onClick={() => handleSelectBusinessType(bt)}
                  disabled={businessTypeSaving}
                  className={`rounded-lg border p-3 text-left transition disabled:opacity-60 ${
                    businessType === bt
                      ? "border-accent bg-accent/5"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-800">
                    {t(`settings.businessTypes.${bt}`)}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {t(`settings.businessTypeHints.${bt}`)}
                  </div>
                </button>
              ))}
            </div>
            {businessTypeSaving && <p className="mt-2 text-xs text-slate-400">{t("common.loading")}</p>}
            {businessTypeError && <p className="mt-2 text-xs text-red-600">{businessTypeError}</p>}
          </div>

          {businessType === "STORE" && (
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <h3 className="mb-1 text-sm font-semibold text-slate-700">{t("settings.receivingMode")}</h3>
              <p className="mb-3 text-xs text-slate-400">{t("settings.receivingModeHint")}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(["MANUAL", "MARKING_SCAN"] as ReceivingMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => handleSelectReceivingMode(mode)}
                    disabled={receivingModeSaving}
                    className={`rounded-lg border p-3 text-left transition disabled:opacity-60 ${
                      receivingMode === mode ? "border-accent bg-accent/5" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="text-sm font-semibold text-slate-800">
                      {t(`settings.receivingModes.${mode}.title`)}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {t(`settings.receivingModes.${mode}.hint`)}
                    </div>
                  </button>
                ))}
              </div>
              {receivingModeSaving && <p className="mt-2 text-xs text-slate-400">{t("common.loading")}</p>}
            </div>
          )}

          {businessType === "STORE" && (
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">{t("settings.clearMarkingsTitle")}</h3>
                  <p className="mt-0.5 text-xs text-slate-400">{t("settings.clearMarkingsHint")}</p>
                </div>
                <button
                  onClick={() => {
                    setClearMarkingsError(null);
                    setClearMarkingsOpen(true);
                  }}
                  className="shrink-0 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  {t("settings.clearMarkingsButton")}
                </button>
              </div>
              {clearMarkingsResult && (
                <p className="mt-2 text-xs text-emerald-600">
                  {t("settings.clearMarkingsDone", { count: clearMarkingsResult.cleared })}
                </p>
              )}
            </div>
          )}

          <div className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-700">{t("serverConnection.title")}</h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  {t(`serverConnection.modes.${connectionMode}.title`)} — {currentApiBase}
                </p>
              </div>
              <button
                onClick={() => setConnectionScreenOpen(true)}
                className="shrink-0 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                {t("serverConnection.change")}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-red-100 bg-red-50/40 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-red-700">{t("settings.clearHistoryTitle")}</h3>
                <p className="mt-0.5 text-xs text-red-500">{t("settings.clearHistoryHint")}</p>
              </div>
              <button
                onClick={() => {
                  setClearHistoryError(null);
                  setClearHistoryOpen(true);
                }}
                className="shrink-0 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
              >
                {t("settings.clearHistoryButton")}
              </button>
            </div>
            {clearHistoryResult && (
              <p className="mt-2 text-xs text-emerald-600">
                {t("settings.clearHistoryDone", {
                  receipts: clearHistoryResult.receiptsDeleted,
                  shifts: clearHistoryResult.shiftsDeleted,
                })}
              </p>
            )}
          </div>

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
              <h3 className="mb-1 text-sm font-semibold text-slate-700">{t("settings.backupTitle")}</h3>
              <p className="mb-3 text-xs text-slate-400">{t("settings.backupHint")}</p>

              {backups.length === 0 ? (
                <p className="text-xs text-slate-400">{t("settings.noBackups")}</p>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {backups.map((backup) => (
                    <div
                      key={backup.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-slate-700">
                          {new Date(backup.createdAt).toLocaleString("ru-RU")}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {t("settings.backupSizeKb", { size: (backup.sizeBytes / 1024).toFixed(1) })} ·{" "}
                          {backup.trigger === "MANUAL" ? t("settings.backupManual") : t("settings.backupAuto")}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDownloadBackup(backup)}
                        disabled={downloadingBackupId === backup.id}
                        className="shrink-0 text-xs font-medium text-accent hover:underline disabled:opacity-40"
                      >
                        {downloadingBackupId === backup.id ? t("common.loading") : t("settings.downloadBackup")}
                      </button>
                    </div>
                  ))}
                </div>
              )}

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
              </div>
            </div>
          </div>
          </div>
        </div>
      )}

      {!loading && !loadError && tab === "sale" && (
        <div className="space-y-4">
        <div className="max-w-md space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <label className="block text-xs font-medium text-slate-500">
            {t("settings.quickCashAmounts")}
            <input
              value={quickCashAmounts}
              onChange={(e) => setQuickCashAmounts(e.target.value)}
              placeholder={t("settings.quickCashAmountsPlaceholder")}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <p className="text-xs text-slate-400">{t("settings.quickCashAmountsHint")}</p>

          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
            <div>
              <div className="text-sm text-slate-600">{t("settings.showConsumablesPanel")}</div>
              <p className="mt-0.5 text-xs text-slate-400">{t("settings.showConsumablesPanelHint")}</p>
            </div>
            <button
              role="switch"
              aria-checked={showConsumablesPanel}
              onClick={() => handleToggleConsumablesPanel(!showConsumablesPanel)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ease-in-out ${
                showConsumablesPanel ? "bg-accent" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 block h-5 w-5 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-200 ease-in-out ${
                  showConsumablesPanel ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {saveMessage && <p className="text-xs text-slate-500">{saveMessage}</p>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {saving ? t("common.loading") : t("settings.save")}
          </button>
        </div>

        <div className="max-w-xl rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-1 text-sm font-semibold text-slate-700">{t("settings.consumablesTitle")}</h3>
          <p className="mb-3 text-xs text-slate-400">{t("settings.consumablesHint")}</p>

          <div className="space-y-1.5">
            {consumableProducts.length === 0 && (
              <p className="text-xs text-slate-400">{t("settings.consumablesEmpty")}</p>
            )}
            {consumableProducts.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-sm text-slate-700">{p.name}</span>
                <button
                  onClick={() => handleRemoveConsumable(p)}
                  disabled={consumableBusy}
                  className="shrink-0 text-xs font-medium text-slate-400 hover:text-red-600 disabled:opacity-40"
                >
                  {t("settings.consumablesRemove")}
                </button>
              </div>
            ))}
          </div>

          <div className="relative mt-3">
            <input
              value={consumableAddQuery}
              onChange={(e) => setConsumableAddQuery(e.target.value)}
              placeholder={t("settings.consumablesAddExisting")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
            {consumableSearchResults.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {consumableSearchResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleAddExistingConsumable(p)}
                    disabled={consumableBusy}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-40"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 flex items-end gap-2">
            <label className="block flex-1 text-xs font-medium text-slate-500">
              {t("settings.consumablesNewName")}
              <input
                value={newConsumableName}
                onChange={(e) => setNewConsumableName(e.target.value)}
                placeholder={t("settings.consumablesNewNamePlaceholder")}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="block w-28 text-xs font-medium text-slate-500">
              {t("products.price")}
              <AmountInput
                value={newConsumablePrice}
                onChange={setNewConsumablePrice}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            <button
              onClick={handleCreateConsumable}
              disabled={consumableBusy || !newConsumableName.trim() || newConsumablePrice <= 0}
              className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
            >
              {t("settings.consumablesCreate")}
            </button>
          </div>

          {consumableError && <p className="mt-2 text-xs text-red-600">{consumableError}</p>}
        </div>
        </div>
      )}

      {!loading && !loadError && tab === "discounts" && (
        <div className="max-w-md space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <label className="block text-xs font-medium text-slate-500">
            {t("settings.maxCashierDiscount")}
            <input
              type="number"
              min={0}
              max={100}
              value={maxCashierDiscountPercent}
              onChange={(e) => setMaxCashierDiscountPercent(e.target.value)}
              placeholder={t("settings.maxCashierDiscountPlaceholder")}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <p className="text-xs text-slate-400">{t("settings.maxCashierDiscountHint")}</p>

          {saveMessage && <p className="text-xs text-slate-500">{saveMessage}</p>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {saving ? t("common.loading") : t("settings.save")}
          </button>
        </div>
      )}

      {!loading && !loadError && tab === "notifications" && (
        <div className="max-w-md space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <label className="block text-xs font-medium text-slate-500">
            {t("settings.lowStockThreshold")}
            <input
              type="number"
              min={0}
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(e.target.value)}
              placeholder={t("settings.lowStockThresholdPlaceholder")}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <p className="text-xs text-slate-400">{t("settings.lowStockThresholdHint")}</p>

          {saveMessage && <p className="text-xs text-slate-500">{saveMessage}</p>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {saving ? t("common.loading") : t("settings.save")}
          </button>
        </div>
      )}

      {!loading && !loadError && tab === "receipts" && (
        <div className="rounded-xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-400">{t("settings.tabNotReady")}</p>
        </div>
      )}

      {connectionScreenOpen && <ServerConnectionScreen onClose={() => setConnectionScreenOpen(false)} />}

      {clearHistoryOpen && (
        <ConfirmDialog
          title={t("settings.clearHistoryTitle")}
          message={t("settings.clearHistoryConfirm")}
          confirmLabel={t("settings.clearHistoryButton")}
          danger
          submitting={clearHistorySubmitting}
          error={clearHistoryError}
          onClose={() => setClearHistoryOpen(false)}
          onConfirm={handleClearHistory}
        />
      )}

      {clearMarkingsOpen && (
        <ConfirmDialog
          title={t("settings.clearMarkingsTitle")}
          message={t("settings.clearMarkingsConfirm")}
          confirmLabel={t("settings.clearMarkingsButton")}
          submitting={clearMarkingsSubmitting}
          error={clearMarkingsError}
          onClose={() => setClearMarkingsOpen(false)}
          onConfirm={handleClearMarkingCache}
        />
      )}
    </div>
  );
}
