import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, getCustomers } from "../lib/api";
import { formatSum } from "../lib/format";
import { CustomerFormModal } from "./CustomerFormModal";
import { CustomerDetailModal } from "./CustomerDetailModal";
import { PlusIcon, SearchIcon } from "./icons";
import type { ApiCustomer } from "../types/api";
import type { AuthSession } from "../types/auth";

interface CustomersScreenProps {
  session: AuthSession;
}

const CAN_MANAGE_ROLES: AuthSession["role"][] = ["ADMIN", "MANAGER", "CASHIER"];

export function CustomersScreen({ session }: CustomersScreenProps) {
  const { t } = useTranslation();
  const canManage = CAN_MANAGE_ROLES.includes(session.role);

  const [customers, setCustomers] = useState<ApiCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<ApiCustomer | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<ApiCustomer | null>(null);

  async function load(query?: string) {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await getCustomers(session.accessToken, query);
      setCustomers(list);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setAccessDenied(true);
      } else {
        setLoadError(err instanceof ApiError ? err.message : t("customers.loadError"));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken]);

  useEffect(() => {
    const id = setTimeout(() => load(search), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function openCreate() {
    setEditingCustomer(null);
    setFormOpen(true);
  }

  function handleSaved(saved: ApiCustomer) {
    setCustomers((prev) => {
      const exists = prev.some((c) => c.id === saved.id);
      return exists ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved];
    });
    setFormOpen(false);
    if (detailCustomer?.id === saved.id) setDetailCustomer(saved);
  }

  if (accessDenied) {
    return (
      <div className="mx-auto max-w-md pt-16 text-center">
        <p className="text-sm text-slate-500">{t("customers.accessDenied")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">{t("nav.customers")}</h1>
        {canManage && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover"
          >
            <PlusIcon width={16} height={16} />
            {t("customers.addTitle")}
          </button>
        )}
      </div>

      <div className="relative max-w-sm">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("customers.searchPlaceholder")}
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:border-accent"
        />
      </div>

      {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}
      {loadError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{loadError}</p>}

      {!loading && !loadError && (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="px-4 py-3 font-medium">{t("customers.fullName")}</th>
                <th className="px-4 py-3 font-medium">{t("customers.phone")}</th>
                <th className="px-4 py-3 font-medium text-right">{t("customers.bonusBalance")}</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setDetailCustomer(c)}
                  className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-medium text-slate-800">{c.fullName}</td>
                  <td className="px-4 py-3 text-slate-500">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-slate-800">
                    {formatSum(Number(c.bonusBalance))} {t("common.currency")}
                  </td>
                </tr>
              ))}

              {customers.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-400">
                    {t("customers.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <CustomerFormModal
          session={session}
          customer={editingCustomer}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {detailCustomer && (
        <CustomerDetailModal
          session={session}
          customer={detailCustomer}
          canManage={canManage}
          onClose={() => setDetailCustomer(null)}
          onEdit={() => {
            setEditingCustomer(detailCustomer);
            setFormOpen(true);
          }}
          onBonusChanged={(updated) => {
            setDetailCustomer(updated);
            setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
          }}
        />
      )}
    </div>
  );
}
