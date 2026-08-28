import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatSum } from "../lib/format";
import { AmountInput } from "./AmountInput";
import { CloseIcon } from "./icons";

interface CloseShiftModalProps {
  expectedCash: number;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (closingCash: number) => void;
}

export function CloseShiftModal({ expectedCash, submitting, error, onClose, onConfirm }: CloseShiftModalProps) {
  const { t } = useTranslation();
  const [closingCash, setClosingCash] = useState(Math.round(expectedCash));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-800">{t("workstation.closeShiftTitle")}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={t("common.close")}>
            <CloseIcon />
          </button>
        </div>

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
            onClick={() => onConfirm(closingCash)}
            disabled={submitting}
            className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {submitting ? t("workstation.closing") : t("workstation.closeShift")}
          </button>
        </div>
      </div>
    </div>
  );
}
