import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CloseIcon } from "./icons";
import { ApiError, createCustomer, updateCustomer } from "../lib/api";
import type { ApiCustomer } from "../types/api";
import type { AuthSession } from "../types/auth";

interface CustomerFormModalProps {
  session: AuthSession;
  customer: ApiCustomer | null;
  onClose: () => void;
  onSaved: (customer: ApiCustomer) => void;
}

export function CustomerFormModal({ session, customer, onClose, onSaved }: CustomerFormModalProps) {
  const { t } = useTranslation();
  const isEdit = customer !== null;

  const [fullName, setFullName] = useState(customer?.fullName ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const payload = { fullName: fullName.trim(), phone: phone.trim() || undefined };
      const saved = isEdit
        ? await updateCustomer(session.accessToken, customer.id, payload)
        : await createCustomer(session.accessToken, payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("customers.saveError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-800">
            {isEdit ? t("customers.editTitle") : t("customers.addTitle")}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={t("common.close")}>
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <label className="block text-xs font-medium text-slate-500">
            {t("customers.fullName")}
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoFocus
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          <label className="block text-xs font-medium text-slate-500">
            {t("customers.phone")}
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+998 90 123-45-67"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
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
            disabled={submitting || !fullName.trim()}
            className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {submitting ? t("common.loading") : t("products.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
