import { useTranslation } from "react-i18next";
import { useEscapeClose } from "../lib/use-escape-close";
import { CloseIcon } from "./icons";

interface ScanBlockedModalProps {
  productName: string;
  // Не из исходного ТЗ — по прямому запросу клиента: раньше скан товара, закончившегося на
  // складе (или без указанной цены), молча ничего не добавлял в чек — кассир узнавал об этом
  // только на оплате, разобрав уже пробитый чек заново. Причина отличается по тексту, чтобы не
  // сбивать с толку — "нет в наличии" и "не указана цена" требуют разных действий от кассира.
  reason: "stock" | "price";
  onClose: () => void;
}

export function ScanBlockedModal({ productName, reason, onClose }: ScanBlockedModalProps) {
  const { t } = useTranslation();
  useEscapeClose(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-800">
            {reason === "stock" ? t("products.outOfStock") : t("products.noPriceBadge")}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={t("common.close")}>
            <CloseIcon />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-slate-500">
            {reason === "stock" ? t("scanner.blockedStockHint", { name: productName }) : t("scanner.blockedPriceHint", { name: productName })}
          </p>
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
