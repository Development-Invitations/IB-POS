import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AmountInput } from "./AmountInput";
import { CloseIcon } from "./icons";
import { ApiError, updateUser } from "../lib/api";
import type { ApiUser } from "../types/api";
import type { AuthSession } from "../types/auth";

interface EmployeeSalaryModalProps {
  session: AuthSession;
  employee: ApiUser;
  onClose: () => void;
  onSaved: (user: ApiUser) => void;
}

// Отдельная лёгкая модалка вместо переиспользования EmployeeFormModal — Бухгалтеру (см.
// UsersService.update на сервере) можно менять только зарплату, ни роль/PIN/пароль/статус ему
// не видны вообще, а не просто задизейблены в общей форме.
export function EmployeeSalaryModal({ session, employee, onClose, onSaved }: EmployeeSalaryModalProps) {
  const { t } = useTranslation();
  const [salary, setSalary] = useState(employee.salary ? Number(employee.salary) : 0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const saved = await updateUser(session.accessToken, employee.id, { salary });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("employees.saveError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-800">{t("employees.salaryTitle")}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={t("common.close")}>
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-slate-500">{employee.fullName}</p>
          <label className="block text-xs font-medium text-slate-500">
            {t("employees.salary")}
            <AmountInput
              value={salary}
              onChange={setSalary}
              autoFocus
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-accent"
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
            disabled={submitting}
            className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {submitting ? t("common.loading") : t("products.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
