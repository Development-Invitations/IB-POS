import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AmountInput } from "./AmountInput";
import { CloseIcon } from "./icons";
import { ApiError, createCashMovement, getShiftReport, type ShiftReport } from "../lib/api";
import { formatSum } from "../lib/format";
import type { ApiShift, BackendPaymentMethod, CashMovementType } from "../types/api";
import type { AuthSession } from "../types/auth";

interface ShiftDetailModalProps {
  session: AuthSession;
  shift: ApiShift;
  workstationName: string;
  onClose: () => void;
}

const METHOD_KEY: Record<BackendPaymentMethod, string> = {
  CASH: "payment.cash",
  CARD: "payment.card",
  CLICK: "payment.click",
  PAYME: "payment.payme",
  QR: "payment.qr",
  MIXED: "payment.mixed",
};

export function ShiftDetailModal({ session, shift, workstationName, onClose }: ShiftDetailModalProps) {
  const { t } = useTranslation();
  const [report, setReport] = useState<ShiftReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [movementType, setMovementType] = useState<CashMovementType>("DEPOSIT");
  const [movementAmount, setMovementAmount] = useState(0);
  const [movementComment, setMovementComment] = useState("");
  const [movementSubmitting, setMovementSubmitting] = useState(false);
  const [movementError, setMovementError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await getShiftReport(session.accessToken, shift.id);
      setReport(r);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("shifts.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift.id]);

  async function handleAddMovement() {
    if (movementAmount <= 0) return;
    setMovementSubmitting(true);
    setMovementError(null);
    try {
      await createCashMovement(session.accessToken, shift.id, movementType, movementAmount, movementComment.trim() || undefined);
      setMovementAmount(0);
      setMovementComment("");
      await load();
    } catch (err) {
      setMovementError(err instanceof ApiError ? err.message : t("shifts.movementError"));
    } finally {
      setMovementSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{workstationName}</h2>
            <p className="text-xs text-slate-400">
              {new Date(shift.openedAt).toLocaleString("ru-RU")}
              {shift.closedAt ? ` — ${new Date(shift.closedAt).toLocaleString("ru-RU")}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={t("common.close")}>
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}
          {loadError && <p className="text-sm text-red-600">{loadError}</p>}

          {report && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs text-slate-400">{t("reports.totalSales")}</div>
                  <div className="mt-1 text-lg font-bold text-slate-800">
                    {formatSum(report.salesTotal)} {t("common.currency")}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs text-slate-400">{t("reports.receiptsCount")}</div>
                  <div className="mt-1 text-lg font-bold text-slate-800">{report.receiptsCount}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs text-slate-400">{t("workstation.expectedCash")}</div>
                  <div className="mt-1 text-lg font-bold text-slate-800">
                    {formatSum(report.expectedCash)} {t("common.currency")}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs text-slate-400">{t("shifts.openingCash")}</div>
                  <div className="mt-1 text-lg font-bold text-slate-800">
                    {formatSum(Number(shift.openingCash))} {t("common.currency")}
                  </div>
                </div>
              </div>

              {Object.keys(report.paymentsByMethod).length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">{t("shifts.paymentsByMethod")}</h3>
                  <div className="space-y-1 rounded-lg border border-slate-100 p-3 text-sm">
                    {Object.entries(report.paymentsByMethod).map(([method, amount]) => (
                      <div key={method} className="flex items-center justify-between">
                        <span className="text-slate-500">{t(METHOD_KEY[method as BackendPaymentMethod])}</span>
                        <span className="font-medium text-slate-800">
                          {formatSum(amount ?? 0)} {t("common.currency")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">{t("shifts.cashMovements")}</h3>
                {report.cashMovements.length === 0 ? (
                  <p className="text-sm text-slate-400">{t("shifts.noMovements")}</p>
                ) : (
                  <div className="divide-y divide-slate-50 rounded-lg border border-slate-100">
                    {report.cashMovements.map((m) => (
                      <div key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div>
                          <div className="text-slate-700">
                            {m.type === "DEPOSIT" ? t("shifts.deposit") : t("shifts.withdrawal")}
                          </div>
                          {m.comment && <div className="text-xs text-slate-400">{m.comment}</div>}
                        </div>
                        <div className={`font-semibold ${m.type === "DEPOSIT" ? "text-emerald-600" : "text-red-600"}`}>
                          {m.type === "DEPOSIT" ? "+" : "−"}
                          {formatSum(Number(m.amount))} {t("common.currency")}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {shift.status === "OPEN" && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">{t("shifts.addMovement")}</h3>
                  <div className="flex gap-2">
                    {(["DEPOSIT", "WITHDRAWAL"] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setMovementType(type)}
                        className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
                          movementType === type
                            ? "bg-accent text-white"
                            : "border border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {type === "DEPOSIT" ? t("shifts.deposit") : t("shifts.withdrawal")}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <AmountInput
                      value={movementAmount}
                      onChange={setMovementAmount}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                    <button
                      onClick={handleAddMovement}
                      disabled={movementSubmitting || movementAmount <= 0}
                      className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
                    >
                      {t("shifts.add")}
                    </button>
                  </div>
                  <input
                    value={movementComment}
                    onChange={(e) => setMovementComment(e.target.value)}
                    placeholder={t("shifts.commentPlaceholder")}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                  {movementError && <p className="mt-2 text-xs text-red-600">{movementError}</p>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
