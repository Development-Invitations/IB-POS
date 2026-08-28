import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ApiError,
  getShifts,
  getStores,
  getWorkstations,
  openShift,
} from "../lib/api";
import { AmountInput } from "./AmountInput";
import { loadWorkstation, saveWorkstation } from "../lib/session";
import type { ApiShift, ApiStore, ApiWorkstation } from "../types/api";
import type { AuthSession } from "../types/auth";

interface ShiftSetupScreenProps {
  session: AuthSession;
  onReady: (shift: ApiShift, workstation: ApiWorkstation) => void;
}

type Phase = "loading" | "pick" | "open-shift" | "error";

export function ShiftSetupScreen({ session, onReady }: ShiftSetupScreenProps) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [stores, setStores] = useState<ApiStore[]>([]);
  const [workstations, setWorkstations] = useState<ApiWorkstation[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [workstationId, setWorkstationId] = useState<string | null>(null);
  const [openingCash, setOpeningCash] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [storeList, workstationList] = await Promise.all([
          getStores(session.accessToken),
          getWorkstations(session.accessToken),
        ]);
        if (cancelled) return;
        setStores(storeList);
        setWorkstations(workstationList);

        const remembered = loadWorkstation();
        const rememberedWorkstation = remembered
          ? workstationList.find(
              (w) => w.id === remembered.workstationId && w.storeId === remembered.storeId,
            )
          : undefined;

        if (rememberedWorkstation) {
          await proceedWithWorkstation(rememberedWorkstation, session.accessToken);
        } else if (workstationList.length === 1) {
          await proceedWithWorkstation(workstationList[0], session.accessToken);
        } else {
          setPhase("pick");
        }
      } catch {
        if (!cancelled) {
          setError(t("workstation.loadError"));
          setPhase("error");
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken]);

  async function proceedWithWorkstation(workstation: ApiWorkstation, token: string) {
    setStoreId(workstation.storeId);
    setWorkstationId(workstation.id);
    try {
      const shifts = await getShifts(token, workstation.storeId);
      const open = shifts.find((s) => s.workstationId === workstation.id && s.status === "OPEN");
      saveWorkstation({ storeId: workstation.storeId, workstationId: workstation.id });
      if (open) {
        onReady(open, workstation);
      } else {
        setPhase("open-shift");
      }
    } catch {
      setError(t("workstation.loadError"));
      setPhase("error");
    }
  }

  async function handlePickContinue() {
    const workstation = workstations.find((w) => w.id === workstationId && w.storeId === storeId);
    if (!workstation) return;
    setPhase("loading");
    await proceedWithWorkstation(workstation, session.accessToken);
  }

  async function handleOpenShift() {
    if (!storeId || !workstationId) return;
    const workstation = workstations.find((w) => w.id === workstationId);
    if (!workstation) return;
    setSubmitting(true);
    setError(null);
    try {
      const shift = await openShift(session.accessToken, storeId, workstationId, openingCash);
      onReady(shift, workstation);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("workstation.error"));
    } finally {
      setSubmitting(false);
    }
  }

  const storeWorkstations = workstations.filter((w) => !storeId || w.storeId === storeId);

  return (
    <div className="flex h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-sm">
        {phase === "loading" && <p className="text-center text-sm text-slate-400">{t("common.loading")}</p>}

        {phase === "error" && (
          <div className="space-y-3 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {phase === "pick" && (
          <div className="space-y-3">
            <h2 className="text-center text-lg font-semibold text-slate-800">
              {t("workstation.setupTitle")}
            </h2>

            <label className="block text-xs font-medium text-slate-500">
              {t("workstation.store")}
              <select
                value={storeId ?? ""}
                onChange={(e) => {
                  setStoreId(e.target.value);
                  setWorkstationId(null);
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="" disabled>
                  —
                </option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-medium text-slate-500">
              {t("workstation.workstation")}
              <select
                value={workstationId ?? ""}
                onChange={(e) => setWorkstationId(e.target.value)}
                disabled={!storeId}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-40"
              >
                <option value="" disabled>
                  —
                </option>
                {storeWorkstations.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>

            {storeWorkstations.length === 0 && storeId && (
              <p className="text-xs text-red-600">{t("workstation.noWorkstations")}</p>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              onClick={handlePickContinue}
              disabled={!storeId || !workstationId}
              className="w-full rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
            >
              {t("workstation.continue")}
            </button>
          </div>
        )}

        {phase === "open-shift" && (
          <div className="space-y-3">
            <h2 className="text-center text-lg font-semibold text-slate-800">
              {t("workstation.openShiftTitle")}
            </h2>

            <label className="block text-xs font-medium text-slate-500">
              {t("workstation.openingCash")}
              <AmountInput
                value={openingCash}
                onChange={setOpeningCash}
                autoFocus
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-accent"
              />
            </label>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            <button
              onClick={handleOpenShift}
              disabled={submitting}
              className="w-full rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
            >
              {submitting ? t("workstation.opening") : t("workstation.openShift")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
