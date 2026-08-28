import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatSum } from "../lib/format";
import { AmountInput } from "./AmountInput";
import { CloseIcon } from "./icons";
import type { ApiShift } from "../types/api";

interface CloseShiftModalProps {
  expectedCash: number;
  onClose: () => void;
  onConfirm: (closingCash: number) => Promise<ApiShift>;
  onDone: () => void;
}

type Phase = "form" | "done";

export function CloseShiftModal({ expectedCash, onClose, onConfirm, onDone }: CloseShiftModalProps) {
  const { t } = useTranslation();
  const [closingCash, setClosingCash] = useState(Math.round(expectedCash));
  const [phase, setPhase] = useState<Phase>("form");
  const [closedShift, setClosedShift] = useState<ApiShift | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const shift = await onConfirm(closingCash);
      setClosedShift(shift);
      setPhase("done");
    } catch {
      setError(t("workstation.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-800">{t("workstation.closeShiftTitle")}</h2>
          {phase === "form" && (
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={t("common.close")}>
              <CloseIcon />
            </button>
          )}
        </div>

        {phase === "form" && (
          <>
            <div className="space-y-3 px-5 py-4">
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-500">{t("workstation.expectedCash")}</span>
                <span className="font-semibold text-slate-800">
                  {formatSum(expectedCash)} {t("common.currency")}
                </span>
              </div>

              <label className="block text-xs font-medium text-slate-500">
                {t("workstation.closingCash")}
                <AmountInput
                  value={closingCash}
                  onChange={setClosingCash}
                  autoFocus
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-accent"
                />
              </label>

              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            </div>

            <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50"
              >
                {t("returns.cancel")}
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
              >
                {submitting ? t("workstation.closing") : t("workstation.closeShift")}
              </button>
            </div>
          </>
        )}

        {phase === "done" && closedShift && (
          <>
            <div className="space-y-3 px-5 py-4 text-center">
              <p className="text-sm font-semibold text-emerald-600">{t("shifts.closedSuccess")}</p>
              {closedShift.zReportNumber ? (
                <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-3">
                  <div className="text-xs text-slate-500">{t("shifts.zReportNumber")}</div>
                  <div className="mt-1 font-mono text-sm font-semibold text-slate-800">
                    {closedShift.zReportNumber}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">{t("shifts.noFiscalDevice")}</p>
              )}
            </div>
            <div className="border-t border-slate-100 px-5 py-4">
              <button
                onClick={onDone}
                className="w-full rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover"
              >
                {t("workstation.continue")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
