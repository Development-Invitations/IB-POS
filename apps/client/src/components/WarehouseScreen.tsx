import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ApiError,
  adjustStock,
  getProducts,
  getStockReport,
  getStores,
  receiveStock,
} from "../lib/api";
import { useBarcodeScanner } from "../lib/use-barcode-scanner";
import { CloseIcon, MinusIcon, PlusIcon, SearchIcon } from "./icons";
import type { ApiProduct, ApiStockEntry, ApiStore } from "../types/api";
import type { AuthSession } from "../types/auth";

interface WarehouseScreenProps {
  session: AuthSession;
  // Экран продажи держит отдельную копию остатков на плитках товара (App.tsx) — после приёмки
  // её надо перечитать, иначе кассир увидит старые цифры до следующей перезагрузки приложения.
  onStockChanged?: () => void;
}

const CAN_VIEW_ROLES: AuthSession["role"][] = ["ADMIN", "MANAGER", "WAREHOUSE", "ACCOUNTANT"];
const CAN_MANAGE_ROLES: AuthSession["role"][] = ["ADMIN", "WAREHOUSE"];

interface BatchLine {
  product: ApiProduct;
  quantity: number;
}

export function WarehouseScreen({ session, onStockChanged }: WarehouseScreenProps) {
  const { t } = useTranslation();
  const canView = CAN_VIEW_ROLES.includes(session.role);
  const canManage = CAN_MANAGE_ROLES.includes(session.role);

  const [stores, setStores] = useState<ApiStore[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [entries, setEntries] = useState<ApiStockEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [batch, setBatch] = useState<Map<string, BatchLine>>(new Map());
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [manualQuery, setManualQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [adjustTarget, setAdjustTarget] = useState<ApiStockEntry | null>(null);
  const [adjustValue, setAdjustValue] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  async function load(quiet = false) {
    if (!quiet) setLoading(true);
    setLoadError(null);
    try {
      const [storeList, productList] = await Promise.all([
        getStores(session.accessToken),
        getProducts(session.accessToken),
      ]);
      setStores(storeList);
      setProducts(productList.filter((p) => p.isActive));
      setStoreId((prev) => prev ?? storeList[0]?.id ?? null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("warehouse.loadError"));
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => {
    if (!canView) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken]);

  useEffect(() => {
    if (!canView || !storeId) return;
    let cancelled = false;
    getStockReport(session.accessToken, storeId)
      .then((list) => {
        if (!cancelled) setEntries(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session.accessToken, storeId, canView]);

  // Сканер работает только пока открыт этот экран (App.tsx свой глобальный обработчик сам
  // молчит вне экрана "Продажа" — см. activeScreen !== "sale" там) — конфликта нет.
  useBarcodeScanner((code) => {
    if (!canManage) return;
    const product = products.find((p) => p.barcode === code);
    if (!product) {
      setScanMessage(t("warehouse.scanNotFound", { code }));
      return;
    }
    setScanMessage(null);
    addToBatch(product);
  });

  function addToBatch(product: ApiProduct) {
    setBatch((prev) => {
      const next = new Map(prev);
      const existing = next.get(product.id);
      next.set(product.id, { product, quantity: (existing?.quantity ?? 0) + 1 });
      return next;
    });
  }

  function setBatchQuantity(productId: string, quantity: number) {
    setBatch((prev) => {
      const next = new Map(prev);
      const line = next.get(productId);
      if (!line) return prev;
      if (quantity <= 0) {
        next.delete(productId);
      } else {
        next.set(productId, { ...line, quantity });
      }
      return next;
    });
  }

  function removeFromBatch(productId: string) {
    setBatch((prev) => {
      const next = new Map(prev);
      next.delete(productId);
      return next;
    });
  }

  const manualMatches = useMemo(() => {
    const q = manualQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [manualQuery, products]);

  async function handleReceiveBatch() {
    if (!storeId || batch.size === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      for (const line of batch.values()) {
        await receiveStock(session.accessToken, {
          storeId,
          productId: line.product.id,
          quantity: line.quantity,
          comment: t("warehouse.receiveComment"),
        });
      }
      setBatch(new Map());
      await load(true);
      const fresh = await getStockReport(session.accessToken, storeId);
      setEntries(fresh);
      onStockChanged?.();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : t("warehouse.receiveError"));
    } finally {
      setSubmitting(false);
    }
  }

  function openAdjust(entry: ApiStockEntry) {
    setAdjustTarget(entry);
    setAdjustValue(entry.quantity);
    setAdjustReason("");
    setAdjustError(null);
  }

  async function confirmAdjust() {
    if (!adjustTarget || !storeId) return;
    const newQuantity = Number(adjustValue);
    if (!Number.isFinite(newQuantity) || newQuantity < 0) {
      setAdjustError(t("warehouse.adjustInvalid"));
      return;
    }
    setAdjustSubmitting(true);
    setAdjustError(null);
    try {
      await adjustStock(session.accessToken, {
        storeId,
        productId: adjustTarget.productId,
        newQuantity,
        reason: adjustReason.trim() || undefined,
      });
      const fresh = await getStockReport(session.accessToken, storeId);
      setEntries(fresh);
      onStockChanged?.();
      setAdjustTarget(null);
    } catch (err) {
      setAdjustError(err instanceof ApiError ? err.message : t("warehouse.adjustError"));
    } finally {
      setAdjustSubmitting(false);
    }
  }

  const filteredEntries = entries.filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return e.product.name.toLowerCase().includes(q) || (e.product.barcode ?? "").toLowerCase().includes(q);
  });

  if (!canView) {
    return (
      <div className="mx-auto max-w-md pt-16 text-center">
        <p className="text-sm text-slate-500">{t("warehouse.accessDenied")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">{t("nav.warehouse")}</h1>
        {stores.length > 1 && (
          <select
            value={storeId ?? ""}
            onChange={(e) => setStoreId(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {loadError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{loadError}</p>}

      {canManage && (
        <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">{t("warehouse.receiveTitle")}</h2>
            <p className="text-xs text-slate-400">{t("warehouse.receiveHint")}</p>
          </div>

          {scanMessage && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{scanMessage}</p>}

          <div className="relative max-w-sm">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
              placeholder={t("warehouse.manualSearchPlaceholder")}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:border-accent"
            />
            {manualMatches.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-100 bg-white shadow-lg">
                {manualMatches.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      addToBatch(p);
                      setManualQuery("");
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span>{p.name}</span>
                    <span className="text-xs text-slate-400">{p.barcode}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {batch.size > 0 && (
            <div className="overflow-hidden rounded-lg border border-slate-100">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-400">
                    <th className="px-3 py-2 font-medium">{t("products.name")}</th>
                    <th className="px-3 py-2 font-medium">{t("warehouse.quantity")}</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {[...batch.values()].map((line) => (
                    <tr key={line.product.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-3 py-2 text-slate-800">{line.product.name}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setBatchQuantity(line.product.id, line.quantity - 1)}
                            className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
                          >
                            <MinusIcon width={12} height={12} />
                          </button>
                          <input
                            type="number"
                            min={0}
                            value={line.quantity}
                            onChange={(e) => setBatchQuantity(line.product.id, Number(e.target.value))}
                            className="w-16 rounded border border-slate-200 px-2 py-1 text-center text-sm outline-none focus:border-accent"
                          />
                          <button
                            onClick={() => setBatchQuantity(line.product.id, line.quantity + 1)}
                            className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
                          >
                            <PlusIcon width={12} height={12} />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => removeFromBatch(line.product.id)}
                          className="text-slate-400 hover:text-red-500"
                          aria-label={t("common.remove")}
                        >
                          <CloseIcon width={14} height={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {submitError && <p className="text-xs text-red-600">{submitError}</p>}

          <button
            onClick={handleReceiveBatch}
            disabled={batch.size === 0 || submitting || !storeId}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {submitting ? t("common.loading") : t("warehouse.receiveSubmit", { count: batch.size })}
          </button>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-600">{t("warehouse.stockTitle")}</h2>
          <div className="relative max-w-xs">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("products.searchPlaceholder")}
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-sm outline-none focus:border-accent"
            />
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">{t("common.loading")}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="px-4 py-3 font-medium">{t("products.name")}</th>
                  <th className="px-4 py-3 font-medium">{t("products.barcode")}</th>
                  <th className="px-4 py-3 font-medium text-right">{t("warehouse.quantity")}</th>
                  {canManage && <th className="px-4 py-3 font-medium" />}
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{entry.product.name}</td>
                    <td className="px-4 py-3 text-slate-500">{entry.product.barcode ?? "—"}</td>
                    <td
                      className={`px-4 py-3 text-right ${Number(entry.quantity) <= 0 ? "text-red-600" : "text-slate-800"}`}
                    >
                      {entry.quantity} {entry.product.unit}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openAdjust(entry)}
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          {t("warehouse.adjust")}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}

                {filteredEntries.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 4 : 3} className="px-4 py-8 text-center text-sm text-slate-400">
                      {t("warehouse.empty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-800">{adjustTarget.product.name}</h2>
              <button
                onClick={() => setAdjustTarget(null)}
                className="text-slate-400 hover:text-slate-700"
                aria-label={t("common.close")}
              >
                <CloseIcon />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <label className="block text-xs font-medium text-slate-500">
                {t("warehouse.newQuantity")}
                <input
                  type="number"
                  min={0}
                  value={adjustValue}
                  onChange={(e) => setAdjustValue(e.target.value)}
                  autoFocus
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
              <label className="block text-xs font-medium text-slate-500">
                {t("warehouse.adjustReason")}
                <input
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder={t("warehouse.adjustReasonPlaceholder")}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
              {adjustError && <p className="text-xs text-red-600">{adjustError}</p>}
            </div>
            <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
              <button
                onClick={() => setAdjustTarget(null)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50"
              >
                {t("returns.cancel")}
              </button>
              <button
                onClick={confirmAdjust}
                disabled={adjustSubmitting}
                className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
              >
                {adjustSubmitting ? t("common.loading") : t("products.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
