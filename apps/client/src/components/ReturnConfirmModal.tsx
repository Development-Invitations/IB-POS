import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CloseIcon } from "./icons";

interface ReturnConfirmModalProps {
  onClose: () => void;
  onConfirm: () => void;
}

// Демо-проверка: любой 4-значный PIN принимается как подтверждение прав
// управляющего/администратора. Заменится на реальную проверку роли текущего
// пользователя, когда в клиенте появится логин/сессия (см. apps/server auth).
function isValidManagerPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function ReturnConfirmModal({ onClose, onConfirm }: ReturnConfirmModalProps) {
  const { t } = useTranslation();
  const [pin, setPin] = useState("");
  const [wrongPin, setWrongPin] = useState(false);

  function handleConfirm() {
    if (!isValidManagerPin(pin)) {
      setWrongPin(true);
      return;
    }
    onConfirm();
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
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ""));
              setWrongPin(false);
            }}
            placeholder={t("returns.pinPlaceholder")}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-center text-lg tracking-[0.5em] outline-none focus:border-accent"
          />
          {wrongPin && <p className="text-sm text-red-600">{t("returns.wrongPin")}</p>}
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
            disabled={pin.length !== 4}
            className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {t("returns.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
