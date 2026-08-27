import { useTranslation } from "react-i18next";
import { CloseIcon } from "./icons";

interface ProductNotFoundModalProps {
  code: string;
  onClose: () => void;
}

export function ProductNotFoundModal({ code, onClose }: ProductNotFoundModalProps) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-800">{t("scanner.notFoundTitle")}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={t("common.close")}>
            <CloseIcon />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-slate-500">{t("scanner.notFoundHint", { code })}</p>
        </div>
        <div className="border-t border-slate-100 px-5 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
