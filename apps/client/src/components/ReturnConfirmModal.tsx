import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, loginPin } from "../lib/api";
import { sessionFromToken } from "../lib/session";
import type { AuthSession } from "../types/auth";
import { CloseIcon } from "./icons";

interface ReturnConfirmModalProps {
  organizationId: string;
  onClose: () => void;
  onConfirm: (approver: AuthSession) => Promise<void>;
}

export function ReturnConfirmModal({ organizationId, onClose, onConfirm }: ReturnConfirmModalProps) {
  const { t } = useTranslation();
  const [managerLogin, setManagerLogin] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const { accessToken } = await loginPin(organizationId, managerLogin.trim(), pin);
      const approver = sessionFromToken(accessToken);
      if (!approver) {
        setError(t("returns.wrongPin"));
        return;
      }
      if (approver.role !== "ADMIN" && approver.role !== "MANAGER") {
        setError(t("returns.notAuthorized"));
        return;
      }
      await onConfirm(approver);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 0 ? t("auth.networkError") : err.status === 401 ? t("returns.wrongPin") : err.message);
      } else {
        setError(t("returns.wrongPin"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-800">{t("returns.title")}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={t("returns.cancel")}>
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-slate-500">{t("returns.confirmText")}</p>

          <label className="block text-xs font-medium text-slate-500">
            {t("returns.managerLogin")}
            <input
              value={managerLogin}
              onChange={(e) => {
                setManagerLogin(e.target.value);
                setError(null);
              }}
              autoFocus
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ""));
              setError(null);
            }}
            placeholder={t("returns.pinPlaceholder")}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-center text-lg tracking-[0.5em] outline-none focus:border-accent"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
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
            disabled={submitting || managerLogin.length === 0 || pin.length < 4}
            className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {t("returns.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
