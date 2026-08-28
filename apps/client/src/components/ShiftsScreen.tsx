import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, getShifts, getWorkstations } from "../lib/api";
import { formatSum } from "../lib/format";
import { ShiftDetailModal } from "./ShiftDetailModal";
import type { ApiShift, ApiWorkstation } from "../types/api";
import type { AuthSession } from "../types/auth";

interface ShiftsScreenProps {
  session: AuthSession;
  storeId: string;
}

const CAN_VIEW_ROLES: AuthSession["role"][] = ["ADMIN", "MANAGER", "CASHIER"];

export function ShiftsScreen({ session, storeId }: ShiftsScreenProps) {
  const { t } = useTranslation();
  const canView = CAN_VIEW_ROLES.includes(session.role);

  const [shifts, setShifts] = useState<ApiShift[]>([]);
  const [workstations, setWorkstations] = useState<ApiWorkstation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [selectedShift, setSelectedShift] = useState<ApiShift | null>(null);

  useEffect(() => {
    if (!canView) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const [shiftList, workstationList] = await Promise.all([
          getShifts(session.accessToken, storeId),
          getWorkstations(session.accessToken),
        ]);
        if (!cancelled) {
          setShifts(shiftList);
          setWorkstations(workstationList);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 403) {
            setAccessDenied(true);
          } else {
            setLoadError(err instanceof ApiError ? err.message : t("shifts.loadError"));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken, storeId]);

  const workstationName = useMemo(() => {
    const map = new Map(workstations.map((w) => [w.id, w.name]));
    return (id: string) => map.get(id) ?? id;
  }, [workstations]);

  if (accessDenied) {
    return (
      <div className="mx-auto max-w-md pt-16 text-center">
        <p className="text-sm text-slate-500">{t("shifts.accessDenied")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">{t("nav.shifts")}</h1>

      {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}
      {loadError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{loadError}</p>}

      {!loading && !loadError && (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="px-4 py-3 font-medium">{t("workstation.workstation")}</th>
                <th className="px-4 py-3 font-medium">{t("shifts.opened")}</th>
                <th className="px-4 py-3 font-medium">{t("shifts.closed")}</th>
                <th className="px-4 py-3 font-medium text-right">{t("shifts.openingCash")}</th>
                <th className="px-4 py-3 font-medium text-right">{t("shifts.closingCash")}</th>
                <th className="px-4 py-3 font-medium">{t("shifts.zReportNumber")}</th>
                <th className="px-4 py-3 font-medium">{t("products.status")}</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setSelectedShift(s)}
                  className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-medium text-slate-800">{workstationName(s.workstationId)}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(s.openedAt).toLocaleString("ru-RU")}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {s.closedAt ? new Date(s.closedAt).toLocaleString("ru-RU") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-800">
                    {formatSum(Number(s.openingCash))} {t("common.currency")}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-800">
                    {s.closingCash ? `${formatSum(Number(s.closingCash))} ${t("common.currency")}` : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.zReportNumber ?? "—"}</td>
                  <td className="px-4 py-3">
                    {s.status === "OPEN" ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
                        {t("shifts.statusOpen")}
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        {t("shifts.statusClosed")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {shifts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">
                    {t("shifts.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selectedShift && (
        <ShiftDetailModal
          session={session}
          shift={selectedShift}
          workstationName={workstationName(selectedShift.workstationId)}
          onClose={() => setSelectedShift(null)}
        />
      )}
    </div>
  );
}
