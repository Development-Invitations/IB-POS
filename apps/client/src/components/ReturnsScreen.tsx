import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, getReceipts, getStores, returnReceipt } from "../lib/api";
import { formatSum } from "../lib/format";
import { ReturnConfirmModal } from "./ReturnConfirmModal";
import type { ApiReceipt, ApiStore, ReceiptStatus } from "../types/api";
import type { AuthSession } from "../types/auth";

interface ReturnsScreenProps {
  session: AuthSession;
}

const CAN_VIEW_ROLES: AuthSession["role"][] = ["ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"];
const CAN_INITIATE_ROLES: AuthSession["role"][] = ["ADMIN", "MANAGER", "CASHIER"];

const STATUS_KEY: Record<ReceiptStatus, string> = {
  OPEN: "customers.statusOpen",
  PAID: "customers.statusPaid",
  RETURNED: "customers.statusReturned",
  VOID: "customers.statusVoid",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function ReturnsScreen({ session }: ReturnsScreenProps) {
  const { t } = useTranslation();
  const canView = CAN_VIEW_ROLES.includes(session.role);
  const canInitiate = CAN_INITIATE_ROLES.includes(session.role);

  const [stores, setStores] = useState<ApiStore[]>([]);
  const [storeId, setStoreId] = useState("");
  const [from, setFrom] = useState(daysAgoIso(7));
  const [to, setTo] = useState(todayIso());
  const [search, setSearch] = useState("");

  const [receipts, setReceipts] = useState<ApiReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [returnTarget, setReturnTarget] = useState<ApiReceipt | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);

  useEffect(() => {
    if (!canView) return;
    getStores(session.accessToken)
      .then(setStores)
      .catch(() => undefined);
  }, [session.accessToken, canView]);

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const list = await getReceipts(session.accessToken, {
          storeId: storeId || undefined,
          from,
          to,
          search: search.trim() || undefined,
        });
        if (!cancelled) setReceipts(list);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : t("returns.loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    const timer = setTimeout(load, search ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken, storeId, from, to, search, canView]);

  async function confirmReturn(approver: AuthSession) {
    if (!returnTarget) return;
    await returnReceipt(approver.accessToken, returnTarget.id);
    setReceipts((prev) =>
      prev.map((r) => (r.id === returnTarget.id ? { ...r, status: "RETURNED" } : r)),
    );
    setDoneId(returnTarget.id);
    setReturnTarget(null);
  }

  if (!canView) {
    return (
      <div className="mx-auto max-w-md pt-16 text-center">
        <p className="text-sm text-slate-500">{t("returns.accessDenied")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">{t("nav.returns")}</h1>
      </div>

      {!canInitiate && <p className="text-sm text-slate-400">{t("returns.viewOnlyHint")}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-500">
          {t("reports.from")}
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="text-xs font-medium text-slate-500">
          {t("reports.to")}
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <div className="flex gap-1">
          <button
            onClick={() => {
              setFrom(todayIso());
              setTo(todayIso());
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            {t("reports.today")}
          </button>
          <button
            onClick={() => {
              setFrom(daysAgoIso(7));
              setTo(todayIso());
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            {t("reports.week")}
          </button>
          <button
            onClick={() => {
              setFrom(daysAgoIso(30));
              setTo(todayIso());
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            {t("reports.month")}
          </button>
        </div>

        {stores.length > 1 && (
          <label className="text-xs font-medium text-slate-500">
            {t("workstation.store")}
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">{t("reports.allStores")}</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="min-w-[200px] flex-1 text-xs font-medium text-slate-500">
          {t("returns.search")}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("returns.searchPlaceholder")}
            className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
      </div>

      {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}
      {loadError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{loadError}</p>}

      {!loading && !loadError && (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="px-4 py-3 font-medium">{t("returns.receiptCode")}</th>
                <th className="px-4 py-3 font-medium">{t("returns.date")}</th>
                <th className="px-4 py-3 font-medium">{t("returns.customer")}</th>
                <th className="px-4 py-3 font-medium text-right">{t("returns.total")}</th>
                <th className="px-4 py-3 font-medium">{t("returns.status")}</th>
                {canInitiate && <th className="px-4 py-3 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-slate-600">
                    {r.id.slice(0, 8).toUpperCase()}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{new Date(r.createdAt).toLocaleString("ru-RU")}</td>
                  <td className="px-4 py-3 text-slate-500">{r.customer?.fullName ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">
                    {formatSum(Number(r.total))} {t("common.currency")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.status === "PAID"
                          ? "bg-emerald-50 text-emerald-600"
                          : r.status === "RETURNED"
                            ? "bg-amber-50 text-amber-600"
                            : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {t(STATUS_KEY[r.status])}
                    </span>
                    {doneId === r.id && (
                      <span className="ml-2 text-xs text-emerald-600">{t("returns.done")}</span>
                    )}
                  </td>
                  {canInitiate && (
                    <td className="px-4 py-3 text-right">
                      {r.status === "PAID" && (
                        <button
                          onClick={() => setReturnTarget(r)}
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          {t("returns.action")}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}

              {receipts.length === 0 && (
                <tr>
                  <td colSpan={canInitiate ? 6 : 5} className="px-4 py-8 text-center text-sm text-slate-400">
                    {t("returns.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {returnTarget && (
        <ReturnConfirmModal
          organizationId={session.organizationId}
          onClose={() => setReturnTarget(null)}
          onConfirm={confirmReturn}
        />
      )}
    </div>
  );
}
