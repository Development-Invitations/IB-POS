import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  API_BASE,
  ApiError,
  deactivateProduct,
  getCategories,
  getProducts,
  getStockReport,
  purgeProduct,
  updateProduct,
} from "../lib/api";
import { formatSum } from "../lib/format";
import { Checkbox } from "./Checkbox";
import { ConfirmDialog } from "./ConfirmDialog";
import { ProductFormModal } from "./ProductFormModal";
import { PlusIcon, SearchIcon } from "./icons";
import type { ApiCategory, ApiProduct, BusinessType } from "../types/api";
import type { AuthSession } from "../types/auth";

interface ProductsScreenProps {
  session: AuthSession;
  onCatalogChanged: () => void;
  businessType?: BusinessType;
}

const CAN_MANAGE_ROLES: AuthSession["role"][] = ["ADMIN", "MANAGER", "WAREHOUSE"];
// Настоящее удаление строже деактивации — необратимо, поэтому только Админ (см. ProductsController.purge).
const CAN_DELETE_ROLES: AuthSession["role"][] = ["ADMIN"];
// Раздел 3 ТЗ: "Остатки/склад" Кассиру закрыто целиком (в отличие от Управляющего/Зав.складом/
// Бухгалтера — им хотя бы просмотр). GET /reports/stock отвечает 403 для Кассира — раньше это
// валило Promise.all в load() целиком и ломало весь экран "Товары" даже там, где у Кассира есть
// доступ (баг, не только про остатки): см. CAN_STOCK_ROLES в ReportsController.
const CAN_STOCK_ROLES: AuthSession["role"][] = ["ADMIN", "MANAGER", "WAREHOUSE", "ACCOUNTANT"];

export function ProductsScreen({ session, onCatalogChanged, businessType }: ProductsScreenProps) {
  const { t } = useTranslation();
  const canManage = CAN_MANAGE_ROLES.includes(session.role);
  const canDelete = CAN_DELETE_ROLES.includes(session.role);
  const isPharmacy = businessType === "PHARMACY";
  // Ресторан не ведёт остатки поштучно (готовится на месте) — колонка там только сбивала бы с
  // толку нулями. Магазин/Аптека торгуют со склада (см. WarehouseScreen.tsx), поэтому здесь
  // видно, сколько реально есть — без этого связь "Товары" (каталог) ↔ "Склад" (остатки) была
  // не очевидна: можно было решить, что это два независимых, не связанных друг с другом списка.
  const showStock = !!businessType && businessType !== "RESTAURANT" && CAN_STOCK_ROLES.includes(session.role);

  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [stockByProduct, setStockByProduct] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ApiProduct | null>(null);
  const [confirmTargets, setConfirmTargets] = useState<ApiProduct[] | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const [purgeTargets, setPurgeTargets] = useState<ApiProduct[] | null>(null);
  const [purgeSubmitting, setPurgeSubmitting] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);

  // Не из исходного ТЗ — по прямому запросу клиента: раньше "Изменить/Деактивировать/Удалить"
  // висели отдельными ссылками в каждой строке (тесно, легко промахнуться на сенсорном экране).
  // Теперь строки выделяют кликом или чекбоксом (можно сразу несколько), и действия для
  // выделенных появляются одной панелью над таблицей. "Изменить" доступно только при ровно
  // одном выделенном — редактировать сразу несколько разных карточек не имеет смысла.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(rows: ApiProduct[]) {
    const allSelected = rows.length > 0 && rows.every((p) => selectedIds.has(p.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      rows.forEach((p) => (allSelected ? next.delete(p.id) : next.add(p.id)));
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const [productList, categoryList] = await Promise.all([
        getProducts(session.accessToken),
        getCategories(session.accessToken),
      ]);
      setProducts(productList);
      setCategories(categoryList);
      if (showStock) {
        // Без storeId — сумма остатков по всем точкам сразу (та же логика, что у уведомлений
        // "заканчивается на складе" в Header.tsx): здесь это общий обзор каталога, а не разбивка
        // по конкретной кассе — за ней уже идут на "Склад".
        const stockEntries = await getStockReport(session.accessToken);
        const totals = new Map<string, number>();
        for (const entry of stockEntries) {
          totals.set(entry.productId, (totals.get(entry.productId) ?? 0) + Number(entry.quantity));
        }
        setStockByProduct(totals);
      }
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("products.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // businessType приходит из App.tsx отдельным асинхронным запросом (getSaleConfig) и может
    // долететь уже после первого монтирования — без этой зависимости остаток для Магазина/Аптеки
    // иногда не подгружался бы, если businessType опоздал к первому вызову load().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken, showStock]);

  const categoryName = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (map.get(id) ?? "") : "");
  }, [categories]);

  const filtered = products.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.sku ?? "").toLowerCase().includes(q) ||
      (p.barcode ?? "").toLowerCase().includes(q)
    );
  });

  // Не из исходного ТЗ — по прямому запросу клиента: только для Магазина. Приход по маркировке
  // (см. WarehouseScreen.tsx — Настройки → "Приём по штрихкоду и маркировке") создаёт товар с
  // названием, но без цены — её всё равно вносят вручную по накладной позже. Без разделения
  // такие товары терялись бы в общем списке; тут они вынесены отдельным списком сверху, чтобы
  // было видно, что ещё нужно дозаполнить.
  const isStoreSplit = businessType === "STORE";
  const noPriceRows = useMemo(
    () => filtered.filter((p) => !p.price || Number(p.price) <= 0),
    [filtered],
  );
  const withPriceRows = useMemo(
    () => filtered.filter((p) => p.price && Number(p.price) > 0),
    [filtered],
  );

  function openCreate() {
    setEditingProduct(null);
    setFormOpen(true);
  }

  function openEdit(product: ApiProduct) {
    setEditingProduct(product);
    setFormOpen(true);
  }

  function handleSaved(saved: ApiProduct, newCategory?: ApiCategory) {
    setProducts((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      return exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved];
    });
    if (newCategory) {
      setCategories((prev) => [...prev, newCategory]);
    }
    setFormOpen(false);
    onCatalogChanged();
  }

  // Не из исходного ТЗ — по прямому запросу клиента: одна кнопка на панель, смысл зависит от
  // того, что выделено. Если хоть один из выделенных активен — кнопка деактивирует (с
  // подтверждением, как и раньше) именно активных из выделения; уже неактивные молча
  // пропускаются. Только когда ВСЕ выделенные уже неактивны — кнопка активирует их напрямую,
  // без подтверждения (как и раньше для одиночного товара).
  async function handleToggleActive(targets: ApiProduct[]) {
    const toDeactivate = targets.filter((p) => p.isActive);
    if (toDeactivate.length > 0) {
      setConfirmError(null);
      setConfirmTargets(toDeactivate);
      return;
    }
    setRowError(null);
    try {
      const saved = await Promise.all(
        targets.map((p) => updateProduct(session.accessToken, p.id, { isActive: true })),
      );
      const byId = new Map(saved.map((p) => [p.id, p]));
      setProducts((prev) => prev.map((p) => byId.get(p.id) ?? p));
      onCatalogChanged();
      clearSelection();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : t("products.saveError"));
    }
  }

  async function confirmDeactivate() {
    if (!confirmTargets || confirmTargets.length === 0) return;
    setConfirmSubmitting(true);
    setConfirmError(null);
    try {
      await Promise.all(confirmTargets.map((p) => deactivateProduct(session.accessToken, p.id)));
      const ids = new Set(confirmTargets.map((p) => p.id));
      setProducts((prev) => prev.map((p) => (ids.has(p.id) ? { ...p, isActive: false } : p)));
      onCatalogChanged();
      setConfirmTargets(null);
      clearSelection();
    } catch (err) {
      // Диалог остаётся открытым, с реальной причиной сбоя — раньше ошибка терялась молча,
      // и деактивация выглядела зависшей, даже если на сервере уже всё прошло (см. фикс request()).
      setConfirmError(err instanceof ApiError ? err.message : t("products.saveError"));
    } finally {
      setConfirmSubmitting(false);
    }
  }

  async function confirmPurge() {
    if (!purgeTargets || purgeTargets.length === 0) return;
    setPurgeSubmitting(true);
    setPurgeError(null);
    try {
      // allSettled, а не all — при массовом удалении часть товаров может иметь историю продаж
      // (сервер отказывает 400-й именно по ним), остальные всё равно должны удалиться, а не
      // откатываться из-за одного отказа.
      const results = await Promise.allSettled(
        purgeTargets.map((p) => purgeProduct(session.accessToken, p.id).then(() => p.id)),
      );
      const succeededIds = new Set(
        results
          .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
          .map((r) => r.value),
      );
      setProducts((prev) => prev.filter((p) => !succeededIds.has(p.id)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        succeededIds.forEach((id) => next.delete(id));
        return next;
      });
      onCatalogChanged();
      const remaining = purgeTargets.filter((p) => !succeededIds.has(p.id));
      if (remaining.length > 0) {
        setPurgeError(t("products.purgeErrorPartial", { count: remaining.length }));
        setPurgeTargets(remaining);
      } else {
        setPurgeTargets(null);
      }
    } catch (err) {
      setPurgeError(err instanceof ApiError ? err.message : t("products.purgeError"));
    } finally {
      setPurgeSubmitting(false);
    }
  }

  function renderProductsTable(rows: ApiProduct[]) {
    const selected = canManage ? rows.filter((p) => selectedIds.has(p.id)) : [];
    const allSelected = rows.length > 0 && rows.every((p) => selectedIds.has(p.id));
    const allSelectedInactive = selected.length > 0 && selected.every((p) => !p.isActive);

    return (
      <div className="space-y-2">
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-2.5">
            <span className="truncate text-sm font-medium text-slate-700">
              {selected.length === 1 ? selected[0].name : t("products.selectedCount", { count: selected.length })}
            </span>
            <div className="flex items-center gap-3">
              {selected.length === 1 && (
                <button
                  onClick={() => openEdit(selected[0])}
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  {t("products.edit")}
                </button>
              )}
              <button
                onClick={() => handleToggleActive(selected)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                {allSelectedInactive ? t("products.activate") : t("products.deactivate")}
              </button>
              {canDelete && (
                <button
                  onClick={() => {
                    setPurgeError(null);
                    setPurgeTargets(selected);
                  }}
                  className="text-xs font-semibold text-red-500 hover:text-red-600"
                >
                  {t("products.delete")}
                </button>
              )}
              <button
                onClick={clearSelection}
                className="text-xs font-medium text-slate-400 hover:text-slate-600"
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-slate-100 bg-white text-xs text-slate-400">
                  {canManage && (
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      <Checkbox
                        checked={allSelected}
                        onChange={() => toggleSelectAll(rows)}
                        ariaLabel={t("products.selectAll")}
                      />
                    </th>
                  )}
                  <th className="whitespace-nowrap px-4 py-3 font-medium">{t("products.name")}</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">{t("products.category")}</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">{t("products.sku")}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-medium">{t("products.price")}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-medium">{t("products.cost")}</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">{t("products.unit")}</th>
                  {showStock && (
                    <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                      {t("warehouse.stockTitle")}
                    </th>
                  )}
                  {isPharmacy && (
                    <th className="whitespace-nowrap px-4 py-3 font-medium">{t("products.expiryDate")}</th>
                  )}
                  <th className="whitespace-nowrap px-4 py-3 font-medium">{t("products.status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr
                    key={p.id}
                    onClick={canManage ? () => toggleSelect(p.id) : undefined}
                    className={`border-b border-slate-50 last:border-0 ${canManage ? "cursor-pointer" : ""} ${
                      selectedIds.has(p.id) ? "bg-accent/5" : "hover:bg-slate-50"
                    }`}
                  >
                    {canManage && (
                      <td className="whitespace-nowrap px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} ariaLabel={p.name} />
                      </td>
                    )}
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50 text-xs font-bold text-slate-400">
                          {p.imageUrl ? (
                            <img src={`${API_BASE}${p.imageUrl}`} alt="" className="h-full w-full object-cover" />
                          ) : (
                            p.name.trim().slice(0, 2).toUpperCase()
                          )}
                        </span>
                        <span>
                          {p.name}
                          {p.isConsumable && (
                            <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                              {t("products.consumable")}
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{categoryName(p.categoryId)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{p.sku}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-slate-800">
                      {p.price && Number(p.price) > 0 ? `${formatSum(Number(p.price))} ${t("common.currency")}` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-slate-500">
                      {p.cost ? `${formatSum(Number(p.cost))} ${t("common.currency")}` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{p.unit}</td>
                    {showStock && (
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right ${
                          (stockByProduct.get(p.id) ?? 0) <= 0 ? "text-red-600" : "text-slate-800"
                        }`}
                      >
                        {stockByProduct.get(p.id) ?? 0} {p.unit}
                      </td>
                    )}
                    {isPharmacy && (
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        {p.expiryDate ? new Date(p.expiryDate).toLocaleDateString("ru-RU") : "—"}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-4 py-3">
                      {p.isActive ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
                          {t("products.active")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                          {t("products.inactive")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}

                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={7 + (canManage ? 1 : 0) + (isPharmacy ? 1 : 0) + (showStock ? 1 : 0)}
                      className="px-4 py-8 text-center text-sm text-slate-400"
                    >
                      {t("products.empty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">{t("nav.products")}</h1>
        {canManage && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover"
          >
            <PlusIcon width={16} height={16} />
            {t("products.addTitle")}
          </button>
        )}
      </div>

      <div className="relative max-w-sm">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("products.searchPlaceholder")}
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:border-accent"
        />
      </div>

      {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}
      {loadError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{loadError}</p>}
      {rowError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{rowError}</p>}

      {!loading && !loadError && isStoreSplit && (
        <div className="space-y-5">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-amber-700">
              {t("products.noPriceTitle")} ({noPriceRows.length})
            </h2>
            {renderProductsTable(noPriceRows)}
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-600">
              {t("products.withPriceTitle")} ({withPriceRows.length})
            </h2>
            {renderProductsTable(withPriceRows)}
          </div>
        </div>
      )}

      {!loading && !loadError && !isStoreSplit && renderProductsTable(filtered)}

      {formOpen && (
        <ProductFormModal
          session={session}
          categories={categories}
          product={editingProduct}
          isPharmacy={isPharmacy}
          requireBarcode={isPharmacy || businessType === "STORE"}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {confirmTargets && confirmTargets.length > 0 && (
        <ConfirmDialog
          title={confirmTargets.length === 1 ? t("products.deactivateTitle") : t("products.deactivateTitleBulk")}
          message={
            confirmTargets.length === 1
              ? t("products.deactivateConfirm", { name: confirmTargets[0].name })
              : t("products.deactivateConfirmBulk", { count: confirmTargets.length })
          }
          confirmLabel={t("products.deactivate")}
          danger
          submitting={confirmSubmitting}
          error={confirmError}
          onClose={() => setConfirmTargets(null)}
          onConfirm={confirmDeactivate}
        />
      )}

      {purgeTargets && purgeTargets.length > 0 && (
        <ConfirmDialog
          title={purgeTargets.length === 1 ? t("products.deleteTitle") : t("products.deleteTitleBulk")}
          message={
            purgeTargets.length === 1
              ? t("products.deleteConfirm", { name: purgeTargets[0].name })
              : t("products.deleteConfirmBulk", { count: purgeTargets.length })
          }
          confirmLabel={t("products.delete")}
          danger
          submitting={purgeSubmitting}
          error={purgeError}
          onClose={() => setPurgeTargets(null)}
          onConfirm={confirmPurge}
        />
      )}
    </div>
  );
}
