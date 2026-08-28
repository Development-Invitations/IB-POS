import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CloseIcon } from "./icons";
import { AmountInput } from "./AmountInput";
import { formatSum } from "../lib/format";
import { ApiError, adjustCustomerBonus, getCustomerPurchaseHistory } from "../lib/api";
import type { ApiCustomer, ApiReceipt, ReceiptStatus } from "../types/api";
import type { AuthSession } from "../types/auth";

interface CustomerDetailModalProps {
  session: AuthSession;
  customer: ApiCustomer;
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
  onBonusChanged: (customer: ApiCustomer) => void;
}

const STATUS_KEY: Record<ReceiptStatus, string> = {
  OPEN: "customers.statusOpen",
  PAID: "customers.statusPaid",
  RETURNED: "customers.statusReturned",
  VOID: "customers.statusVoid",
};

export function CustomerDetailModal({
  session,
  customer,
  canManage,
  onClose,
  onEdit,
  onBonusChanged,
}: CustomerDetailModalProps) {
  const { t } = useTranslation();
  const [receipts, setReceipts] = useState<ApiReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [bonusAmount, setBonusAmount] = useState(0);
  const [bonusSubmitting, setBonusSubmitting] = useState(false);
  const [bonusError, setBonusError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const history = await getCustomerPurchaseHistory(session.accessToken, customer.id);
        if (!cancelled) setReceipts(history);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : t("customers.historyError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id]);

  async function handleBonus(sign: 1 | -1) {
    if (bonusAmount <= 0) return;
    setBonusSubmitting(true);
    setBonusError(null);
    try {
      const updated = await adjustCustomerBonus(session.accessToken, customer.id, sign * bonusAmount);
      onBonusChanged(updated);
      setBonusAmount(0);
    } catch (err) {
      setBonusError(err instanceof ApiError ? err.message : t("customers.saveError"));
    } finally {
      setBonusSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{customer.fullName}</h2>
            {customer.phone && <p className="text-xs text-slate-400">{customer.phone}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={t("common.close")}>
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">{t("customers.bonusBalance")}</span>
              <span className="text-lg font-bold text-slate-800">
                {formatSum(Number(customer.bonusBalance))} {t("common.currency")}
              </span>
            </div>

            {canManage && (
              <div className="mt-3 flex items-center gap-2">
                <AmountInput
                  value={bonusAmount}
                  onChange={setBonusAmount}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <button
                  onClick={() => handleBonus(1)}
                  disabled={bonusSubmitting || bonusAmount <= 0}
                  className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
                >
                  +
                </button>
                <button
                  onClick={() => handleBonus(-1)}
                  disabled={bonusSubmitting || bonusAmount <= 0}
                  className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                >
                  −
                </button>
              </div>
            )}
            {bonusError && <p className="mt-2 text-xs text-red-600">{bonusError}</p>}

            {canManage && (
              <button onClick={onEdit} className="mt-3 text-xs font-medium text-accent hover:underline">
                {t("customers.edit")}
              </button>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">{t("customers.purchaseHistory")}</h3>
            {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}
            {loadError && <p className="text-sm text-red-600">{loadError}</p>}
            {!loading && !loadError && receipts.length === 0 && (
              <p className="text-sm text-slate-400">{t("customers.noPurchases")}</p>
            )}
            {!loading && receipts.length > 0 && (
              <div className="divide-y divide-slate-50 rounded-lg border border-slate-100">
                {receipts.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <div className="text-slate-700">{new Date(r.createdAt).toLocaleString("ru-RU")}</div>
                      <div className="text-xs text-slate-400">{t(STATUS_KEY[r.status])}</div>
                    </div>
                    <div className="font-semibold text-slate-800">
                      {formatSum(Number(r.total))} {t("common.currency")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
