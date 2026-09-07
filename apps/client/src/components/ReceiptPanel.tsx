import { useState } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE, type ReceiptPreview } from "../lib/api";
import { formatSum } from "../lib/format";
import { computeTotals } from "../lib/cart";
import { loadShowProductImages } from "../lib/preferences";
import type { CartProduct } from "../types/catalog";
import type { PaymentMethod } from "../types/payment";
import { MinusIcon, PlusIcon, CloseIcon, CheckCircleIcon } from "./icons";
import { ConfirmDialog } from "./ConfirmDialog";

export interface CartLine {
  product: CartProduct;
  qty: number;
}

export interface PaidReceipt {
  id: string;
  total: number;
  method: PaymentMethod;
}

// Несколько одновременно открытых чеков (Раздел 3 ТЗ не требует, добавлено по прямому запросу
// клиента: "1 покупателя в магазине может обслужить касса, а нужно 2-3") — касса может держать
// корзины нескольких покупателей параллельно, переключаясь вкладками, вместо одной глобальной
// корзины. Ничего не пишется на сервер, пока чек не оплачен (см. App.tsx), поэтому "отложенный"
// чек — это просто ещё один элемент этого массива, а не отдельная сущность в БД.
export interface Ticket {
  id: string;
  label: string;
  lines: CartLine[];
  discountPercent: number;
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
  tickets: Ticket[];
  activeTicketId: string;
  onSwitchTicket: (id: string) => void;
  onAddTicket: () => void;
  addTicketDisabled: boolean;
  onCloseTicket: (id: string) => void;
  // Расходники (посуда/пакет, не из исходного ТЗ) — быстрая панель добавления, показывается
  // только когда включена в Настройках и в каталоге есть товары с флагом isConsumable.
  consumableProducts: CartProduct[];
  onAddConsumable: (product: CartProduct) => void;
  onDecrementConsumable: (productId: string) => void;
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
  tickets,
  activeTicketId,
  onSwitchTicket,
  onAddTicket,
  addTicketDisabled,
  onCloseTicket,
  consumableProducts,
  onAddConsumable,
  onDecrementConsumable,
}: ReceiptPanelProps) {
  const { t } = useTranslation();
  const showImages = loadShowProductImages();
  const effectiveMaxDiscount = maxDiscountPercent ?? DEFAULT_MAX_DISCOUNT_PERCENT;
  // Крестик закрытия вкладки должен быть виден всегда, а не только по hover — на кассовом
  // тачскрине (моноблок) наведения мышью не существует, hover-only крестик там нельзя было
  // нажать вообще. Непустой чек закрывается только после подтверждения — иначе случайный тап
  // по крестику безвозвратно теряет корзину покупателя.
  const [pendingCloseTicket, setPendingCloseTicket] = useState<Ticket | null>(null);

  function requestCloseTicket(ticket: Ticket) {
    if (ticket.lines.length === 0) {
      onCloseTicket(ticket.id);
    } else {
      setPendingCloseTicket(ticket);
    }
  }

  // preview — авторитетный итог с сервера (учитывает авто-скидки из «Скидки и акции»,
  // см. ReceiptsService.calculateTotals); пока не пришёл или сети нет — локальный расчёт
  // только по ручному %, как было до авто-скидок.
  const local = computeTotals(lines, discountPercent);
  const manualDiscountAmount = preview?.manualDiscountAmount ?? local.discountAmount;
  const autoDiscountAmount = preview?.autoDiscountTotal ?? 0;
  const total = preview?.total ?? local.total;

  return (
    <>
    <aside className="m-4 flex w-[340px] shrink-0 flex-col rounded-xl bg-white shadow-sm">
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto border-b border-slate-100 px-3 py-2.5">
        {tickets.map((ticket) => {
          const isActive = ticket.id === activeTicketId;
          const qty = ticket.lines.reduce((sum, line) => sum + line.qty, 0);
          const canClose = tickets.length > 1;
          return (
            <button
              key={ticket.id}
              onClick={() => onSwitchTicket(ticket.id)}
              className={`relative flex shrink-0 items-center gap-1 rounded-lg py-1.5 pl-3 text-xs font-bold transition ${
                canClose ? "pr-1.5" : "pr-3"
              } ${isActive ? "bg-accent text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
            >
              <span>{t("receipt.ticket", { n: ticket.label })}</span>
              {qty > 0 && <span className={isActive ? "text-white/80" : "text-slate-400"}>{qty}</span>}
              {canClose && (
                <span
                  role="button"
                  aria-label={t("receipt.closeTicket")}
                  onClick={(e) => {
                    e.stopPropagation();
                    requestCloseTicket(ticket);
                  }}
                  className={`ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                    isActive ? "hover:bg-white/20" : "hover:bg-slate-300"
                  }`}
                >
                  <CloseIcon width={10} height={10} />
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={onAddTicket}
          disabled={addTicketDisabled}
          aria-label={t("receipt.newTicket")}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm font-bold text-slate-400 hover:border-accent hover:text-accent disabled:opacity-30"
        >
          <PlusIcon width={14} height={14} />
        </button>
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

        {consumableProducts.length > 0 && (
          <div className="space-y-1.5 rounded-lg bg-slate-50 px-2 py-2">
            <div className="text-[11px] font-semibold text-slate-400">{t("receipt.consumables")}</div>
            <div className="flex flex-wrap gap-1.5">
              {consumableProducts.map((product) => {
                const line = lines.find((l) => l.product.id === product.id);
                const qty = line?.qty ?? 0;
                return (
                  <div
                    key={product.id}
                    className="flex items-center gap-0.5 rounded-full bg-white pl-1 pr-0.5 py-0.5 shadow-sm ring-1 ring-slate-200"
                  >
                    {qty > 0 && (
                      <button
                        onClick={() => onDecrementConsumable(product.id)}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
                        aria-label={t("common.remove")}
                      >
                        <MinusIcon width={12} height={12} />
                      </button>
                    )}
                    <span className="px-0.5 text-xs font-medium text-slate-700">{product.name}</span>
                    {qty > 0 && <span className="min-w-[14px] text-center text-xs font-bold text-accent">{qty}</span>}
                    <button
                      onClick={() => onAddConsumable(product)}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-accent hover:bg-accent/20"
                      aria-label={t("receipt.consumables")}
                    >
                      <PlusIcon width={12} height={12} />
                    </button>
                  </div>
                );
              })}
            </div>
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

    {pendingCloseTicket && (
      <ConfirmDialog
        title={t("receipt.closeTicket")}
        message={t("receipt.closeTicketConfirm", { n: pendingCloseTicket.label })}
        confirmLabel={t("receipt.closeTicket")}
        danger
        onClose={() => setPendingCloseTicket(null)}
        onConfirm={() => {
          onCloseTicket(pendingCloseTicket.id);
          setPendingCloseTicket(null);
        }}
      />
    )}
    </>
  );
}
