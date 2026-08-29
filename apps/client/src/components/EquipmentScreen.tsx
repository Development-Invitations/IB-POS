import { useEffect, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { useDeviceAgent } from "../lib/use-device-agent";
import { ApiError, deactivateEquipment, getEquipment, updateEquipment } from "../lib/api";
import { ConfirmDialog } from "./ConfirmDialog";
import { EquipmentFormModal } from "./EquipmentFormModal";
import { CheckCircleIcon, CloseIcon, MonitorIcon, PlusIcon } from "./icons";
import {
  CashDrawerArt,
  CustomerDisplayArt,
  FiscalPrinterArt,
  PaymentTerminalArt,
} from "./equipment-art";
import barcodeScannerPhoto from "../assets/equipment/barcode-scanner.png";
import type { ApiEquipment, EquipmentKind } from "../types/api";
import type { AuthSession } from "../types/auth";
import type { DeviceKind } from "@ib-pos/shared";

const DEVICE_ART: Record<DeviceKind, (p: { className?: string }) => ReactElement> = {
  fiscal_registrar: FiscalPrinterArt,
  cash_drawer: CashDrawerArt,
  customer_display: CustomerDisplayArt,
  payment_terminal: PaymentTerminalArt,
};

interface EquipmentScreenProps {
  session: AuthSession;
}

const CAN_VIEW_ROLES: AuthSession["role"][] = ["ADMIN", "MANAGER", "CASHIER"];
const CAN_MANAGE_ROLES: AuthSession["role"][] = ["ADMIN"];

function equipmentIcon(kind: EquipmentKind, className: string) {
  switch (kind) {
    case "FISCAL_REGISTRAR":
      return <FiscalPrinterArt className={className} />;
    case "CASH_DRAWER":
      return <CashDrawerArt className={className} />;
    case "CUSTOMER_DISPLAY":
      return <CustomerDisplayArt className={className} />;
    case "PAYMENT_TERMINAL":
      return <PaymentTerminalArt className={className} />;
    case "BARCODE_SCANNER":
      return <img src={barcodeScannerPhoto} alt="" className={`${className} object-contain`} />;
    case "OTHER":
      return <MonitorIcon className={className} />;
  }
}

export function EquipmentScreen({ session }: EquipmentScreenProps) {
  const { t } = useTranslation();
  const { connected, devices, testState, testDevice } = useDeviceAgent();
  const canView = CAN_VIEW_ROLES.includes(session.role);
  const canManage = CAN_MANAGE_ROLES.includes(session.role);

  const [items, setItems] = useState<ApiEquipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ApiEquipment | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ApiEquipment | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      setItems(await getEquipment(session.accessToken));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("equipment.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canView) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken]);

  function openCreate() {
    setEditingItem(null);
    setFormOpen(true);
  }

  function openEdit(item: ApiEquipment) {
    setEditingItem(item);
    setFormOpen(true);
  }

  function handleSaved(saved: ApiEquipment) {
    setItems((prev) => {
      const exists = prev.some((i) => i.id === saved.id);
      return exists ? prev.map((i) => (i.id === saved.id ? saved : i)) : [...prev, saved];
    });
    setFormOpen(false);
  }

  async function handleToggleActive(item: ApiEquipment) {
    if (item.isActive) {
      setConfirmError(null);
      setConfirmTarget(item);
      return;
    }
    setRowError(null);
    try {
      const saved = await updateEquipment(session.accessToken, item.id, { isActive: true });
      setItems((prev) => prev.map((i) => (i.id === saved.id ? saved : i)));
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : t("equipment.saveError"));
    }
  }

  async function confirmDeactivate() {
    if (!confirmTarget) return;
    setConfirmSubmitting(true);
    setConfirmError(null);
    try {
      await deactivateEquipment(session.accessToken, confirmTarget.id);
      setItems((prev) => prev.map((i) => (i.id === confirmTarget.id ? { ...i, isActive: false } : i)));
      setConfirmTarget(null);
    } catch (err) {
      setConfirmError(err instanceof ApiError ? err.message : t("equipment.saveError"));
    } finally {
      setConfirmSubmitting(false);
    }
  }

  if (!canView) {
    return (
      <div className="mx-auto max-w-md pt-16 text-center">
        <p className="text-sm text-slate-500">{t("equipment.accessDenied")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">{t("equipment.title")}</h1>
        {!connected && (
          <span className="rounded-lg bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
            {t("equipment.agentOffline")}
          </span>
        )}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">{t("equipment.autoDetected")}</h2>
        <div className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm">
          {/* Сканер штрихкодов — не отдельное устройство агента, а клавиатурный ввод
              (см. use-barcode-scanner.ts): работает через сам браузер/WebView, драйвер не нужен,
              поэтому статус подключения система определить не может (см. equipment.barcodeScannerHint). */}
          <div className="flex items-center gap-4 px-4 py-3">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
              <img src={barcodeScannerPhoto} alt="" className="h-full w-full object-contain" />
            </span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-slate-800">{t("equipment.devices.barcode_scanner")}</div>
              <div className="text-xs text-slate-400">{t("equipment.descriptions.barcode_scanner")}</div>
              <div className="mt-0.5 text-xs text-slate-400">{t("equipment.barcodeScannerHint")}</div>
            </div>
          </div>

          {devices.map((device) => {
            const state = testState[device.kind] ?? "idle";
            const DeviceArt = DEVICE_ART[device.kind];
            return (
              <div key={device.kind} className="flex items-center gap-4 px-4 py-3">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
                  <DeviceArt className="h-12 w-12" />
                </span>

                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-800">{t(`equipment.devices.${device.kind}`)}</div>
                  <div className="text-xs text-slate-400">{t(`equipment.descriptions.${device.kind}`)}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${device.connected ? "bg-emerald-500" : "bg-slate-300"}`}
                    />
                    {device.connected ? t("equipment.connected") : t("equipment.disconnected")}
                    {device.detail ? ` — ${device.detail}` : ""}
                  </div>
                </div>

                {state === "success" && <CheckCircleIcon className="text-emerald-500" />}
                {state === "error" && <CloseIcon className="text-red-500" />}

                <button
                  onClick={() => testDevice(device.kind)}
                  disabled={!connected || state === "testing"}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-accent/40 hover:text-accent disabled:opacity-40"
                >
                  {state === "testing" ? t("equipment.testing") : t("equipment.test")}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-600">{t("equipment.myEquipment")}</h2>
          {canManage && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover"
            >
              <PlusIcon width={16} height={16} />
              {t("equipment.addTitle")}
            </button>
          )}
        </div>

        {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}
        {loadError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{loadError}</p>}
        {rowError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{rowError}</p>}

        {!loading && !loadError && (
          <div className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-4 px-4 py-3">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
                  {equipmentIcon(item.kind, "h-12 w-12")}
                </span>

                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-800">{item.label}</div>
                  <div className="text-xs text-slate-400">{t(`equipment.devices.${item.kind.toLowerCase()}`)}</div>
                  {item.description && <div className="mt-0.5 text-xs text-slate-400">{item.description}</div>}
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${item.isActive ? "bg-emerald-500" : "bg-slate-300"}`}
                    />
                    {item.isActive ? t("products.active") : t("products.inactive")}
                  </div>
                </div>

                {canManage && (
                  <div className="flex shrink-0 gap-3">
                    <button
                      onClick={() => openEdit(item)}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      {t("products.edit")}
                    </button>
                    <button
                      onClick={() => handleToggleActive(item)}
                      className="text-xs font-medium text-slate-400 hover:text-slate-700"
                    >
                      {item.isActive ? t("products.deactivate") : t("products.activate")}
                    </button>
                  </div>
                )}
              </div>
            ))}

            {items.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-400">{t("equipment.empty")}</p>
            )}
          </div>
        )}
      </section>

      {formOpen && (
        <EquipmentFormModal
          session={session}
          equipment={editingItem}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {confirmTarget && (
        <ConfirmDialog
          title={t("equipment.deactivateTitle")}
          message={t("equipment.deactivateConfirm", { name: confirmTarget.label })}
          confirmLabel={t("products.deactivate")}
          danger
          submitting={confirmSubmitting}
          error={confirmError}
          onClose={() => setConfirmTarget(null)}
          onConfirm={confirmDeactivate}
        />
      )}
    </div>
  );
}
