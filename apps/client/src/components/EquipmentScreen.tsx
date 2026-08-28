import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { useDeviceAgent } from "../lib/use-device-agent";
import { CheckCircleIcon, CloseIcon } from "./icons";
import {
  BarcodeScannerArt,
  CashDrawerArt,
  CustomerDisplayArt,
  FiscalPrinterArt,
  PaymentTerminalArt,
} from "./equipment-art";
import type { DeviceKind } from "@ib-pos/shared";

const DEVICE_ART: Record<DeviceKind, (p: { className?: string }) => ReactElement> = {
  fiscal_registrar: FiscalPrinterArt,
  cash_drawer: CashDrawerArt,
  customer_display: CustomerDisplayArt,
  payment_terminal: PaymentTerminalArt,
};

export function EquipmentScreen() {
  const { t } = useTranslation();
  const { connected, devices, testState, testDevice } = useDeviceAgent();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">{t("equipment.title")}</h1>
        {!connected && (
          <span className="rounded-lg bg-red-50 px-3 py-1 text-sm font-medium text-red-600">
            {t("equipment.agentOffline")}
          </span>
        )}
      </div>

      <div className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm">
        {/* Сканер штрихкодов — не отдельное устройство агента, а клавиатурный ввод
            (см. use-barcode-scanner.ts): работает через сам браузер/WebView, драйвер не нужен. */}
        <div className="flex items-center gap-4 px-4 py-3">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
            <BarcodeScannerArt className="h-12 w-12" />
          </span>
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-800">{t("equipment.devices.barcode_scanner")}</div>
            <div className="text-xs text-slate-400">{t("equipment.descriptions.barcode_scanner")}</div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {t("equipment.connected")}
            </div>
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
    </div>
  );
}
