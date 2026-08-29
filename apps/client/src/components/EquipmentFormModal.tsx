import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CloseIcon } from "./icons";
import { ApiError, createEquipment, updateEquipment } from "../lib/api";
import type { ApiEquipment, EquipmentKind } from "../types/api";
import type { AuthSession } from "../types/auth";

interface EquipmentFormModalProps {
  session: AuthSession;
  equipment: ApiEquipment | null;
  onClose: () => void;
  onSaved: (equipment: ApiEquipment) => void;
}

const KINDS: EquipmentKind[] = [
  "FISCAL_REGISTRAR",
  "CASH_DRAWER",
  "CUSTOMER_DISPLAY",
  "PAYMENT_TERMINAL",
  "BARCODE_SCANNER",
  "OTHER",
];

export function EquipmentFormModal({ session, equipment, onClose, onSaved }: EquipmentFormModalProps) {
  const { t } = useTranslation();
  const isEdit = equipment !== null;

  const [kind, setKind] = useState<EquipmentKind>(equipment?.kind ?? "OTHER");
  const [label, setLabel] = useState(equipment?.label ?? "");
  const [description, setDescription] = useState(equipment?.description ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        kind,
        label: label.trim(),
        description: description.trim() || undefined,
      };
      const saved = isEdit
        ? await updateEquipment(session.accessToken, equipment.id, payload)
        : await createEquipment(session.accessToken, payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("equipment.saveError"));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = label.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-800">
            {isEdit ? t("equipment.editTitle") : t("equipment.addTitle")}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={t("common.close")}>
            <CloseIcon />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4">
          <label className="block text-xs font-medium text-slate-500">
            {t("equipment.kind")}
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as EquipmentKind)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`equipment.devices.${k.toLowerCase()}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-slate-500">
            {t("equipment.label")}
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              placeholder={t("equipment.labelPlaceholder")}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          <label className="block text-xs font-medium text-slate-500">
            {t("equipment.description")}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t("equipment.descriptionPlaceholder")}
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
