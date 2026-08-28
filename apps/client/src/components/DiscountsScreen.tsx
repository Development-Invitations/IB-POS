import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, deactivateDiscount, getCategories, getDiscounts, getProducts, updateDiscount } from "../lib/api";
import { formatSum } from "../lib/format";
import { ConfirmDialog } from "./ConfirmDialog";
import { DiscountFormModal } from "./DiscountFormModal";
import { PlusIcon } from "./icons";
import type { ApiCategory, ApiDiscount, ApiProduct } from "../types/api";
import type { AuthSession, Role } from "../types/auth";

interface DiscountsScreenProps {
  session: AuthSession;
}

const CAN_MANAGE_ROLES: AuthSession["role"][] = ["ADMIN", "MANAGER"];
const ROLE_KEY: Record<Role, string> = {
  CASHIER: "roles.cashier",
  MANAGER: "roles.manager",
  WAREHOUSE: "roles.warehouse",
  ADMIN: "roles.admin",
  ACCOUNTANT: "roles.accountant",
};

export function DiscountsScreen({ session }: DiscountsScreenProps) {
  const { t } = useTranslation();
  const canManage = CAN_MANAGE_ROLES.includes(session.role);

  const [discounts, setDiscounts] = useState<ApiDiscount[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<ApiDiscount | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ApiDiscount | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const [discountList, productList, categoryList] = await Promise.all([
        getDiscounts(session.accessToken),
        getProducts(session.accessToken),
        getCategories(session.accessToken),
      ]);
      setDiscounts(discountList);
      setProducts(productList);
      setCategories(categoryList);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("discounts.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken]);

  const productName = useMemo(() => {
    const map = new Map(products.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? (map.get(id) ?? "") : "");
  }, [products]);

  const categoryName = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (map.get(id) ?? "") : "");
  }, [categories]);

  function scopeLabel(discount: ApiDiscount) {
    if (discount.productId) return `${t("discounts.scopeProduct")}: ${productName(discount.productId)}`;
    if (discount.categoryId) return `${t("discounts.scopeCategory")}: ${categoryName(discount.categoryId)}`;
    return t("discounts.scopeReceipt");
  }

  function openCreate() {
    setEditingDiscount(null);
    setFormOpen(true);
  }

  function openEdit(discount: ApiDiscount) {
    setEditingDiscount(discount);
    setFormOpen(true);
  }

  function handleSaved(saved: ApiDiscount) {
    setDiscounts((prev) => {
      const exists = prev.some((d) => d.id === saved.id);
      return exists ? prev.map((d) => (d.id === saved.id ? saved : d)) : [...prev, saved];
    });
    setFormOpen(false);
  }

  async function handleToggleActive(discount: ApiDiscount) {
    if (discount.isActive) {
      setConfirmTarget(discount);
      return;
    }
    try {
      const saved = await updateDiscount(session.accessToken, discount.id, { isActive: true });
      setDiscounts((prev) => prev.map((d) => (d.id === saved.id ? saved : d)));
    } catch {
      // не критично — кнопка остаётся доступной для повтора
    }
  }

  async function confirmDeactivate() {
    if (!confirmTarget) return;
    setConfirmSubmitting(true);
    try {
      await deactivateDiscount(session.accessToken, confirmTarget.id);
      setDiscounts((prev) =>
        prev.map((d) => (d.id === confirmTarget.id ? { ...d, isActive: false } : d)),
      );
      setConfirmTarget(null);
    } catch {
      // ошибку молча оставляем — диалог остаётся открытым
    } finally {
      setConfirmSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">{t("nav.discounts")}</h1>
        {canManage && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover"
          >
            <PlusIcon width={16} height={16} />
            {t("discounts.addTitle")}
          </button>
        )}
      </div>

      {!canManage && <p className="text-sm text-slate-400">{t("discounts.readOnlyHint")}</p>}

      {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}
      {loadError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{loadError}</p>}

      {!loading && !loadError && (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="px-4 py-3 font-medium">{t("discounts.name")}</th>
                <th className="px-4 py-3 font-medium">{t("discounts.value")}</th>
                <th className="px-4 py-3 font-medium">{t("discounts.scope")}</th>
                <th className="px-4 py-3 font-medium">{t("discounts.minRole")}</th>
                <th className="px-4 py-3 font-medium">{t("products.status")}</th>
                {canManage && <th className="px-4 py-3 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {discounts.map((d) => (
                <tr key={d.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{d.name}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {d.type === "PERCENT" ? `${d.value}%` : `${formatSum(Number(d.value))} ${t("common.currency")}`}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{scopeLabel(d)}</td>
                  <td className="px-4 py-3 text-slate-500">{t(ROLE_KEY[d.minRole])}</td>
                  <td className="px-4 py-3">
                    {d.isActive ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
                        {t("products.active")}
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        {t("products.inactive")}
                      </span>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => openEdit(d)}
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          {t("products.edit")}
                        </button>
                        <button
                          onClick={() => handleToggleActive(d)}
                          className="text-xs font-medium text-slate-400 hover:text-slate-700"
                        >
                          {d.isActive ? t("products.deactivate") : t("products.activate")}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}

              {discounts.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="px-4 py-8 text-center text-sm text-slate-400">
                    {t("discounts.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <DiscountFormModal
          session={session}
          products={products}
          categories={categories}
          discount={editingDiscount}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {confirmTarget && (
        <ConfirmDialog
          title={t("discounts.deactivateTitle")}
          message={t("discounts.deactivateConfirm", { name: confirmTarget.name })}
          confirmLabel={t("products.deactivate")}
          danger
          submitting={confirmSubmitting}
          onClose={() => setConfirmTarget(null)}
          onConfirm={confirmDeactivate}
        />
      )}
    </div>
  );
}
