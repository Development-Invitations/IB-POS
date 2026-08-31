import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, getUsers, updateUser } from "../lib/api";
import { formatSum } from "../lib/format";
import { ConfirmDialog } from "./ConfirmDialog";
import { EmployeeFormModal } from "./EmployeeFormModal";
import { EmployeeDetailModal } from "./EmployeeDetailModal";
import { EmployeeSalaryModal } from "./EmployeeSalaryModal";
import { PlusIcon } from "./icons";
import type { ApiUser } from "../types/api";
import type { AuthSession, Role } from "../types/auth";

interface EmployeesScreenProps {
  session: AuthSession;
}

const ROLE_KEY: Record<Role, string> = {
  CASHIER: "roles.cashier",
  MANAGER: "roles.manager",
  WAREHOUSE: "roles.warehouse",
  ADMIN: "roles.admin",
  ACCOUNTANT: "roles.accountant",
};

type Tab = "list" | "salaries";

export function EmployeesScreen({ session }: EmployeesScreenProps) {
  const { t } = useTranslation();
  // Полное управление (создание/роль/PIN/пароль/деактивация) — только Админ, как в Разделе 3.
  // Бухгалтер видит список сотрудников без права его редактировать (прямой запрос клиента) —
  // единственное, что ему разрешено менять, вынесено в отдельную вкладку "Зарплаты", а не
  // смешано с действиями над самой карточкой сотрудника (см. UsersService.update на сервере —
  // там та же граница, а не только здесь на клиенте).
  const canManage = session.role === "ADMIN";
  const isAccountant = session.role === "ACCOUNTANT";
  const [tab, setTab] = useState<Tab>("list");

  const [employees, setEmployees] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<ApiUser | null>(null);
  const [detailEmployee, setDetailEmployee] = useState<ApiUser | null>(null);
  const [salaryEmployee, setSalaryEmployee] = useState<ApiUser | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ApiUser | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await getUsers(session.accessToken);
      setEmployees(list);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("employees.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken]);

  function openCreate() {
    setEditingEmployee(null);
    setFormOpen(true);
  }

  function openEdit(employee: ApiUser) {
    setEditingEmployee(employee);
    setFormOpen(true);
  }

  function handleSaved(saved: ApiUser) {
    setEmployees((prev) => {
      const exists = prev.some((u) => u.id === saved.id);
      return exists ? prev.map((u) => (u.id === saved.id ? saved : u)) : [...prev, saved];
    });
    setFormOpen(false);
  }

  async function handleToggleActive(employee: ApiUser) {
    if (employee.isActive) {
      setConfirmError(null);
      setConfirmTarget(employee);
      return;
    }
    setRowError(null);
    try {
      const saved = await updateUser(session.accessToken, employee.id, { isActive: true });
      setEmployees((prev) => prev.map((u) => (u.id === saved.id ? saved : u)));
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : t("employees.saveError"));
    }
  }

  async function confirmDeactivate() {
    if (!confirmTarget) return;
    setConfirmSubmitting(true);
    setConfirmError(null);
    try {
      const saved = await updateUser(session.accessToken, confirmTarget.id, { isActive: false });
      setEmployees((prev) => prev.map((u) => (u.id === saved.id ? saved : u)));
      setConfirmTarget(null);
    } catch (err) {
      setConfirmError(err instanceof ApiError ? err.message : t("employees.saveError"));
    } finally {
      setConfirmSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">{t("nav.employees")}</h1>
        {canManage && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover"
          >
            <PlusIcon width={16} height={16} />
            {t("employees.addTitle")}
          </button>
        )}
      </div>

      {isAccountant && (
        <div className="flex gap-2 rounded-lg bg-slate-100 p-1">
          <button
            onClick={() => setTab("list")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              tab === "list" ? "bg-accent text-white" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t("nav.employees")}
          </button>
          <button
            onClick={() => setTab("salaries")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              tab === "salaries" ? "bg-accent text-white" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t("employees.tabSalaries")}
          </button>
        </div>
      )}

      {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}
      {loadError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{loadError}</p>}
      {rowError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{rowError}</p>}

      {!loading && !loadError && tab === "list" && (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="px-4 py-3 font-medium">{t("employees.fullName")}</th>
                <th className="px-4 py-3 font-medium">{t("employees.login")}</th>
                <th className="px-4 py-3 font-medium">{t("employees.role")}</th>
                <th className="px-4 py-3 font-medium">{t("products.status")}</th>
                {canManage && <th className="px-4 py-3 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {employees.map((u) => {
                const isSelf = u.id === session.userId;
                return (
                  <tr key={u.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {canManage ? (
                        <button onClick={() => setDetailEmployee(u)} className="hover:underline">
                          {u.fullName}
                        </button>
                      ) : (
                        u.fullName
                      )}
                      {isSelf && <span className="ml-2 text-xs text-slate-400">({t("employees.you")})</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{u.login}</td>
                    <td className="px-4 py-3 text-slate-500">{t(ROLE_KEY[u.role])}</td>
                    <td className="px-4 py-3">
                      {u.isActive ? (
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
                            onClick={() => setDetailEmployee(u)}
                            className="text-xs font-medium text-slate-400 hover:text-slate-700"
                          >
                            {t("employees.history")}
                          </button>
                          <button
                            onClick={() => openEdit(u)}
                            className="text-xs font-medium text-accent hover:underline"
                          >
                            {t("products.edit")}
                          </button>
                          {!isSelf && (
                            <button
                              onClick={() => handleToggleActive(u)}
                              className="text-xs font-medium text-slate-400 hover:text-slate-700"
                            >
                              {u.isActive ? t("products.deactivate") : t("products.activate")}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}

              {employees.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="px-4 py-8 text-center text-sm text-slate-400">
                    {t("employees.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !loadError && tab === "salaries" && (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="px-4 py-3 font-medium">{t("employees.fullName")}</th>
                <th className="px-4 py-3 font-medium">{t("employees.role")}</th>
                <th className="px-4 py-3 font-medium text-right">{t("employees.salary")}</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {employees.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{u.fullName}</td>
                  <td className="px-4 py-3 text-slate-500">{t(ROLE_KEY[u.role])}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">
                    {u.salary ? `${formatSum(Number(u.salary))} ${t("common.currency")}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSalaryEmployee(u)}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      {t("products.edit")}
                    </button>
                  </td>
                </tr>
              ))}

              {employees.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">
                    {t("employees.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <EmployeeFormModal
          session={session}
          employee={editingEmployee}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {detailEmployee && (
        <EmployeeDetailModal
          session={session}
          employee={detailEmployee}
          onClose={() => setDetailEmployee(null)}
        />
      )}

      {salaryEmployee && (
        <EmployeeSalaryModal
          session={session}
          employee={salaryEmployee}
          onClose={() => setSalaryEmployee(null)}
          onSaved={(saved) => {
            setEmployees((prev) => prev.map((u) => (u.id === saved.id ? saved : u)));
            setSalaryEmployee(null);
          }}
        />
      )}

      {confirmTarget && (
        <ConfirmDialog
          title={t("employees.deactivateTitle")}
          message={t("employees.deactivateConfirm", { name: confirmTarget.fullName })}
          confirmLabel={t("products.deactivate")}
          danger
          submitting={confirmSubmitting}
          error={confirmError}
          onClose={() => setConfirmTarget(null)}
          onConfirm={confirmDeactivate}
        />
      )}
    </div>
  );
}
