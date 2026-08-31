import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CloseIcon } from "./icons";
import { ApiError, createUser, updateUser } from "../lib/api";
import type { ApiUser } from "../types/api";
import type { AuthSession, Role } from "../types/auth";

interface EmployeeFormModalProps {
  session: AuthSession;
  employee: ApiUser | null;
  onClose: () => void;
  onSaved: (user: ApiUser) => void;
}

const ROLES: Role[] = ["CASHIER", "WAREHOUSE", "MANAGER", "ACCOUNTANT", "ADMIN"];
const ROLE_KEY: Record<Role, string> = {
  CASHIER: "roles.cashier",
  MANAGER: "roles.manager",
  WAREHOUSE: "roles.warehouse",
  ADMIN: "roles.admin",
  ACCOUNTANT: "roles.accountant",
};

export function EmployeeFormModal({ session, employee, onClose, onSaved }: EmployeeFormModalProps) {
  const { t } = useTranslation();
  const isEdit = employee !== null;

  const [fullName, setFullName] = useState(employee?.fullName ?? "");
  const [login, setLogin] = useState(employee?.login ?? "");
  const [role, setRole] = useState<Role>(employee?.role ?? "CASHIER");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const saved = isEdit
        ? await updateUser(session.accessToken, employee.id, {
            fullName: fullName.trim(),
            role,
            pin: pin || undefined,
            password: password || undefined,
          })
        : await createUser(session.accessToken, {
            fullName: fullName.trim(),
            login: login.trim(),
            role,
            pin: pin || undefined,
            password: password || undefined,
          });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("employees.saveError"));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    fullName.trim().length > 0 &&
    (isEdit || login.trim().length > 0) &&
    (isEdit || pin.length > 0 || password.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-800">
            {isEdit ? t("employees.editTitle") : t("employees.addTitle")}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={t("common.close")}>
            <CloseIcon />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4">
          <label className="block text-xs font-medium text-slate-500">
            {t("employees.fullName")}
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoFocus
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          <label className="block text-xs font-medium text-slate-500">
            {t("employees.login")}
            <input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              disabled={isEdit}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent disabled:bg-slate-50 disabled:text-slate-400"
            />
            {isEdit && <span className="mt-1 block text-[11px] font-normal text-slate-400">{t("employees.loginLocked")}</span>}
          </label>

          <label className="block text-xs font-medium text-slate-500">
            {t("employees.role")}
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(ROLE_KEY[r])}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-500">
              {t("employees.pin")}
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                maxLength={6}
                placeholder={isEdit ? t("employees.leaveBlank") : ""}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>

            <label className="block text-xs font-medium text-slate-500">
              {t("employees.password")}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isEdit ? t("employees.leaveBlank") : ""}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
          </div>
          <span className="block text-[11px] font-normal text-slate-400">
            {isEdit ? t("employees.credentialsHintEdit") : t("employees.credentialsHintCreate")}
          </span>

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
