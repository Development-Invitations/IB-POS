import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { formatSum } from "../lib/format";
import { PAYMENT_METHODS, type PaymentMethod } from "../types/payment";
import { AmountInput } from "./AmountInput";
import { CashIcon, CardIcon, MonitorIcon, QrIcon, MixedIcon, CloseIcon } from "./icons";

const METHOD_ICON: Record<PaymentMethod, (p: { className?: string }) => ReactElement> = {
  cash: CashIcon,
  card: CardIcon,
  clickPayme: MonitorIcon,
  qr: QrIcon,
  mixed: MixedIcon,
};

export type PaymentStatus = "idle" | "processing" | "error";
export type ClickProvider = "click" | "payme";

interface PaymentModalProps {
  total: number;
  status: PaymentStatus;
  onClose: () => void;
  onConfirm: (method: PaymentMethod, receivedAmount: number | null, clickProvider: ClickProvider) => void;
}

export function PaymentModal({ total, status, onClose, onConfirm }: PaymentModalProps) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [received, setReceived] = useState(total);
  const [clickProvider, setClickProvider] = useState<ClickProvider>("click");

  const receivedAmount = method === "cash" ? received : null;
  const change = receivedAmount !== null ? receivedAmount - total : 0;
  const canConfirm = status !== "processing" && (method !== "cash" || receivedAmount! >= total);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-800">{t("payment.title")}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={t("payment.cancel")}>
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-2 px-5 py-4">
          {PAYMENT_METHODS.map((m) => {
            const Icon = METHOD_ICON[m];
            const selected = m === method;
            return (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm font-medium transition ${
                  selected
                    ? "border-accent bg-accent/5 text-accent"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <Icon className="shrink-0" />
                {t(`payment.${m}`)}
              </button>
            );
          })}

          {method === "clickPayme" && (
            <div className="flex gap-2 rounded-lg bg-slate-50 p-1">
              {(["click", "payme"] as const).map((provider) => (
                <button
                  key={provider}
                  onClick={() => setClickProvider(provider)}
                  className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${
                    clickProvider === provider
                      ? "bg-accent text-white"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {t(`payment.${provider}`)}
                </button>
              ))}
            </div>
          )}

          {method === "cash" && (
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3">
              <label className="text-xs text-slate-500">
                {t("payment.received")}
                <AmountInput
                  value={received}
                  onChange={setReceived}
                  autoFocus
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-accent"
                />
              </label>
              <div className="text-xs text-slate-500">
                {t("payment.change")}
                <div className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800">
                  {formatSum(Math.max(0, change))} {t("common.currency")}
                </div>
              </div>
            </div>
          )}

          {status === "error" && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{t("payment.error")}</p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
          <div>
            <div className="text-xs text-slate-400">{t("payment.toPay")}</div>
            <div className="text-xl font-bold text-slate-900">
              {formatSum(total)} {t("common.currency")}
            </div>
          </div>
          <button
            onClick={() => onConfirm(method, receivedAmount, clickProvider)}
            disabled={!canConfirm}
            className="rounded-lg bg-accent px-6 py-3 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {status === "processing"
              ? t("common.loading")
              : status === "error"
                ? t("payment.retry")
                : t("payment.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
