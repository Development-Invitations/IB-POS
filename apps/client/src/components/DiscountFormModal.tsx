import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AmountInput } from "./AmountInput";
import { CloseIcon } from "./icons";
import { ApiError, createDiscount, updateDiscount } from "../lib/api";
import type { ApiCategory, ApiDiscount, ApiProduct, DiscountType } from "../types/api";
import type { AuthSession, Role } from "../types/auth";

interface DiscountFormModalProps {
  session: AuthSession;
  products: ApiProduct[];
  categories: ApiCategory[];
  discount: ApiDiscount | null;
  onClose: () => void;
  onSaved: (discount: ApiDiscount) => void;
}

type Scope = "receipt" | "product" | "category";

const ROLES: Role[] = ["CASHIER", "WAREHOUSE", "MANAGER", "ACCOUNTANT", "ADMIN"];
const ROLE_KEY: Record<Role, string> = {
  CASHIER: "roles.cashier",
  MANAGER: "roles.manager",
  WAREHOUSE: "roles.warehouse",
  ADMIN: "roles.admin",
  ACCOUNTANT: "roles.accountant",
};

function initialScope(discount: ApiDiscount | null): Scope {
  if (discount?.productId) return "product";
  if (discount?.categoryId) return "category";
  return "receipt";
}

export function DiscountFormModal({
  session,
  products,
  categories,
  discount,
  onClose,
  onSaved,
}: DiscountFormModalProps) {
  const { t } = useTranslation();
  const isEdit = discount !== null;

  const [name, setName] = useState(discount?.name ?? "");
  const [type, setType] = useState<DiscountType>(discount?.type ?? "PERCENT");
  const [value, setValue] = useState(discount ? Number(discount.value) : 0);
  const [scope, setScope] = useState<Scope>(initialScope(discount));
  const [productId, setProductId] = useState(discount?.productId ?? "");
  const [categoryId, setCategoryId] = useState(discount?.categoryId ?? "");
  const [minRole, setMinRole] = useState<Role>(discount?.minRole ?? "CASHIER");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        type,
        value,
        productId: scope === "product" ? productId || undefined : undefined,
        categoryId: scope === "category" ? categoryId || undefined : undefined,
        minRole,
      };
      const saved = isEdit
        ? await updateDiscount(session.accessToken, discount.id, payload)
        : await createDiscount(session.accessToken, payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("discounts.saveError"));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    name.trim().length > 0 &&
    value > 0 &&
    (scope !== "product" || productId) &&
    (scope !== "category" || categoryId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-800">
            {isEdit ? t("discounts.editTitle") : t("discounts.addTitle")}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={t("common.close")}>
            <CloseIcon />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4">
          <label className="block text-xs font-medium text-slate-500">
            {t("discounts.name")}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-500">
              {t("discounts.type")}
              <select
                value={type}
                onChange={(e) => setType(e.target.value as DiscountType)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="PERCENT">{t("discounts.percent")}</option>
                <option value="FIXED">{t("discounts.fixed")}</option>
              </select>
            </label>

            <label className="block text-xs font-medium text-slate-500">
              {type === "PERCENT" ? t("discounts.valuePercent") : t("discounts.valueFixed")}
              {type === "PERCENT" ? (
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={value}
                  onChange={(e) => setValue(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-accent"
                />
              ) : (
                <AmountInput
                  value={value}
                  onChange={setValue}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-accent"
                />
              )}
            </label>
          </div>

          <label className="block text-xs font-medium text-slate-500">
            {t("discounts.scope")}
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as Scope)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="receipt">{t("discounts.scopeReceipt")}</option>
              <option value="product">{t("discounts.scopeProduct")}</option>
              <option value="category">{t("discounts.scopeCategory")}</option>
            </select>
          </label>

          {scope === "product" && (
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="" disabled>
                —
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          {scope === "category" && (
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="" disabled>
                —
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          <label className="block text-xs font-medium text-slate-500">
            {t("discounts.minRole")}
            <select
              value={minRole}
              onChange={(e) => setMinRole(e.target.value as Role)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(ROLE_KEY[r])}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] font-normal text-slate-400">{t("discounts.minRoleHint")}</span>
          </label>

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
            disabled={submitting || !canSubmit}
            className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {submitting ? t("common.loading") : t("products.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
