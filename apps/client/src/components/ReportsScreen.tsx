import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ApiError,
  getDashboard,
  getFinanceReport,
  getReportsCsv,
  getStaffReport,
  getStockReport,
  getStores,
  getTopProducts,
} from "../lib/api";
import { formatSum } from "../lib/format";
import type {
  ApiStockEntry,
  ApiStore,
  BackendPaymentMethod,
  DashboardReport,
  FinanceReport,
  StaffReportRow,
  TopProduct,
} from "../types/api";
import type { AuthSession } from "../types/auth";

interface ReportsScreenProps {
  session: AuthSession;
}

const CAN_DASHBOARD_ROLES: AuthSession["role"][] = ["ADMIN", "MANAGER", "ACCOUNTANT"];
const CAN_STOCK_ROLES: AuthSession["role"][] = ["ADMIN", "MANAGER", "WAREHOUSE"];

const METHOD_KEY: Record<BackendPaymentMethod, string> = {
  CASH: "payment.cash",
  CARD: "payment.card",
  CLICK: "payment.click",
  PAYME: "payment.payme",
  QR: "payment.qr",
  MIXED: "payment.mixed",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

type Tab = "dashboard" | "products" | "staff" | "finance" | "stock";

function ChangeBadge({ value }: { value: number | null }) {
  const { t } = useTranslation();
  if (value === null) {
    return <span className="text-xs text-slate-400">{t("reports.noComparison")}</span>;
  }
  const positive = value >= 0;
  return (
    <span className={`text-xs font-medium ${positive ? "text-emerald-600" : "text-red-600"}`}>
      {positive ? "+" : ""}
      {value.toFixed(1)}% {t("reports.vsPrevious")}
    </span>
  );
}

// Лёгкий линейный график без внешней библиотеки — 24 почасовые точки, заливка под линией.
// Точки увеличены и кликабельны широкой прозрачной областью (проще навести мышью), подсказка —
// свой стилизованный тултип поверх графика, а не нативный браузерный (тот появляется с задержкой
// и выглядит неаккуратно).
function SalesLineChart({ points }: { points: { hour: number; total: number }[] }) {
  const { t } = useTranslation();
  const width = 600;
  const height = 140;
  const max = Math.max(1, ...points.map((p) => p.total));
  const [hovered, setHovered] = useState<number | null>(null);

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - (p.total / max) * (height - 8) - 4;
    return { x, y, ...p };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const active = hovered !== null ? coords[hovered] : null;

  return (
    <div className="relative">
      {active && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-white shadow-lg"
          style={{
            left: `${(active.x / width) * 100}%`,
            top: `${(active.y / height) * 100}%`,
            marginTop: "-10px",
          }}
        >
          <div className="font-semibold">
            {formatSum(active.total)} {t("common.currency")}
          </div>
          <div className="text-slate-300">{active.hour}:00</div>
        </div>
      )}
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#salesFill)" />
        <path d={linePath} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hovered !== null && (
          <line
            x1={coords[hovered].x}
            y1={0}
            x2={coords[hovered].x}
            y2={height}
            stroke="#ef4444"
            strokeOpacity={0.25}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
        {coords.map((c, i) => (
          <g key={c.hour}>
            <circle
              cx={c.x}
              cy={c.y}
              r={hovered === i ? 5 : c.total > 0 ? 3.5 : 2}
              fill={c.total > 0 ? "#ef4444" : "#f8b4b4"}
              stroke="#fff"
              strokeWidth={hovered === i ? 2 : 0}
              className="transition-[r]"
            />
            <circle
              cx={c.x}
              cy={c.y}
              r={12}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

export function ReportsScreen({ session }: ReportsScreenProps) {
  const { t } = useTranslation();
  const canDashboard = CAN_DASHBOARD_ROLES.includes(session.role);
  const canStock = CAN_STOCK_ROLES.includes(session.role);

  const [tab, setTab] = useState<Tab>(canDashboard ? "dashboard" : "stock");
  const [stores, setStores] = useState<ApiStore[]>([]);
  const [storeId, setStoreId] = useState("");
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());

  const [dashboard, setDashboard] = useState<DashboardReport | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [staff, setStaff] = useState<StaffReportRow[]>([]);
  const [finance, setFinance] = useState<FinanceReport | null>(null);
  const [stock, setStock] = useState<ApiStockEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getStores(session.accessToken)
      .then(setStores)
      .catch(() => undefined);
  }, [session.accessToken]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        if (tab === "dashboard" && canDashboard) {
          const report = await getDashboard(session.accessToken, { from, to, storeId: storeId || undefined });
          if (!cancelled) setDashboard(report);
        } else if (tab === "products" && canDashboard) {
          const list = await getTopProducts(session.accessToken, { from, to, storeId: storeId || undefined });
          if (!cancelled) setTopProducts(list);
        } else if (tab === "staff" && canDashboard) {
          const list = await getStaffReport(session.accessToken, { from, to, storeId: storeId || undefined });
          if (!cancelled) setStaff(list);
        } else if (tab === "finance" && canDashboard) {
          const report = await getFinanceReport(session.accessToken, { from, to, storeId: storeId || undefined });
          if (!cancelled) setFinance(report);
        } else if (tab === "stock" && canStock) {
          const entries = await getStockReport(session.accessToken, storeId || undefined);
          if (!cancelled) setStock(entries);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : t("reports.loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, from, to, storeId, session.accessToken]);

  const maxTopRevenue = useMemo(() => Math.max(1, ...topProducts.map((p) => p.revenue)), [topProducts]);

  async function handleExport() {
    setExporting(true);
    try {
      const csv = await getReportsCsv(session.accessToken, { from, to, storeId: storeId || undefined });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report_${from}_${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // молча — экспорт не критичен для основного потока
    } finally {
      setExporting(false);
    }
  }

  if (!canDashboard && !canStock) {
    return (
      <div className="mx-auto max-w-md pt-16 text-center">
        <p className="text-sm text-slate-500">{t("reports.accessDenied")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">{t("nav.reports")}</h1>
        {tab !== "stock" && canDashboard && (
          <div className="no-print flex gap-2">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              {exporting ? t("common.loading") : t("reports.exportCsv")}
            </button>
            <button
              onClick={() => window.print()}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              {t("reports.print")}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2 rounded-lg bg-slate-100 p-1">
        {canDashboard && (
          <button
            onClick={() => setTab("dashboard")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              tab === "dashboard" ? "bg-accent text-white" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t("reports.tabDashboard")}
          </button>
        )}
        {canDashboard && (
          <button
            onClick={() => setTab("products")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              tab === "products" ? "bg-accent text-white" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t("reports.tabProducts")}
          </button>
        )}
        {canDashboard && (
          <button
            onClick={() => setTab("staff")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              tab === "staff" ? "bg-accent text-white" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t("reports.tabStaff")}
          </button>
        )}
        {canDashboard && (
          <button
            onClick={() => setTab("finance")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              tab === "finance" ? "bg-accent text-white" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t("reports.tabFinance")}
          </button>
        )}
        {canStock && (
          <button
            onClick={() => setTab("stock")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              tab === "stock" ? "bg-accent text-white" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t("reports.tabStock")}
          </button>
        )}
      </div>

      <div className="no-print flex flex-wrap items-end gap-3">
        {tab !== "stock" && (
          <>
            <label className="text-xs font-medium text-slate-500">
              {t("reports.from")}
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="text-xs font-medium text-slate-500">
              {t("reports.to")}
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            <div className="flex gap-1">
              <button
                onClick={() => {
                  setFrom(todayIso());
                  setTo(todayIso());
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                {t("reports.today")}
              </button>
              <button
                onClick={() => {
                  setFrom(daysAgoIso(7));
                  setTo(todayIso());
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                {t("reports.week")}
              </button>
              <button
                onClick={() => {
                  setFrom(daysAgoIso(30));
                  setTo(todayIso());
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                {t("reports.month")}
              </button>
            </div>
          </>
        )}

        {stores.length > 1 && (
          <label className="text-xs font-medium text-slate-500">
            {t("workstation.store")}
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">{t("reports.allStores")}</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}
      {loadError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{loadError}</p>}

      {!loading && !loadError && tab === "dashboard" && dashboard && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-400">{t("reports.totalSales")}</div>
              <div className="mt-1 text-xl font-bold text-slate-800">
                {formatSum(dashboard.totalSales)} {t("common.currency")}
              </div>
              <ChangeBadge value={dashboard.changeVsPrevious.totalSales} />
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-400">{t("reports.receiptsCount")}</div>
              <div className="mt-1 text-xl font-bold text-slate-800">{dashboard.receiptsCount}</div>
              <ChangeBadge value={dashboard.changeVsPrevious.receiptsCount} />
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-400">{t("reports.averageCheck")}</div>
              <div className="mt-1 text-xl font-bold text-slate-800">
                {formatSum(dashboard.averageCheck)} {t("common.currency")}
              </div>
              <ChangeBadge value={dashboard.changeVsPrevious.averageCheck} />
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-400">{t("reports.profit")}</div>
              <div className="mt-1 text-xl font-bold text-slate-800">
                {formatSum(dashboard.profit)} {t("common.currency")}
              </div>
              <ChangeBadge value={dashboard.changeVsPrevious.profit} />
              {dashboard.profitDataIncomplete && (
                <div className="mt-1 text-[11px] text-amber-600">{t("reports.profitIncomplete")}</div>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">{t("reports.salesByHour")}</h3>
            <SalesLineChart points={dashboard.salesByHour} />
            <div className="mt-1 flex justify-between text-[10px] text-slate-400">
              <span>0:00</span>
              <span>12:00</span>
              <span>23:00</span>
            </div>
          </div>
        </>
      )}

      {!loading && !loadError && tab === "products" && (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="px-4 py-3 font-medium">{t("products.name")}</th>
                <th className="px-4 py-3 font-medium text-right">{t("reports.soldQuantity")}</th>
                <th className="px-4 py-3 font-medium text-right">{t("reports.revenue")}</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {topProducts.map((p) => (
                <tr key={p.productId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                  <td className="px-4 py-3 text-right text-slate-500">
                    {p.quantity} {p.unit}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">
                    {formatSum(p.revenue)} {t("common.currency")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${(p.revenue / maxTopRevenue) * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {topProducts.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">
                    {t("reports.stockEmpty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !loadError && tab === "staff" && (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="px-4 py-3 font-medium">{t("employees.fullName")}</th>
                <th className="px-4 py-3 font-medium">{t("employees.login")}</th>
                <th className="px-4 py-3 font-medium text-right">{t("reports.receiptsCount")}</th>
                <th className="px-4 py-3 font-medium text-right">{t("reports.totalSales")}</th>
                <th className="px-4 py-3 font-medium text-right">{t("reports.averageCheck")}</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.userId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{s.fullName}</td>
                  <td className="px-4 py-3 text-slate-500">{s.login}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{s.receiptsCount}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">
                    {formatSum(s.salesTotal)} {t("common.currency")}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">
                    {formatSum(s.averageCheck)} {t("common.currency")}
                  </td>
                </tr>
              ))}
              {staff.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                    {t("reports.staffEmpty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !loadError && tab === "finance" && finance && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(Object.keys(METHOD_KEY) as BackendPaymentMethod[])
              .filter((m) => finance.paymentsByMethod[m])
              .map((m) => (
                <div key={m} className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="text-xs text-slate-400">{t(METHOD_KEY[m])}</div>
                  <div className="mt-1 text-xl font-bold text-slate-800">
                    {formatSum(finance.paymentsByMethod[m] ?? 0)} {t("common.currency")}
                  </div>
                </div>
              ))}
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-400">{t("shifts.deposit")}</div>
              <div className="mt-1 text-xl font-bold text-emerald-600">
                +{formatSum(finance.deposits)} {t("common.currency")}
              </div>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-400">{t("shifts.withdrawal")}</div>
              <div className="mt-1 text-xl font-bold text-red-600">
                −{formatSum(finance.withdrawals)} {t("common.currency")}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="px-4 py-3 font-medium">{t("reports.date")}</th>
                  <th className="px-4 py-3 font-medium">{t("reports.type")}</th>
                  <th className="px-4 py-3 font-medium">{t("employees.fullName")}</th>
                  <th className="px-4 py-3 font-medium text-right">{t("reports.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {finance.cashMovements.map((m) => (
                  <tr key={m.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500">{new Date(m.createdAt).toLocaleString("ru-RU")}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {m.type === "DEPOSIT" ? t("shifts.deposit") : t("shifts.withdrawal")}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{m.user.fullName}</td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        m.type === "DEPOSIT" ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {m.type === "DEPOSIT" ? "+" : "−"}
                      {formatSum(Number(m.amount))} {t("common.currency")}
                    </td>
                  </tr>
                ))}
                {finance.cashMovements.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">
                      {t("shifts.noMovements")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && !loadError && tab === "stock" && (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="px-4 py-3 font-medium">{t("products.name")}</th>
                <th className="px-4 py-3 font-medium">{t("workstation.store")}</th>
                <th className="px-4 py-3 font-medium text-right">{t("reports.quantity")}</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{s.product.name}</td>
                  <td className="px-4 py-3 text-slate-500">{s.store.name}</td>
                  <td className="px-4 py-3 text-right text-slate-800">
                    {s.quantity} {s.product.unit}
                  </td>
                </tr>
              ))}
              {stock.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-400">
                    {t("reports.stockEmpty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
