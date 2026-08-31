import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CloseIcon } from "./icons";
import { ApiError, getAuditLog } from "../lib/api";
import type { ApiAuditLog, ApiUser } from "../types/api";
import type { AuthSession, Role } from "../types/auth";

interface EmployeeDetailModalProps {
  session: AuthSession;
  employee: ApiUser;
  onClose: () => void;
}

const ROLE_KEY: Record<Role, string> = {
  CASHIER: "roles.cashier",
  MANAGER: "roles.manager",
  WAREHOUSE: "roles.warehouse",
  ADMIN: "roles.admin",
  ACCOUNTANT: "roles.accountant",
};

export function EmployeeDetailModal({ session, employee, onClose }: EmployeeDetailModalProps) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<ApiAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const history = await getAuditLog(session.accessToken, employee.id);
        if (!cancelled) setLogs(history);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : t("employees.historyError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{employee.fullName}</h2>
            <p className="text-xs text-slate-400">
              {employee.login} · {t(ROLE_KEY[employee.role])}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={t("common.close")}>
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">{t("employees.actionHistory")}</h3>
          {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}
          {loadError && <p className="text-sm text-red-600">{loadError}</p>}
          {!loading && !loadError && logs.length === 0 && (
            <p className="text-sm text-slate-400">{t("employees.noActions")}</p>
          )}
          {!loading && logs.length > 0 && (
            <div className="divide-y divide-slate-50 rounded-lg border border-slate-100">
              {logs.map((log) => (
                <div key={log.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <div className="text-slate-700">{log.action}</div>
                    <div className="text-xs text-slate-400">{log.entity}</div>
                  </div>
                  <div className="text-xs text-slate-400">{new Date(log.createdAt).toLocaleString("ru-RU")}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
