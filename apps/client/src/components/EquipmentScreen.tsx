import { useTranslation } from "react-i18next";
import { useDeviceAgent } from "../lib/use-device-agent";
import { MonitorIcon, CheckCircleIcon, CloseIcon } from "./icons";

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
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
            <MonitorIcon />
          </span>
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-800">{t("equipment.devices.barcode_scanner")}</div>
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {t("equipment.connected")}
            </div>
          </div>
        </div>

        {devices.map((device) => {
          const state = testState[device.kind] ?? "idle";
          return (
            <div key={device.kind} className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
                <MonitorIcon />
              </span>

              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-800">{t(`equipment.devices.${device.kind}`)}</div>
                <div className="flex items-center gap-1 text-xs text-slate-400">
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
