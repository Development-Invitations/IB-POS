import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, getShifts, getStores, getUsers, getWorkstations } from "../lib/api";
import type { ApiShift, ApiStore, ApiUser, ApiWorkstation } from "../types/api";
import type { AuthSession } from "../types/auth";

interface HomeScreenProps {
  session: AuthSession;
}

// "Главная" — общая для тех, у кого доступ ко всему бизнесу (Админ/Управляющий/Бухгалтер, см.
// SCREEN_ACCESS.home в Sidebar.tsx). Единственное содержимое пока — какие кассы сейчас
// работают (прямой запрос клиента), а не выдуманный дашборд: полноценные KPI и графики уже
// есть в "Отчётах", здесь именно "кто сейчас на смене".
export function HomeScreen({ session }: HomeScreenProps) {
  const { t } = useTranslation();
  const [workstations, setWorkstations] = useState<ApiWorkstation[]>([]);
  const [stores, setStores] = useState<ApiStore[]>([]);
  const [shifts, setShifts] = useState<ApiShift[]>([]);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [workstationList, storeList, shiftList, userList] = await Promise.all([
          getWorkstations(session.accessToken),
          getStores(session.accessToken),
          getShifts(session.accessToken),
          getUsers(session.accessToken),
        ]);
        if (!cancelled) {
          setWorkstations(workstationList);
          setStores(storeList);
          setShifts(shiftList);
          setUsers(userList);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : t("home.loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken]);

  const storeName = useMemo(() => {
    const map = new Map(stores.map((s) => [s.id, s.name]));
    return (id: string) => map.get(id) ?? "";
  }, [stores]);

  const userName = useMemo(() => {
    const map = new Map(users.map((u) => [u.id, u.fullName]));
    return (id: string) => map.get(id) ?? id;
  }, [users]);

  const openShiftByWorkstation = useMemo(() => {
    const map = new Map<string, ApiShift>();
    for (const s of shifts) {
      if (s.status === "OPEN") map.set(s.workstationId, s);
    }
    return map;
  }, [shifts]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">{t("home.title")}</h1>

      {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}
      {loadError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{loadError}</p>}

      {!loading && !loadError && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">{t("home.workstationsTitle")}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workstations.map((w) => {
              const shift = openShiftByWorkstation.get(w.id);
              return (
                <div key={w.id} className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-slate-800">{w.name}</div>
                    {shift ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
                        {t("home.working")}
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        {t("home.notWorking")}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{storeName(w.storeId)}</div>
                  {shift && (
                    <div className="mt-2 text-sm text-slate-600">
                      {userName(shift.userId)} ·{" "}
                      {t("home.since", {
                        time: new Date(shift.openedAt).toLocaleTimeString("ru-RU", {
                          hour: "2-digit",
                          minute: "2-digit",
                        }),
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {workstations.length === 0 && (
              <p className="text-sm text-slate-400">{t("home.noWorkstations")}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
