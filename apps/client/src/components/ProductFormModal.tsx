import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AmountInput } from "./AmountInput";
import { CloseIcon } from "./icons";
import { ApiError, createCategory, createProduct, updateProduct } from "../lib/api";
import type { ApiCategory, ApiProduct } from "../types/api";
import type { AuthSession } from "../types/auth";

interface ProductFormModalProps {
  session: AuthSession;
  categories: ApiCategory[];
  product: ApiProduct | null;
  onClose: () => void;
  onSaved: (product: ApiProduct, newCategory?: ApiCategory) => void;
}

const NEW_CATEGORY_VALUE = "__new__";

export function ProductFormModal({ session, categories, product, onClose, onSaved }: ProductFormModalProps) {
  const { t } = useTranslation();
  const isEdit = product !== null;

  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [price, setPrice] = useState(product ? Number(product.price) : 0);
  const [cost, setCost] = useState(product?.cost ? Number(product.cost) : 0);
  const [unit, setUnit] = useState(product?.unit ?? "pcs");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      let finalCategoryId = categoryId || undefined;
      let createdCategory: ApiCategory | undefined;

      if (categoryId === NEW_CATEGORY_VALUE) {
        if (!newCategoryName.trim()) {
          setError(t("products.categoryNameRequired"));
          setSubmitting(false);
          return;
        }
        createdCategory = await createCategory(session.accessToken, newCategoryName.trim());
        finalCategoryId = createdCategory.id;
      }

      const payload = {
        name: name.trim(),
        categoryId: finalCategoryId,
        sku: sku.trim() || undefined,
        barcode: barcode.trim() || undefined,
        price,
        cost: cost > 0 ? cost : undefined,
        unit: unit.trim() || "pcs",
      };

      const saved = isEdit
        ? await updateProduct(session.accessToken, product.id, payload)
        : await createProduct(session.accessToken, payload);

      onSaved(saved, createdCategory);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("products.saveError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-800">
            {isEdit ? t("products.editTitle") : t("products.addTitle")}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={t("common.close")}>
            <CloseIcon />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4">
          <label className="block text-xs font-medium text-slate-500">
            {t("products.name")}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          <label className="block text-xs font-medium text-slate-500">
            {t("products.category")}
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={NEW_CATEGORY_VALUE}>{t("products.newCategory")}</option>
            </select>
          </label>

          {categoryId === NEW_CATEGORY_VALUE && (
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder={t("products.newCategoryPlaceholder")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-500">
              {t("products.sku")}
              <input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="block text-xs font-medium text-slate-500">
              {t("products.barcode")}
              <input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block text-xs font-medium text-slate-500">
              {t("products.price")}
              <AmountInput
                value={price}
                onChange={setPrice}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-accent"
              />
            </label>
            <label className="block text-xs font-medium text-slate-500">
              {t("products.cost")}
              <AmountInput
                value={cost}
                onChange={setCost}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-accent"
              />
            </label>
            <label className="block text-xs font-medium text-slate-500">
              {t("products.unit")}
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50"
          >
            {t("returns.cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !name.trim() || price <= 0}
            className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {submitting ? t("common.loading") : t("products.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
