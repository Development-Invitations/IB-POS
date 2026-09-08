import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ApiError,
  adjustStock,
  createProduct,
  getProducts,
  getStockMovements,
  getStockReport,
  getStores,
  getWarehouseConfig,
  lookupBarcode,
  receiveStock,
  type BarcodeLookupItem,
} from "../lib/api";
import { useBarcodeScanner } from "../lib/use-barcode-scanner";
import { AmountInput } from "./AmountInput";
import { CloseIcon, MinusIcon, PlusIcon, SearchIcon } from "./icons";
import type { ApiProduct, ApiStockEntry, ApiStore, ReceivingMode } from "../types/api";
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
  // Заполнено только если количество набрано сканированием маркировок (режим MARKING_SCAN,
  // см. beginMarkingReceive/finishMarkingReceive ниже) — при ручной правке количества в таблице
  // очищается (setBatchQuantity), т.к. количество больше не подтверждено поштучным сканом.
  markingCodes?: string[];
}

// Товар, для которого запущен приход по маркировке: сначала спрашиваем количество (по
// накладной), затем открываем сканирование — каждый скан добавляет одну маркировку, пока не
// наберётся targetQty (см. markingModeActive ниже). targetQty === null — ещё на шаге ввода
// количества, скан в это время игнорируется.
interface PendingMarkingReceive {
  product: ApiProduct;
  targetQty: number | null;
  markings: string[];
  // Не из исходного ТЗ — по прямому запросу клиента: раньше повторный скан штрихкода уже
  // известного товара открывал СОВСЕМ новую, "незнающую" сессию — ни истории приёмок с сервера
  // (см. markingCodesByProduct), ни уже добавленной в этот же черновик прихода строки для этого
  // товара она не видела, поэтому один и тот же физический код маркировки можно было записать
  // второй раз, просто подняв количество. known — объединение того и другого, собирается один
  // раз в beginMarkingReceive; и новые сканы, и вводимое количество сверяются против него же.
  known: string[];
  skipped: number;
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

  // "Корректировка" в режиме приёма по маркировке (не из исходного ТЗ, по прямому запросу
  // клиента) — вместо ручного ввода нового числа открывает сканирование: уже известные коды
  // (собраны по истории движений остатка, см. getStockMovements) пропускаются молча, новые —
  // добавляются и увеличивают остаток. См. openMarkingAdjust/handleMarkingAdjustScan ниже.
  const [markingAdjustTarget, setMarkingAdjustTarget] = useState<ApiStockEntry | null>(null);
  const [markingAdjustExisting, setMarkingAdjustExisting] = useState<string[]>([]);
  const [markingAdjustNew, setMarkingAdjustNew] = useState<string[]>([]);
  const [markingAdjustLoading, setMarkingAdjustLoading] = useState(false);
  const [markingAdjustSubmitting, setMarkingAdjustSubmitting] = useState(false);
  const [markingAdjustError, setMarkingAdjustError] = useState<string | null>(null);
  const [markingAdjustSkipped, setMarkingAdjustSkipped] = useState(0);

  // Штрихкод не найден среди своих товаров — пробуем госкаталог (tasnif.soliq.uz, см.
  // ProductsService.lookupBarcode на сервере), не из исходного ТЗ, по прямому запросу клиента:
  // "пробил штрихкод — данные ввелись автоматически". Один штрихкод в каталоге нередко
  // зарегистрирован под НЕСКОЛЬКИМИ разными ИКПУ (до ~20 вариантов — разные производители/
  // фасовки) — если найдено больше одного, сначала показываем список на выбор (pickingItem),
  // а не берём наугад первый попавшийся.
  const [scanLookup, setScanLookup] = useState<{
    barcode: string;
    items: BarcodeLookupItem[];
    suggestions: BarcodeLookupItem[];
  } | null>(null);
  const [pickingItem, setPickingItem] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickPrice, setQuickPrice] = useState(0);
  const [quickUnit, setQuickUnit] = useState("pcs");
  const [quickMxikCode, setQuickMxikCode] = useState<string | null>(null);
  // Подсказка выбрана из "похожих" (не точное совпадение штрихкода) — меняет текст
  // предупреждения на "проверьте перед сохранением" вместо "найдено", см. pickItem().
  const [fromSuggestion, setFromSuggestion] = useState(false);
  const [quickSubmitting, setQuickSubmitting] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);

  // Настройки → Магазин → "Приём товара на складе" (не из исходного ТЗ, по прямому запросу
  // клиента). Узкий эндпоинт (не полный /settings) — доступен и Зав.складом, не только Админу.
  const [receivingMode, setReceivingMode] = useState<ReceivingMode>("MANUAL");
  const [receivingBusinessType, setReceivingBusinessType] = useState<string | null>(null);
  const markingModeActive = receivingMode === "MARKING_SCAN" && receivingBusinessType === "STORE";

  const [pendingMarking, setPendingMarking] = useState<PendingMarkingReceive | null>(null);
  const [pendingQtyInput, setPendingQtyInput] = useState("");
  const [markingError, setMarkingError] = useState<string | null>(null);

  useEffect(() => {
    if (!canManage) return;
    getWarehouseConfig(session.accessToken)
      .then((cfg) => {
        setReceivingMode(cfg.receivingMode);
        setReceivingBusinessType(cfg.businessType);
      })
      .catch(() => undefined);
  }, [session.accessToken, canManage]);

  // Не из исходного ТЗ — по прямому запросу клиента: у товара в "Остатках" не было видно, есть
  // ли по нему уже отсканированная маркировка вообще — приходилось верить внутренней логике на
  // слово. Один запрос по всей точке разом (не по товару отдельно — не дёргать эндпоинт N раз),
  // агрегирует коды из истории движений в карту "товар → его коды", используется и для колонки
  // статуса, и как быстрый предзагруз при открытии "Корректировки" по маркировке.
  const [markingCodesByProduct, setMarkingCodesByProduct] = useState<Map<string, string[]>>(new Map());

  function refreshMarkingCodes() {
    if (!markingModeActive || !storeId) return;
    getStockMovements(session.accessToken, storeId)
      .then((movements) => {
        const byProduct = new Map<string, Set<string>>();
        for (const m of movements) {
          if (m.type !== "RECEIPT_IN") continue;
          const set = byProduct.get(m.stock.productId) ?? new Set<string>();
          for (const code of m.markingCodes) set.add(code);
          byProduct.set(m.stock.productId, set);
        }
        setMarkingCodesByProduct(new Map([...byProduct].map(([id, set]) => [id, [...set]])));
      })
      .catch(() => undefined);
  }

  useEffect(() => {
    refreshMarkingCodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken, storeId, markingModeActive]);

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
    // Корректировка остатка по маркировке (см. openMarkingAdjust) — очередной скан это код
    // маркировки, известные коды пропускаются молча, новые добавляются.
    if (markingAdjustTarget) {
      handleMarkingAdjustScan(code);
      return;
    }
    // Идёт приём по маркировке — очередной скан это код маркировки конкретной единицы, а не
    // штрихкод товара (см. beginMarkingReceive). Пока не введено количество (targetQty === null,
    // открыт попап "сколько пришло?") — случайный скан игнорируем, а не путаем с товаром.
    if (pendingMarking) {
      if (pendingMarking.targetQty !== null) {
        handleMarkingScan(code);
      }
      return;
    }
    const product = products.find((p) => p.barcode === code);
    if (product) {
      if (markingModeActive) {
        beginMarkingReceive(product);
      } else {
        setScanMessage(null);
        addToBatch(product);
      }
      return;
    }
    setScanMessage(t("warehouse.scanLookingUp", { code }));
    lookupBarcode(session.accessToken, code)
      .then((result) => {
        setScanMessage(null);
        openScanResult(code, result.items, result.suggestions);
      })
      .catch(() => {
        setScanMessage(null);
        openScanResult(code, [], []);
      });
  });

  function openScanResult(barcode: string, items: BarcodeLookupItem[], suggestions: BarcodeLookupItem[]) {
    setScanLookup({ barcode, items, suggestions });
    setQuickError(null);
    if (items.length === 1) {
      pickItem(items[0]);
    } else if (items.length === 0) {
      pickItem(null);
    } else {
      setPickingItem(true);
    }
  }

  function pickItem(item: BarcodeLookupItem | null, isSuggestion = false) {
    setQuickName(item?.name ?? "");
    setQuickUnit(item?.unit || "pcs");
    setQuickPrice(0);
    setQuickMxikCode(item?.mxikCode ?? null);
    setFromSuggestion(isSuggestion);
    setPickingItem(false);
  }

  // Приход по маркировке (Настройки → Магазин, не из исходного ТЗ): сначала спрашиваем
  // количество (по накладной), затем сканируем маркировку каждой единицы — см.
  // handleMarkingScan/finishMarkingReceive. known — уже учтённые коды по этому товару: и вся
  // история приёмок с сервера (markingCodesByProduct), и то, что уже лежит в ЕЩЁ не отправленном
  // черновике прихода для этого же товара (batch) — без этого повторный скан штрихкода того же
  // товара открывал "слепую" сессию, не знающую о ранее принятых или ещё не отправленных кодах,
  // и один физический код маркировки можно было записать второй раз (жалоба клиента: "просто
  // количество поднял, а штрихкод остался 1" — то есть тот же товар получил задвоенный приход).
  function beginMarkingReceive(product: ApiProduct) {
    const historical = markingCodesByProduct.get(product.id) ?? [];
    const inDraft = batch.get(product.id)?.markingCodes ?? [];
    setPendingMarking({
      product,
      targetQty: null,
      markings: [],
      known: [...new Set([...historical, ...inDraft])],
      skipped: 0,
    });
    setPendingQtyInput("");
    setMarkingError(null);
  }

  function confirmMarkingQuantity() {
    const n = Number(pendingQtyInput);
    if (!Number.isFinite(n) || n <= 0) return;
    setPendingMarking((prev) => (prev ? { ...prev, targetQty: Math.floor(n) } : prev));
  }

  function handleMarkingScan(code: string) {
    setPendingMarking((prev) => {
      if (!prev) return prev;
      if (prev.known.includes(code) || prev.markings.includes(code)) {
        setMarkingError(t("warehouse.markingDuplicate"));
        return { ...prev, skipped: prev.skipped + 1 };
      }
      setMarkingError(null);
      return { ...prev, markings: [...prev.markings, code] };
    });
  }

  function removeMarkingAt(index: number) {
    setPendingMarking((prev) => (prev ? { ...prev, markings: prev.markings.filter((_, i) => i !== index) } : prev));
  }

  // Срабатывает и по кнопке "Готово" (можно завершить раньше, если по факту пришло меньше, чем
  // указали изначально), и автоматически при достижении targetQty (эффект ниже) — источник
  // истины по количеству это именно число отсканированных маркировок, не введённая цифра.
  function finishMarkingReceive() {
    setPendingMarking((prev) => {
      if (!prev || prev.markings.length === 0) return prev;
      addBatchWithQuantity(prev.product, prev.markings.length, prev.markings);
      setScanMessage(t("warehouse.markingReceiveAdded", { name: prev.product.name, count: prev.markings.length }));
      return null;
    });
  }

  useEffect(() => {
    if (pendingMarking && pendingMarking.targetQty !== null && pendingMarking.markings.length >= pendingMarking.targetQty) {
      finishMarkingReceive();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMarking]);

  async function handleQuickCreate() {
    if (!scanLookup || !quickName.trim()) return;
    if (!markingModeActive && quickPrice <= 0) return;
    setQuickSubmitting(true);
    setQuickError(null);
    try {
      const created = await createProduct(session.accessToken, {
        name: quickName.trim(),
        barcode: scanLookup.barcode,
        // В режиме приёма по маркировке цена не обязательна — 0 значит "укажем позже по
        // накладной" (см. ProductsScreen.tsx — такие товары показаны отдельным списком сверху).
        price: quickPrice,
        unit: quickUnit.trim() || "pcs",
        mxikCode: quickMxikCode ?? undefined,
        // Артикул из госкаталога — по прямому запросу клиента ("можно для таких полей
        // автозаполнение?"): код ИКПУ и так уникален и уже известен, если товар найден по
        // скану — не заставляем вводить артикул вручную второй раз. Себестоимость так же
        // автозаполнить нельзя ни из какого внешнего источника — это закупочная цена именно
        // этого магазина, госкаталог её не знает и знать не может.
        sku: quickMxikCode ?? undefined,
      });
      setProducts((prev) => [...prev, created]);
      setScanLookup(null);
      if (markingModeActive) {
        beginMarkingReceive(created);
      } else {
        addToBatch(created);
      }
    } catch (err) {
      setQuickError(err instanceof ApiError ? err.message : t("warehouse.quickCreateError"));
    } finally {
      setQuickSubmitting(false);
    }
  }

  function addToBatch(product: ApiProduct) {
    setBatch((prev) => {
      const next = new Map(prev);
      const existing = next.get(product.id);
      next.set(product.id, { product, quantity: (existing?.quantity ?? 0) + 1 });
      return next;
    });
  }

  // Приход по маркировке (см. finishMarkingReceive) — количество и коды маркировки набраны
  // сканированием, а не введены вручную. Повторный скан того же товара в рамках одной партии
  // (например, довезли ещё коробку) суммирует количество и объединяет коды.
  function addBatchWithQuantity(product: ApiProduct, quantity: number, markingCodes: string[]) {
    setBatch((prev) => {
      const next = new Map(prev);
      const existing = next.get(product.id);
      next.set(product.id, {
        product,
        quantity: (existing?.quantity ?? 0) + quantity,
        markingCodes: [...(existing?.markingCodes ?? []), ...markingCodes],
      });
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
        // Ручная правка количества — коды маркировки от исходного скана больше не соответствуют
        // фактическому количеству, поэтому очищаем (не подтверждено поштучным сканом).
        next.set(productId, { ...line, quantity, markingCodes: undefined });
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
          markingCodes: line.markingCodes,
        });
      }
      setBatch(new Map());
      await load(true);
      const fresh = await getStockReport(session.accessToken, storeId);
      setEntries(fresh);
      onStockChanged?.();
      refreshMarkingCodes();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : t("warehouse.receiveError"));
    } finally {
      setSubmitting(false);
    }
  }

  function openAdjust(entry: ApiStockEntry) {
    if (markingModeActive) {
      openMarkingAdjust(entry);
      return;
    }
    setAdjustTarget(entry);
    setAdjustValue(entry.quantity);
    setAdjustReason("");
    setAdjustError(null);
  }

  // "Корректировка" в режиме приёма по маркировке — вместо ручного ввода нового числа остатка
  // (что и есть та самая "просто редактирование остатка без маркировки", от которой отказался
  // клиент) открывает сканирование: подтягивает уже известные по этому товару коды маркировки
  // из истории движений остатка (все RECEIPT_IN когда-либо, не только последний приход), чтобы
  // повторный скан уже учтённой упаковки молча игнорировался, а не задваивал остаток.
  async function openMarkingAdjust(entry: ApiStockEntry) {
    setMarkingAdjustTarget(entry);
    setMarkingAdjustNew([]);
    setMarkingAdjustSkipped(0);
    setMarkingAdjustError(null);
    setMarkingAdjustLoading(true);
    try {
      const movements = await getStockMovements(session.accessToken, entry.storeId, entry.productId);
      const existing = new Set<string>();
      for (const m of movements) {
        if (m.type === "RECEIPT_IN") {
          for (const code of m.markingCodes) existing.add(code);
        }
      }
      setMarkingAdjustExisting([...existing]);
    } catch (err) {
      setMarkingAdjustError(err instanceof ApiError ? err.message : t("warehouse.markingAdjustLoadError"));
      setMarkingAdjustExisting([]);
    } finally {
      setMarkingAdjustLoading(false);
    }
  }

  function handleMarkingAdjustScan(code: string) {
    if (markingAdjustExisting.includes(code) || markingAdjustNew.includes(code)) {
      setMarkingAdjustSkipped((n) => n + 1);
      return;
    }
    setMarkingAdjustNew((prev) => [...prev, code]);
  }

  function closeMarkingAdjust() {
    setMarkingAdjustTarget(null);
    setMarkingAdjustExisting([]);
    setMarkingAdjustNew([]);
  }

  async function confirmMarkingAdjust() {
    if (!markingAdjustTarget || markingAdjustNew.length === 0) {
      closeMarkingAdjust();
      return;
    }
    setMarkingAdjustSubmitting(true);
    setMarkingAdjustError(null);
    try {
      await receiveStock(session.accessToken, {
        storeId: markingAdjustTarget.storeId,
        productId: markingAdjustTarget.productId,
        quantity: markingAdjustNew.length,
        comment: t("warehouse.receiveComment"),
        markingCodes: markingAdjustNew,
      });
      const fresh = await getStockReport(session.accessToken, markingAdjustTarget.storeId);
      setEntries(fresh);
      onStockChanged?.();
      refreshMarkingCodes();
      closeMarkingAdjust();
    } catch (err) {
      setMarkingAdjustError(err instanceof ApiError ? err.message : t("warehouse.receiveError"));
    } finally {
      setMarkingAdjustSubmitting(false);
    }
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
          <div className="flex items-center gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">{t("warehouse.receiveTitle")}</h2>
              <p className="text-xs text-slate-400">
                {markingModeActive ? t("warehouse.receiveHintMarking") : t("warehouse.receiveHint")}
              </p>
            </div>
            {markingModeActive && (
              <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
                {t("settings.receivingModes.MARKING_SCAN.title")}
              </span>
            )}
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
                      if (markingModeActive) {
                        beginMarkingReceive(p);
                      } else {
                        addToBatch(p);
                      }
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
                      <td className="px-3 py-2 text-slate-800">
                        {line.product.name}
                        {line.markingCodes && line.markingCodes.length > 0 && (
                          <span
                            className="ml-1.5 rounded bg-emerald-50 px-1 py-0.5 text-[10px] font-semibold text-emerald-600"
                            title={t("warehouse.markingVerifiedHint")}
                          >
                            {t("warehouse.markingVerifiedBadge")}
                          </span>
                        )}
                      </td>
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
                        <div className="flex items-center justify-end gap-2">
                          {markingModeActive && (
                            <button
                              onClick={() => beginMarkingReceive(line.product)}
                              className="whitespace-nowrap text-xs font-medium text-accent hover:underline"
                            >
                              {t("warehouse.markingAddMore")}
                            </button>
                          )}
                          <button
                            onClick={() => removeFromBatch(line.product.id)}
                            className="text-slate-400 hover:text-red-500"
                            aria-label={t("common.remove")}
                          >
                            <CloseIcon width={14} height={14} />
                          </button>
                        </div>
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
                  {markingModeActive && <th className="px-4 py-3 font-medium">{t("warehouse.markingStatus")}</th>}
                  {canManage && <th className="px-4 py-3 font-medium" />}
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => {
                  const knownCodes = markingCodesByProduct.get(entry.productId) ?? [];
                  return (
                  <tr key={entry.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{entry.product.name}</td>
                    <td className="px-4 py-3 text-slate-500">{entry.product.barcode ?? "—"}</td>
                    <td
                      className={`px-4 py-3 text-right ${Number(entry.quantity) <= 0 ? "text-red-600" : "text-slate-800"}`}
                    >
                      {entry.quantity} {entry.product.unit}
                    </td>
                    {markingModeActive && (
                      <td className="px-4 py-3">
                        {knownCodes.length > 0 ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
                            {t("warehouse.markingCount", { count: knownCodes.length })}
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                            {t("warehouse.markingNone")}
                          </span>
                        )}
                      </td>
                    )}
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openAdjust(entry)}
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          {markingModeActive ? t("warehouse.adjustByMarking") : t("warehouse.adjust")}
                        </button>
                      </td>
                    )}
                  </tr>
                  );
                })}

                {filteredEntries.length === 0 && (
                  <tr>
                    <td
                      colSpan={3 + (markingModeActive ? 1 : 0) + (canManage ? 1 : 0)}
                      className="px-4 py-8 text-center text-sm text-slate-400"
                    >
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

      {markingAdjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-800">{markingAdjustTarget.product.name}</h2>
              <button
                onClick={closeMarkingAdjust}
                className="text-slate-400 hover:text-slate-700"
                aria-label={t("common.close")}
              >
                <CloseIcon />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              {markingAdjustLoading ? (
                <p className="text-sm text-slate-400">{t("common.loading")}</p>
              ) : (
                <>
                  <p className="text-xs text-slate-400">
                    {t("warehouse.markingAdjustHint", { known: markingAdjustExisting.length })}
                  </p>
                  <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                    {t("warehouse.markingAdjustAdded", { count: markingAdjustNew.length })}
                  </div>
                  {markingAdjustSkipped > 0 && (
                    <p className="text-xs text-amber-600">
                      {t("warehouse.markingAdjustSkipped", { count: markingAdjustSkipped })}
                    </p>
                  )}
                  {markingAdjustNew.length > 0 && (
                    <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg bg-slate-50 px-2 py-2">
                      {markingAdjustNew.map((code, i) => (
                        <div key={code} className="flex items-center justify-between gap-2 text-xs text-slate-500">
                          <span className="truncate">
                            {i + 1}. {code}
                          </span>
                          <button
                            onClick={() => setMarkingAdjustNew((prev) => prev.filter((_, idx) => idx !== i))}
                            className="shrink-0 text-slate-300 hover:text-red-500"
                            aria-label={t("common.remove")}
                          >
                            <CloseIcon width={12} height={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              {markingAdjustError && <p className="text-xs text-red-600">{markingAdjustError}</p>}
            </div>
            <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
              <button
                onClick={closeMarkingAdjust}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50"
              >
                {t("returns.cancel")}
              </button>
              <button
                onClick={confirmMarkingAdjust}
                disabled={markingAdjustSubmitting || markingAdjustLoading || markingAdjustNew.length === 0}
                className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
              >
                {markingAdjustSubmitting
                  ? t("common.loading")
                  : t("warehouse.markingAdjustSave", { count: markingAdjustNew.length })}
              </button>
            </div>
          </div>
        </div>
      )}

      {scanLookup && pickingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="flex w-full max-w-md flex-col rounded-xl bg-white shadow-xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-800">{t("warehouse.pickMxikTitle")}</h2>
              <p className="mt-1 text-xs text-slate-400">
                {t("warehouse.pickMxikHint", { count: scanLookup.items.length })}
              </p>
            </div>
            <div className="max-h-72 overflow-y-auto px-2 py-2">
              {scanLookup.items.map((item) => (
                <button
                  key={item.mxikCode}
                  onClick={() => pickItem(item)}
                  className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                >
                  <span className="text-sm font-medium text-slate-800">{item.name}</span>
                  <span className="text-xs text-slate-400">{t("warehouse.mxikCode")}: {item.mxikCode}</span>
                </button>
              ))}
            </div>
            <div className="border-t border-slate-100 px-5 py-4">
              <button
                onClick={() => pickItem(null)}
                className="w-full rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50"
              >
                {t("warehouse.pickMxikManual")}
              </button>
            </div>
          </div>
        </div>
      )}

      {scanLookup && !pickingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-800">{t("warehouse.quickCreateTitle")}</h2>
              <p className="mt-1 text-xs text-slate-400">
                {quickMxikCode
                  ? t(fromSuggestion ? "warehouse.quickCreateSuggestionHint" : "warehouse.quickCreateFoundHint")
                  : t("warehouse.quickCreateNotFoundHint")}
              </p>
            </div>
            <div className="space-y-3 px-5 py-4">
              {!quickMxikCode && scanLookup.suggestions.length > 0 && (
                <div className="space-y-1.5 rounded-lg bg-amber-50 px-3 py-2">
                  <p className="text-xs font-medium text-amber-700">{t("warehouse.suggestionsTitle")}</p>
                  <div className="max-h-40 space-y-1.5 overflow-y-auto">
                    {scanLookup.suggestions.map((s) => (
                      <button
                        key={s.mxikCode}
                        onClick={() => pickItem(s, true)}
                        className="block w-full rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-left text-xs leading-snug text-slate-700 hover:border-accent/40"
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <label className="block text-xs font-medium text-slate-500">
                {t("products.name")}
                <input
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  autoFocus
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-slate-500">
                  {t("products.price")}
                  {markingModeActive && (
                    <span className="ml-1 font-normal text-slate-400">({t("common.optional")})</span>
                  )}
                  <AmountInput
                    value={quickPrice}
                    onChange={setQuickPrice}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-accent"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-500">
                  {t("products.unit")}
                  <input
                    value={quickUnit}
                    onChange={(e) => setQuickUnit(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </label>
              </div>
              <p className="text-xs text-slate-400">
                {t("products.barcode")}: {scanLookup.barcode}
              </p>
              {quickMxikCode && (
                <p className="text-xs text-slate-400">
                  {t("warehouse.mxikCode")}: {quickMxikCode}
                  {scanLookup.items.length > 1 && (
                    <button
                      onClick={() => setPickingItem(true)}
                      className="ml-2 font-medium text-accent hover:underline"
                    >
                      {t("warehouse.pickMxikChange")}
                    </button>
                  )}
                  {fromSuggestion && (
                    <button onClick={() => pickItem(null)} className="ml-2 font-medium text-accent hover:underline">
                      {t("warehouse.suggestionUndo")}
                    </button>
                  )}
                </p>
              )}
              {quickError && <p className="text-xs text-red-600">{quickError}</p>}
            </div>
            <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
              <button
                onClick={() => setScanLookup(null)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50"
              >
                {t("returns.cancel")}
              </button>
              <button
                onClick={handleQuickCreate}
                disabled={quickSubmitting || !quickName.trim() || (!markingModeActive && quickPrice <= 0)}
                className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
              >
                {quickSubmitting ? t("common.loading") : t("warehouse.quickCreateSubmit")}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingMarking && pendingMarking.targetQty === null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-800">{pendingMarking.product.name}</h2>
              <p className="mt-1 text-xs text-slate-400">{t("warehouse.markingQtyHint")}</p>
              {pendingMarking.known.length > 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  {t("warehouse.markingKnownHint", { count: pendingMarking.known.length })}
                </p>
              )}
            </div>
            <div className="space-y-3 px-5 py-4">
              <label className="block text-xs font-medium text-slate-500">
                {t("warehouse.markingQtyLabel")}
                <input
                  type="number"
                  min={1}
                  value={pendingQtyInput}
                  onChange={(e) => setPendingQtyInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmMarkingQuantity()}
                  autoFocus
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
            </div>
            <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
              <button
                onClick={() => setPendingMarking(null)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50"
              >
                {t("returns.cancel")}
              </button>
              <button
                onClick={confirmMarkingQuantity}
                disabled={!pendingQtyInput || Number(pendingQtyInput) <= 0}
                className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
              >
                {t("warehouse.markingQtyConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingMarking && pendingMarking.targetQty !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-800">{pendingMarking.product.name}</h2>
              <p className="mt-1 text-xs text-slate-400">
                {t("warehouse.markingScanHint", {
                  done: pendingMarking.markings.length,
                  total: pendingMarking.targetQty,
                })}
              </p>
            </div>
            <div className="space-y-2 px-5 py-4">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-accent transition-all"
                  style={{
                    width: `${Math.min(100, (pendingMarking.markings.length / pendingMarking.targetQty) * 100)}%`,
                  }}
                />
              </div>
              {markingError && <p className="text-xs text-red-600">{markingError}</p>}
              {pendingMarking.skipped > 0 && (
                <p className="text-xs text-amber-600">
                  {t("warehouse.markingAdjustSkipped", { count: pendingMarking.skipped })}
                </p>
              )}
              {pendingMarking.markings.length > 0 && (
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg bg-slate-50 px-2 py-2">
                  {pendingMarking.markings.map((code, i) => (
                    <div key={code} className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="truncate">
                        {i + 1}. {code}
                      </span>
                      <button
                        onClick={() => removeMarkingAt(i)}
                        className="shrink-0 text-slate-300 hover:text-red-500"
                        aria-label={t("common.remove")}
                      >
                        <CloseIcon width={12} height={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
              <button
                onClick={() => setPendingMarking(null)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50"
              >
                {t("returns.cancel")}
              </button>
              <button
                onClick={finishMarkingReceive}
                disabled={pendingMarking.markings.length === 0}
                className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
              >
                {t("warehouse.markingScanFinish", { count: pendingMarking.markings.length })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
