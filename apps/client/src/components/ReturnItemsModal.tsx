import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, getReceipt, loginPin, returnReceipt, type ReturnReceiptResult } from "../lib/api";
import { formatSum } from "../lib/format";
import { sessionFromToken } from "../lib/session";
import { CloseIcon } from "./icons";
import type { ApiReceipt } from "../types/api";
import type { AuthSession } from "../types/auth";

interface ReturnItemsModalProps {
  session: AuthSession;
  receiptId: string;
  onClose: () => void;
  onReturned: (result: ReturnReceiptResult) => void;
}

// Не из исходного ТЗ — по прямому запросу клиента: если в чеке 4–6 позиций, а вернуть просят
// только одну, должна быть возможность выбрать именно её, а не отменять весь чек. Каждая
// позиция — свой чекбокс + количество (по умолчанию ничего не выбрано: возврат — денежная
// операция, лучше явный выбор, чем случайно подтверждённый "выбрано всё").
export function ReturnItemsModal({ session, receiptId, onClose, onReturned }: ReturnItemsModalProps) {
  const { t } = useTranslation();
  const [receipt, setReceipt] = useState<ApiReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [managerLogin, setManagerLogin] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getReceipt(session.accessToken, receiptId)
      .then((r) => {
        if (!cancelled) setReceipt(r);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : t("returns.loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptId]);

  const returnableItems = useMemo(
    () =>
      (receipt?.items ?? [])
        .map((item) => ({
          ...item,
          remaining: Number(item.quantity) - Number(item.returnedQuantity),
        }))
        .filter((item) => item.remaining > 0),
    [receipt],
  );

  function toggleItem(itemId: string, remaining: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (checked) {
        next.set(itemId, remaining);
      } else {
        next.delete(itemId);
      }
      return next;
    });
  }

  function setQty(itemId: string, remaining: number, value: number) {
    const clamped = Math.min(Math.max(0, value), remaining);
    setSelected((prev) => {
      const next = new Map(prev);
      if (clamped > 0) next.set(itemId, clamped);
      else next.delete(itemId);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Map(returnableItems.map((item) => [item.id, item.remaining])));
  }

  function selectNone() {
    setSelected(new Map());
  }

  const refundEstimate = returnableItems.reduce(
    (sum, item) => sum + (selected.get(item.id) ?? 0) * Number(item.price),
    0,
  );

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const { accessToken } = await loginPin(session.organizationId, managerLogin.trim(), pin);
      const approver = sessionFromToken(accessToken);
      if (!approver) {
        setError(t("returns.wrongPin"));
        return;
      }
      if (approver.role !== "ADMIN" && approver.role !== "MANAGER") {
        setError(t("returns.notAuthorized"));
        return;
      }
      const items = [...selected.entries()].map(([receiptItemId, quantity]) => ({
        receiptItemId,
        quantity,
      }));
      const result = await returnReceipt(approver.accessToken, receiptId, items);
      onReturned(result);
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

  const canConfirm = selected.size > 0 && managerLogin.trim().length > 0 && pin.length >= 4;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-800">{t("returns.itemsTitle")}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={t("common.close")}>
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}
          {loadError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{loadError}</p>}

          {!loading && !loadError && returnableItems.length === 0 && (
            <p className="text-sm text-slate-400">{t("returns.nothingToReturn")}</p>
          )}

          {!loading && !loadError && returnableItems.length > 0 && (
            <>
              <div className="flex justify-end gap-3 text-xs font-medium text-accent">
                <button onClick={selectAll} className="hover:underline">
                  {t("returns.selectAll")}
                </button>
                <button onClick={selectNone} className="hover:underline">
                  {t("returns.selectNone")}
                </button>
              </div>

              <div className="divide-y divide-slate-50 rounded-lg border border-slate-100">
                {returnableItems.map((item) => {
                  const qty = selected.get(item.id) ?? 0;
                  const checked = selected.has(item.id);
                  return (
                    <div key={item.id} className="flex items-center gap-3 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => toggleItem(item.id, item.remaining, e.target.checked)}
                        className="h-4 w-4 shrink-0 rounded border-slate-300 text-accent focus:ring-accent"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-800">
                          {item.product?.name ?? item.productId}
                        </div>
                        <div className="text-xs text-slate-400">
                          {t("returns.itemAvailable", { qty: item.remaining, unit: item.product?.unit ?? "" })}
                          {Number(item.returnedQuantity) > 0 &&
                            ` · ${t("returns.itemAlreadyReturned", { qty: Number(item.returnedQuantity) })}`}
                        </div>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={item.remaining}
                        step="any"
                        value={checked ? qty : ""}
                        disabled={!checked}
                        onChange={(e) => setQty(item.id, item.remaining, Number(e.target.value))}
                        className="w-20 shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm outline-none focus:border-accent disabled:bg-slate-50"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-500">{t("returns.refundEstimate")}</span>
                <span className="font-semibold text-slate-800">
                  {formatSum(refundEstimate)} {t("common.currency")}
                </span>
              </div>

              <div className="space-y-3 border-t border-slate-100 pt-3">
                <p className="text-sm text-slate-500">{t("returns.confirmText")}</p>
                <label className="block text-xs font-medium text-slate-500">
                  {t("returns.managerLogin")}
                  <input
                    value={managerLogin}
                    onChange={(e) => {
                      setManagerLogin(e.target.value);
                      setError(null);
                    }}
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
            </>
          )}
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
            disabled={submitting || !canConfirm}
            className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {t("returns.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
