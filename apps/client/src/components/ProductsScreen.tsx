import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE, ApiError, deactivateProduct, getCategories, getProducts, updateProduct } from "../lib/api";
import { formatSum } from "../lib/format";
import { ConfirmDialog } from "./ConfirmDialog";
import { ProductFormModal } from "./ProductFormModal";
import { PlusIcon, SearchIcon } from "./icons";
import type { ApiCategory, ApiProduct } from "../types/api";
import type { AuthSession } from "../types/auth";

interface ProductsScreenProps {
  session: AuthSession;
  onCatalogChanged: () => void;
}

const CAN_MANAGE_ROLES: AuthSession["role"][] = ["ADMIN", "MANAGER", "WAREHOUSE"];

export function ProductsScreen({ session, onCatalogChanged }: ProductsScreenProps) {
  const { t } = useTranslation();
  const canManage = CAN_MANAGE_ROLES.includes(session.role);

  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ApiProduct | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ApiProduct | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const [productList, categoryList] = await Promise.all([
        getProducts(session.accessToken),
        getCategories(session.accessToken),
      ]);
      setProducts(productList);
      setCategories(categoryList);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("products.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken]);

  const categoryName = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (map.get(id) ?? "") : "");
  }, [categories]);

  const filtered = products.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.sku ?? "").toLowerCase().includes(q) ||
      (p.barcode ?? "").toLowerCase().includes(q)
    );
  });

  function openCreate() {
    setEditingProduct(null);
    setFormOpen(true);
  }

  function openEdit(product: ApiProduct) {
    setEditingProduct(product);
    setFormOpen(true);
  }

  function handleSaved(saved: ApiProduct, newCategory?: ApiCategory) {
    setProducts((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      return exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved];
    });
    if (newCategory) {
      setCategories((prev) => [...prev, newCategory]);
    }
    setFormOpen(false);
    onCatalogChanged();
  }

  async function handleToggleActive(product: ApiProduct) {
    if (product.isActive) {
      setConfirmTarget(product);
      return;
    }
    try {
      const saved = await updateProduct(session.accessToken, product.id, { isActive: true });
      setProducts((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      onCatalogChanged();
    } catch {
      // молча игнорируем — точка не критична для основного потока, кнопка останется активной
    }
  }

  async function confirmDeactivate() {
    if (!confirmTarget) return;
    setConfirmSubmitting(true);
    try {
      await deactivateProduct(session.accessToken, confirmTarget.id);
      setProducts((prev) =>
        prev.map((p) => (p.id === confirmTarget.id ? { ...p, isActive: false } : p)),
      );
      onCatalogChanged();
      setConfirmTarget(null);
    } catch {
      // ошибку молча оставляем — диалог остаётся открытым, пользователь может повторить
    } finally {
      setConfirmSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">{t("nav.products")}</h1>
        {canManage && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover"
          >
            <PlusIcon width={16} height={16} />
            {t("products.addTitle")}
          </button>
        )}
      </div>

      <div className="relative max-w-sm">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("products.searchPlaceholder")}
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
                <th className="px-4 py-3 font-medium" />
                <th className="px-4 py-3 font-medium">{t("products.name")}</th>
                <th className="px-4 py-3 font-medium">{t("products.category")}</th>
                <th className="px-4 py-3 font-medium">{t("products.sku")}</th>
                <th className="px-4 py-3 font-medium text-right">{t("products.price")}</th>
                <th className="px-4 py-3 font-medium text-right">{t("products.cost")}</th>
                <th className="px-4 py-3 font-medium">{t("products.unit")}</th>
                <th className="px-4 py-3 font-medium">{t("products.status")}</th>
                {canManage && <th className="px-4 py-3 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-slate-50 text-xs font-bold text-slate-400">
                      {p.imageUrl ? (
                        <img src={`${API_BASE}${p.imageUrl}`} alt="" className="h-full w-full object-cover" />
                      ) : (
                        p.name.trim().slice(0, 2).toUpperCase()
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                  <td className="px-4 py-3 text-slate-500">{categoryName(p.categoryId)}</td>
                  <td className="px-4 py-3 text-slate-500">{p.sku}</td>
                  <td className="px-4 py-3 text-right text-slate-800">
                    {formatSum(Number(p.price))} {t("common.currency")}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">
                    {p.cost ? `${formatSum(Number(p.cost))} ${t("common.currency")}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{p.unit}</td>
                  <td className="px-4 py-3">
                    {p.isActive ? (
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
                          onClick={() => openEdit(p)}
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          {t("products.edit")}
                        </button>
                        <button
                          onClick={() => handleToggleActive(p)}
                          className="text-xs font-medium text-slate-400 hover:text-slate-700"
                        >
                          {p.isActive ? t("products.deactivate") : t("products.activate")}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 9 : 8} className="px-4 py-8 text-center text-sm text-slate-400">
                    {t("products.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <ProductFormModal
          session={session}
          categories={categories}
          product={editingProduct}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {confirmTarget && (
        <ConfirmDialog
          title={t("products.deactivateTitle")}
          message={t("products.deactivateConfirm", { name: confirmTarget.name })}
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
