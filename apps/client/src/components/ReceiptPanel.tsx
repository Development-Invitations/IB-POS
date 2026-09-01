import { useTranslation } from "react-i18next";
import { API_BASE, type ReceiptPreview } from "../lib/api";
import { formatSum } from "../lib/format";
import { computeTotals } from "../lib/cart";
import { loadShowProductImages } from "../lib/preferences";
import type { CartProduct } from "../types/catalog";
import type { PaymentMethod } from "../types/payment";
import { MinusIcon, PlusIcon, CloseIcon, CheckCircleIcon } from "./icons";

export interface CartLine {
  product: CartProduct;
  qty: number;
}

export interface PaidReceipt {
  id: string;
  total: number;
  method: PaymentMethod;
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

interface ReceiptPanelProps {
  lines: CartLine[];
  discountPercent: number;
  preview: ReceiptPreview | null;
  // Раздел 3 ТЗ: Кассир применяет скидку "в рамках лимита" (Настройки → Скидки, не из
  // исходного ТЗ). undefined — роль не ограничена этим лимитом, используется прежний потолок.
  maxDiscountPercent?: number;
  onDiscountChange: (percent: number) => void;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  onPay: () => void;
  lastReceipt: PaidReceipt | null;
  onReturnClick: () => void;
}

const DISCOUNT_STEP = 5;
const DEFAULT_MAX_DISCOUNT_PERCENT = 50;

export function ReceiptPanel({
  lines,
  discountPercent,
  preview,
  maxDiscountPercent,
  onDiscountChange,
  onIncrement,
  onDecrement,
  onRemove,
  onClear,
  onPay,
  lastReceipt,
  onReturnClick,
}: ReceiptPanelProps) {
  const { t } = useTranslation();
  const showImages = loadShowProductImages();
  const effectiveMaxDiscount = maxDiscountPercent ?? DEFAULT_MAX_DISCOUNT_PERCENT;

  // preview — авторитетный итог с сервера (учитывает авто-скидки из «Скидки и акции»,
  // см. ReceiptsService.calculateTotals); пока не пришёл или сети нет — локальный расчёт
  // только по ручному %, как было до авто-скидок.
  const local = computeTotals(lines, discountPercent);
  const manualDiscountAmount = preview?.manualDiscountAmount ?? local.discountAmount;
  const autoDiscountAmount = preview?.autoDiscountTotal ?? 0;
  const total = preview?.total ?? local.total;

  return (
    <aside className="m-4 flex w-[340px] shrink-0 flex-col rounded-xl bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="font-semibold text-slate-800">{t("receipt.current")}</h2>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
        {lines.length === 0 && !lastReceipt && (
          <p className="px-2 py-8 text-center text-sm text-slate-400">{t("receipt.empty")}</p>
        )}

        {lines.length === 0 && lastReceipt && (
          <div className="m-2 flex flex-col items-center gap-2 rounded-lg bg-emerald-50 px-4 py-6 text-center">
            <CheckCircleIcon className="text-emerald-500" />
            <p className="text-sm font-semibold text-emerald-700">{t("payment.success")}</p>
            <p className="text-lg font-bold text-slate-800">
              {formatSum(lastReceipt.total)} {t("common.currency")}
            </p>
            <button
              onClick={onReturnClick}
              className="mt-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:border-accent/40 hover:text-accent"
            >
              {t("returns.action")}
            </button>
          </div>
        )}

        {lines.map((line) => (
          <div key={line.product.id} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-50">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50 text-xs font-bold text-slate-500">
              {showImages && line.product.imageUrl ? (
                <img src={`${API_BASE}${line.product.imageUrl}`} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(line.product.name)
              )}
            </span>

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-800">{line.product.name}</div>
              <div className="text-xs text-slate-400">{line.product.unit}</div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => onDecrement(line.product.id)}
                className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-100"
              >
                <MinusIcon width={14} height={14} />
              </button>
              <span className="w-5 text-center text-sm">{line.qty}</span>
              <button
                onClick={() => onIncrement(line.product.id)}
                className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-100"
              >
                <PlusIcon width={14} height={14} />
              </button>
            </div>

            <div className="w-20 shrink-0 text-right text-sm font-semibold text-slate-800">
              {formatSum(line.product.price * line.qty)}
            </div>

            <button
              onClick={() => onRemove(line.product.id)}
              className="text-slate-300 hover:text-accent"
              aria-label={t("common.remove")}
            >
              <CloseIcon width={14} height={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-slate-100 px-4 py-3">
        {lines.length > 0 && (
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span className="flex items-center gap-2">
              {t("receipt.discount")}
              <span className="flex items-center gap-1">
                <button
                  onClick={() => onDiscountChange(Math.max(0, discountPercent - DISCOUNT_STEP))}
                  disabled={discountPercent === 0}
                  className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                >
                  <MinusIcon width={14} height={14} />
                </button>
                <span className="w-10 rounded bg-slate-100 px-1.5 py-0.5 text-center text-xs">
                  {discountPercent}%
                </span>
                <button
                  onClick={() => onDiscountChange(Math.min(effectiveMaxDiscount, discountPercent + DISCOUNT_STEP))}
                  disabled={discountPercent >= effectiveMaxDiscount}
                  className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                >
                  <PlusIcon width={14} height={14} />
                </button>
              </span>
            </span>
            <span>-{formatSum(manualDiscountAmount)}</span>
          </div>
        )}

        {autoDiscountAmount > 0 && (
          <div className="flex items-center justify-between text-xs text-emerald-600">
            <span>{t("receipt.autoDiscount")}</span>
            <span>-{formatSum(autoDiscountAmount)}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-800">{t("receipt.total")}</span>
          <span className="text-xl font-bold text-slate-900">
            {formatSum(total)} {t("common.currency")}
          </span>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClear}
            disabled={lines.length === 0}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          >
            {t("receipt.clear")}
          </button>
          <button
            onClick={onPay}
            disabled={lines.length === 0}
            className="flex-[2] rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {t("receipt.pay")}
          </button>
        </div>
      </div>
    </aside>
  );
}
