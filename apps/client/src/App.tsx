import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TitleBar } from "./components/TitleBar";
import { UpdateNotifier } from "./components/UpdateNotifier";
import { HomeScreen } from "./components/HomeScreen";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { CategoryTabs } from "./components/CategoryTabs";
import { ProductGrid } from "./components/ProductGrid";
import { ReceiptPanel, type PaidReceipt, type Ticket } from "./components/ReceiptPanel";
import { PaymentModal, type PaymentStatus, type ClickProvider } from "./components/PaymentModal";
import { ReturnConfirmModal } from "./components/ReturnConfirmModal";
import { ProductNotFoundModal } from "./components/ProductNotFoundModal";
import { ScanBlockedModal } from "./components/ScanBlockedModal";
import { EquipmentScreen } from "./components/EquipmentScreen";
import { ProductsScreen } from "./components/ProductsScreen";
import { WarehouseScreen } from "./components/WarehouseScreen";
import { CustomersScreen } from "./components/CustomersScreen";
import { DiscountsScreen } from "./components/DiscountsScreen";
import { ReturnsScreen } from "./components/ReturnsScreen";
import { ReportsScreen } from "./components/ReportsScreen";
import { ShiftsScreen } from "./components/ShiftsScreen";
import { IntegrationsScreen } from "./components/IntegrationsScreen";
import { EmployeesScreen } from "./components/EmployeesScreen";
import { SettingsScreen } from "./components/SettingsScreen";
import { LoginScreen } from "./components/LoginScreen";
import { RegisterScreen } from "./components/RegisterScreen";
import { ShiftSetupScreen } from "./components/ShiftSetupScreen";
import { CloseShiftModal } from "./components/CloseShiftModal";
import { ReturnIcon, ClockIcon, BoxIcon, MonitorIcon } from "./components/icons";
import { Modal } from "./components/Modal";
import {
  ApiError,
  closeShift,
  createReceipt,
  getCategories,
  getNotificationsConfig,
  getProducts,
  getSaleConfig,
  getShiftReport,
  getStockReport,
  payReceipt,
  previewReceipt,
  returnReceipt,
  type ReceiptPreview,
} from "./lib/api";
import { computeTotals } from "./lib/cart";
import { useBarcodeScanner } from "./lib/use-barcode-scanner";
import { clearSession, loadSession, saveSession } from "./lib/session";
import type { CartProduct } from "./types/catalog";
import type { PaymentMethod } from "./types/payment";
import type { ScreenKey } from "./types/screen";
import type { AuthSession, Role } from "./types/auth";
import type { ApiShift, ApiWorkstation, BackendPaymentMethod, BusinessType } from "./types/api";
import "./App.css";

// Только у кассира вся работа в системе сводится к кассе — открыть смену для него обязательно
// с самого входа. Остальным ролям (Раздел 3 ТЗ) смена нужна, только если они сами захотят
// пробить чек на экране «Продажа» — админ, управляющий и т.д. должны сразу попадать в панель
// и видеть отчёты/настройки/список сотрудников без выбора кассы.
const SHIFT_GATED_ROLES: Role[] = ["CASHIER"];

// Куда попадает роль сразу после входа — своя "главная страница" по работе (Раздел 3 ТЗ).
// Кассиру продавать — сразу на "Продажу", это и есть их главная (отдельная сводная панель им не
// нужна). Зав. складом закупками/остатками занимается на "Товарах". Админ, Управляющий и
// Бухгалтер видят весь бизнес — у них общая "Главная" (см. HomeScreen.tsx): какие кассы сейчас
// работают.
const ROLE_HOME_SCREEN: Record<Role, ScreenKey> = {
  CASHIER: "sale",
  WAREHOUSE: "products",
  ADMIN: "home",
  MANAGER: "home",
  ACCOUNTANT: "home",
};

function toBackendMethod(method: PaymentMethod, clickProvider: ClickProvider): BackendPaymentMethod {
  switch (method) {
    case "cash":
      return "CASH";
    case "card":
      return "CARD";
    case "qr":
      return "QR";
    case "mixed":
      return "MIXED";
    case "clickPayme":
      return clickProvider === "payme" ? "PAYME" : "CLICK";
  }
}

function App() {
  const { t } = useTranslation();
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [prefillOrgId, setPrefillOrgId] = useState<string | undefined>(undefined);
  const [prefillLogin, setPrefillLogin] = useState<string | undefined>(undefined);
  const [workstation, setWorkstation] = useState<ApiWorkstation | null>(null);
  const [shift, setShift] = useState<ApiShift | null>(null);
  // Профиль бизнеса (Раздел настроек, не из исходного ТЗ) — меняет поведение экрана "Продажа":
  // остатки/срок годности на плитках товара показываются только для Магазина/Аптеки, см.
  // ProductGrid.tsx. Ресторан — прежнее поведение, без изменений.
  const [businessType, setBusinessType] = useState<BusinessType>("RESTAURANT");
  // Не из исходного ТЗ — по прямому запросу клиента, только Магазин/Аптека: вкладка "Все" на
  // "Продаже" вместо пустого "Найдите товар" показывает список последних чеков со встроенным
  // поиском/возвратом (см. ниже, ReturnsScreen embedded) — Ресторан не затронут, там "Все"
  // по-прежнему сразу показывает все блюда.
  const showReceiptsInline = businessType === "STORE" || businessType === "PHARMACY";
  // Лимит ручной скидки кассира (Раздел 3 ТЗ: "применяет в рамках лимита") — null значит
  // использовать прежний потолок по умолчанию в ReceiptPanel.tsx, не "без ограничений".
  const [maxCashierDiscountPercent, setMaxCashierDiscountPercent] = useState<number | null>(null);
  // Кнопки быстрых сумм наличными в PaymentModal.tsx — не из исходного ТЗ, заполняет вкладку
  // "Продажа" в Настройках. Пустой массив = кнопки выключены.
  const [quickCashAmounts, setQuickCashAmounts] = useState<number[]>([]);
  // Показывать ли на кассе панель быстрого добавления расходников (посуда/пакет, не из
  // исходного ТЗ) — см. Product.isConsumable, Настройки → Продажа.
  const [showConsumablesPanel, setShowConsumablesPanel] = useState(false);
  // Порог "заканчивается" для уведомлений в шапке — не из исходного ТЗ, по прямому запросу
  // клиента. null = уведомления выключены (порог не настроен).
  const [lowStockProducts, setLowStockProducts] = useState<{ name: string; quantity: number }[]>([]);

  const [activeScreen, setActiveScreen] = useState<ScreenKey>(() => ROLE_HOME_SCREEN[loadSession()?.role ?? "CASHIER"]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [products, setProducts] = useState<CartProduct[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  // Несколько параллельно открытых чеков (по запросу клиента: касса раньше могла вести только
  // одного покупателя за раз) — tickets — это массив корзин-вкладок, activeTicketId — какая из
  // них сейчас на экране. См. Ticket в ReceiptPanel.tsx и updateActiveTicket ниже.
  const [tickets, setTickets] = useState<Ticket[]>(() => [
    { id: crypto.randomUUID(), label: "1", lines: [], discountPercent: 0 },
  ]);
  const [activeTicketId, setActiveTicketId] = useState<string>(() => tickets[0].id);
  const activeTicket = tickets.find((ticket) => ticket.id === activeTicketId) ?? tickets[0];
  const lines = activeTicket.lines;
  const discountPercent = activeTicket.discountPercent;
  const [receiptPreview, setReceiptPreview] = useState<ReceiptPreview | null>(null);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("idle");
  const [paymentErrorMessage, setPaymentErrorMessage] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<PaidReceipt | null>(null);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);
  // Не из исходного ТЗ — по прямому запросу клиента: раньше скан товара, закончившегося на
  // складе (или без цены), молча ничего не добавлял в чек — узнавали об этом только на оплате
  // (см. более раннее дополнение про серверную проверку остатка), когда чек уже пробит и это
  // теряет время. Сигнал должен быть сразу в момент скана, а не после.
  const [blockedScan, setBlockedScan] = useState<{ product: CartProduct; reason: "stock" | "price" } | null>(null);

  const [closeShiftOpen, setCloseShiftOpen] = useState(false);
  const [expectedCash, setExpectedCash] = useState(0);

  // У Кассира нет сайдбара (см. Sidebar ниже) — по прямому запросу клиента убрали левое меню
  // на экране "Продажа" и заменили нижними кнопками, которые открывают те же разделы (Товары/
  // Клиенты/Возвраты/Смены/Оборудование) поверх кассы в модальном окне, а не отдельным экраном.
  const [cashierModal, setCashierModal] = useState<"products" | "returns" | "shifts" | "equipment" | null>(null);

  // Бампится после приёмки/корректировки на экране "Склад" (WarehouseScreen), чтобы эффект ниже
  // перечитал остатки для плиток товара — сам он не знает, что где-то в другом экране склад
  // изменился, раз ни workstation, ни businessType при этом не меняются.
  const [stockVersion, setStockVersion] = useState(0);

  function handleLogout() {
    clearSession();
    setSession(null);
    setShift(null);
    setWorkstation(null);
    const id = crypto.randomUUID();
    setTickets([{ id, label: "1", lines: [], discountPercent: 0 }]);
    setActiveTicketId(id);
  }

  function handleUnauthorized() {
    handleLogout();
  }

  const loadCatalog = useCallback(async () => {
    if (!session) return;
    try {
      const [categoryList, productList] = await Promise.all([
        getCategories(session.accessToken),
        getProducts(session.accessToken),
      ]);
      setCategories(categoryList.map((c) => ({ id: c.id, name: c.name })));
      setProducts(
        productList
          .filter((p) => p.isActive)
          .map((p) => ({
            id: p.id,
            name: p.name,
            price: Number(p.price),
            unit: p.unit,
            barcode: p.barcode,
            sku: p.sku,
            categoryId: p.categoryId,
            imageUrl: p.imageUrl,
            isConsumable: p.isConsumable,
          })),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) handleUnauthorized();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    if (!session) return;
    loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    if (!session) return;
    getSaleConfig(session.accessToken)
      .then((r) => {
        setBusinessType(r.businessType);
        setMaxCashierDiscountPercent(r.maxCashierDiscountPercent);
        setQuickCashAmounts(r.quickCashAmounts);
        setShowConsumablesPanel(r.showConsumablesPanel);
      })
      .catch(() => undefined);
  }, [session]);

  const canSeeStockNotifications =
    !!session && (["ADMIN", "MANAGER", "WAREHOUSE", "ACCOUNTANT"] as Role[]).includes(session.role);

  // Уведомления об остатках (Header.tsx, колокольчик) — не из исходного ТЗ, по прямому запросу
  // клиента. Не завязано на businessType/выбранную кассу: считаем по всем точкам сразу, как и
  // "Кассы" на "Главной" (см. HomeScreen.tsx) — организации обычно с одной точкой, но не жёстко.
  useEffect(() => {
    if (!session || !canSeeStockNotifications) {
      setLowStockProducts([]);
      return;
    }
    let cancelled = false;
    getNotificationsConfig(session.accessToken)
      .then(async (config) => {
        if (cancelled || config.lowStockThreshold == null) {
          if (!cancelled) setLowStockProducts([]);
          return;
        }
        const entries = await getStockReport(session.accessToken);
        if (cancelled) return;
        setLowStockProducts(
          entries
            .filter((e) => Number(e.quantity) <= config.lowStockThreshold!)
            .map((e) => ({ name: e.product.name, quantity: Number(e.quantity) })),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, canSeeStockNotifications]);

  // Остатки нужны, только когда известна касса (без неё непонятно, остаток по какой точке
  // показывать). Раньше запрос пропускался целиком для Ресторана — обычные блюда там готовятся
  // на месте и остаток вести не нужно, это по-прежнему так (см. visibleProducts ниже). Но
  // расходники (Product.isConsumable — посуда и т.п.) есть и у Ресторана, и они ДОЛЖНЫ быть
  // реальным покупным товаром с остатком, поэтому запрос теперь идёт для всех профилей.
  useEffect(() => {
    if (!session || !workstation) return;
    let cancelled = false;
    getStockReport(session.accessToken, workstation.storeId)
      .then((entries) => {
        if (cancelled) return;
        const byProductId = new Map(entries.map((e) => [e.productId, e]));
        setProducts((prev) =>
          prev.map((p) => {
            const entry = byProductId.get(p.id);
            // Товар без записи на складе (ни разу не оприходован через "Склад") — это тот же
            // случай, что и явный ноль, а не "неизвестно": раньше stockQty оставался undefined,
            // и такой товар проходил проверку "нет в наличии" мимо и был доступен для продажи
            // (жалоба клиента "добавили товар, но не отсканировали в склад — не должен быть
            // в продаже, пока не вывели количество").
            return {
              ...p,
              stockQty: entry ? Number(entry.quantity) : 0,
              expiryDate: entry ? entry.product.expiryDate : p.expiryDate,
            };
          }),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session, workstation, products.length, stockVersion]);

  // Товар, который ни разу не оприходовали через "Склад" (или оприходовали на 0), не должен
  // появляться на "Продаже" вообще — не просто быть недоступным для клика, а не отображаться
  // в списке до тех пор, пока по нему не дали приход с реальным кол-вом (жалоба клиента:
  // "добавили товар, но не завели остаток — не должен быть в продаже"). Исключение — обычные
  // блюда Ресторана (готовятся на месте, остаток по ним принципиально не ведётся): для них
  // действует старое поведение. Но расходники (isConsumable) — покупной товар в любом
  // профиле, включая Ресторан, и обязаны пройти "Склад", как и всё остальное в Магазине/Аптеке.
  function isHiddenForNoStock(product: CartProduct): boolean {
    if (product.stockQty === undefined || product.stockQty > 0) return false;
    return businessType !== "RESTAURANT" || Boolean(product.isConsumable);
  }

  // Приём по маркировке (Настройки → Магазин, см. WarehouseScreen.tsx) может создать товар
  // с названием, но без цены — её вносят вручную по накладной позже (не из исходного ТЗ, по
  // прямому запросу клиента). Пока цена не указана, товар нельзя продать — как и с нулевым
  // остатком (isHiddenForNoStock). Актуально только для Магазина: у Ресторана/Аптеки цена
  // всегда обязательна уже при создании товара, этот сценарий для них не возникает.
  function isHiddenForNoPrice(product: CartProduct): boolean {
    return businessType === "STORE" && (!product.price || product.price <= 0);
  }

  function isProductUnsellable(product: CartProduct): boolean {
    return isHiddenForNoStock(product) || isHiddenForNoPrice(product);
  }

  const visibleProducts = useMemo(() => {
    const byCategory =
      activeCategory === "all" ? products : products.filter((product) => product.categoryId === activeCategory);
    return byCategory.filter((product) => !isProductUnsellable(product));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, activeCategory, businessType]);

  const consumableProducts = useMemo(() => products.filter((product) => product.isConsumable), [products]);

  // Предпросчёт итога с учётом авто-скидок (см. ReceiptsService.calculateTotals на сервере) —
  // кассир должен видеть тот же итог, что реально спишется при оплате. Если сети нет или запрос
  // не успел — receiptPreview остаётся null, и ReceiptPanel/PaymentModal падают на локальный
  // расчёт только по ручному % (тот же расчёт, что был здесь до авто-скидок).
  useEffect(() => {
    if (!session || lines.length === 0) {
      setReceiptPreview(null);
      return;
    }
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const preview = await previewReceipt(session.accessToken, {
          discountPercent,
          items: lines.map((line) => ({ productId: line.product.id, quantity: line.qty })),
        });
        if (!cancelled) setReceiptPreview(preview);
      } catch {
        if (!cancelled) setReceiptPreview(null);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [session, lines, discountPercent]);

  function updateActiveTicket(updater: (ticket: Ticket) => Ticket) {
    setTickets((prev) => prev.map((ticket) => (ticket.id === activeTicketId ? updater(ticket) : ticket)));
  }

  // Тот же критерий, что и isHiddenForNoStock — для Ресторана обычные блюда (не расходники)
  // остаток не ведут вообще, там ограничения по количеству нет.
  function tracksStock(product: CartProduct): boolean {
    return businessType !== "RESTAURANT" || Boolean(product.isConsumable);
  }

  // Не из исходного ТЗ — по прямому запросу клиента (скриншот: в чеке 3 шт., хотя на "Складе" в
  // тот же момент 0 pcs): isProductUnsellable проверяет только "остаток есть хоть какой-то", а
  // не "хватит ли на то количество, что уже лежит в чеке". Товар с остатком 1 шт. пропускал ПЕРВЫЙ
  // скан (1 > 0 — не заблокирован), но при повторном скане/клике "+" та же проверка снова видела
  // тот же остаток 1 шт. — она не знала, что 1 единица уже "занята" текущим чеком — и пропускала
  // ещё раз, уводя количество в чеке выше реального остатка.
  function wouldExceedStock(product: CartProduct, addQty: number): boolean {
    if (!tracksStock(product) || product.stockQty === undefined) return false;
    const inCart = lines.find((line) => line.product.id === product.id)?.qty ?? 0;
    return inCart + addQty > product.stockQty;
  }

  function addToCart(product: CartProduct) {
    // Тот же критерий, что и в visibleProducts (isProductUnsellable) — товар с нулевым/не
    // заведённым остатком или без цены нельзя продать, каким бы путём его ни пытались добавить
    // (клик по плитке, скан штрихкода или поиск в шапке — плитка обычно скрыта, но эти пути её
    // обходят).
    if (isProductUnsellable(product)) {
      return;
    }
    if (wouldExceedStock(product, 1)) {
      setBlockedScan({ product, reason: "stock" });
      return;
    }
    updateActiveTicket((ticket) => {
      const existing = ticket.lines.find((line) => line.product.id === product.id);
      const lines = existing
        ? ticket.lines.map((line) => (line.product.id === product.id ? { ...line, qty: line.qty + 1 } : line))
        : [...ticket.lines, { product, qty: 1 }];
      return { ...ticket, lines };
    });
  }

  function increment(productId: string) {
    const product = products.find((p) => p.id === productId);
    if (product && wouldExceedStock(product, 1)) {
      setBlockedScan({ product, reason: "stock" });
      return;
    }
    updateActiveTicket((ticket) => ({
      ...ticket,
      lines: ticket.lines.map((line) => (line.product.id === productId ? { ...line, qty: line.qty + 1 } : line)),
    }));
  }

  function decrement(productId: string) {
    updateActiveTicket((ticket) => ({
      ...ticket,
      lines: ticket.lines
        .map((line) => (line.product.id === productId ? { ...line, qty: line.qty - 1 } : line))
        .filter((line) => line.qty > 0),
    }));
  }

  function remove(productId: string) {
    updateActiveTicket((ticket) => ({ ...ticket, lines: ticket.lines.filter((line) => line.product.id !== productId) }));
  }

  function clear() {
    updateActiveTicket((ticket) => ({ ...ticket, lines: [], discountPercent: 0 }));
  }

  function setDiscountPercent(percent: number) {
    updateActiveTicket((ticket) => ({ ...ticket, discountPercent: percent }));
  }

  function nextTicketLabel(list: Ticket[]): string {
    const used = new Set(list.map((ticket) => Number(ticket.label)).filter((n) => !Number.isNaN(n)));
    let n = 1;
    while (used.has(n)) n++;
    return String(n);
  }

  // На кассовом тачскрине один физический тап иногда прилетает как несколько click-событий
  // подряд (дребезг сенсора) — жалоба клиента "прокликиваю, открывается много чеков". Блокируем
  // повторные вызовы на короткое окно и ограничиваем сверху общее число вкладок, чтобы один
  // "залипший" тап не наплодил десятки пустых чеков.
  const addTicketLockRef = useRef(false);
  const MAX_TICKETS = 8;

  function addTicket() {
    if (addTicketLockRef.current || tickets.length >= MAX_TICKETS) return;
    addTicketLockRef.current = true;
    window.setTimeout(() => {
      addTicketLockRef.current = false;
    }, 400);
    const id = crypto.randomUUID();
    setTickets((prev) => [...prev, { id, label: nextTicketLabel(prev), lines: [], discountPercent: 0 }]);
    setActiveTicketId(id);
  }

  function switchTicket(id: string) {
    setActiveTicketId(id);
  }

  function closeTicket(id: string) {
    if (tickets.length <= 1) return;
    const remaining = tickets.filter((ticket) => ticket.id !== id);
    setTickets(remaining);
    if (activeTicketId === id) {
      setActiveTicketId(remaining[0].id);
    }
  }

  function openPaymentModal() {
    setPaymentStatus("idle");
    setPaymentErrorMessage(null);
    setPaymentModalOpen(true);
  }

  async function confirmPayment(method: PaymentMethod, _receivedAmount: number | null, clickProvider: ClickProvider) {
    if (!session || !workstation || !shift) return;
    setPaymentStatus("processing");
    setPaymentErrorMessage(null);
    try {
      const receipt = await createReceipt(session.accessToken, {
        storeId: workstation.storeId,
        workstationId: workstation.id,
        shiftId: shift.id,
        discountPercent,
        items: lines.map((line) => ({ productId: line.product.id, quantity: line.qty })),
      });
      const paid = await payReceipt(session.accessToken, receipt.id, [
        { method: toBackendMethod(method, clickProvider), amount: Number(receipt.total) },
      ]);
      setLastReceipt({ id: paid.id, total: Number(paid.total), method });
      setPaymentModalOpen(false);
      setPaymentStatus("idle");
      // Не из исходного ТЗ — по прямому запросу клиента (скриншоты: товар с 0 pcs на "Складе"
      // всё равно пробивался сканером на "Продаже"). Причина — stockQty в products обновлялся
      // только когда сам ЗАШЁЛ на "Склад" (WarehouseScreen::onStockChanged), а после ОПЛАТЫ на
      // самой "Продаже" — никогда: остаток в товаре молча оставался старым до следующего похода
      // на "Склад". bump stockVersion — тот же триггер, что и там (см. эффект выше, зависящий
      // от stockVersion), подтягивает свежие остатки сразу после каждой продажи.
      setStockVersion((v) => v + 1);
      // Оплаченный чек не единственный открытый — закрываем его вкладку, чтобы не копились
      // пустые "Чек N" от прошлых покупателей; единственный чек просто остаётся пустым.
      if (tickets.length > 1) {
        closeTicket(activeTicketId);
      } else {
        clear();
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleUnauthorized();
        return;
      }
      // Ошибка оплаты не должна терять чек: корзина (lines) остаётся как была,
      // кассир может повторить попытку кнопкой "Повторить" в модалке (см. ТЗ, Этап 3).
      // status === 0 — сеть/сервер не ответил, а не осмысленный отказ (см. ApiError) — в этом
      // случае показываем общее сообщение в PaymentModal, а не сырую служебную строку "network".
      // Иначе — реальная причина отказа сервера (например "Недостаточно остатка на складе:
      // «Товар»", см. ReceiptsService.pay) — раньше терялась, кассир видел только "Ошибка
      // оплаты" без объяснения.
      setPaymentErrorMessage(err instanceof ApiError && err.status !== 0 ? err.message : null);
      setPaymentStatus("error");
    }
  }

  async function confirmReturn(approver: AuthSession) {
    if (!lastReceipt) return;
    await returnReceipt(approver.accessToken, lastReceipt.id);
    setLastReceipt(null);
    setReturnModalOpen(false);
    // Возврат тоже меняет остаток (увеличивает) — та же причина, что и у оплаты выше.
    setStockVersion((v) => v + 1);
  }

  async function openCloseShiftModal() {
    if (!session || !shift) return;
    try {
      const report = await getShiftReport(session.accessToken, shift.id);
      setExpectedCash(report.expectedCash);
      setCloseShiftOpen(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) handleUnauthorized();
    }
  }

  function handleCloseShift(closingCash: number) {
    if (!session || !shift) return Promise.reject(new Error("no active shift"));
    return closeShift(session.accessToken, shift.id, closingCash);
  }

  function handleCloseShiftDone() {
    setCloseShiftOpen(false);
    setShift(null);
  }

  useBarcodeScanner((code) => {
    if (activeScreen !== "sale") return;
    const product = products.find((p) => p.barcode === code);
    if (product) {
      if (isHiddenForNoStock(product)) {
        setBlockedScan({ product, reason: "stock" });
      } else if (isHiddenForNoPrice(product)) {
        setBlockedScan({ product, reason: "price" });
      } else {
        addToCart(product);
      }
    } else {
      setNotFoundCode(code);
    }
  });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (activeScreen !== "sale" || !shift || !workstation) return;
      if (e.key === "F9") {
        e.preventDefault();
        setReturnModalOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeScreen, shift, workstation]);

  if (!session) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <TitleBar />
      <UpdateNotifier />
        <div className="flex-1 overflow-hidden">
          {authMode === "register" ? (
            <RegisterScreen
              onBackToLogin={() => setAuthMode("login")}
              onDone={(organizationId, login) => {
                setPrefillOrgId(organizationId);
                setPrefillLogin(login);
                setAuthMode("login");
              }}
            />
          ) : (
            <LoginScreen
              initialOrgId={prefillOrgId}
              initialLogin={prefillLogin}
              onRegisterClick={() => setAuthMode("register")}
              onSuccess={(s) => {
                saveSession(s);
                setSession(s);
                setActiveScreen(ROLE_HOME_SCREEN[s.role]);
              }}
            />
          )}
        </div>
      </div>
    );
  }

  if ((!shift || !workstation) && SHIFT_GATED_ROLES.includes(session.role)) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <TitleBar />
      <UpdateNotifier />
        <div className="flex-1 overflow-hidden">
          <ShiftSetupScreen
            session={session}
            onReady={(readyShift, readyWorkstation) => {
              setShift(readyShift);
              setWorkstation(readyWorkstation);
            }}
            onLogout={handleLogout}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100 text-slate-900">
      <TitleBar />
      <UpdateNotifier />
      <Header
        session={session}
        workstationName={workstation?.name ?? null}
        shiftOpenedAt={shift?.openedAt ?? null}
        products={products}
        lowStockProducts={lowStockProducts}
        isProductUnavailable={isProductUnsellable}
        onSelectProduct={(product) => {
          addToCart(product);
          setActiveScreen("sale");
        }}
        onLogout={handleLogout}
        onCloseShift={openCloseShiftModal}
        className="no-print"
      />
      <div className="flex flex-1 overflow-hidden">
        {session.role !== "CASHIER" && (
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((v) => !v)}
            activeScreen={activeScreen}
            onNavigate={setActiveScreen}
            role={session.role}
            className="no-print"
          />
        )}

        {activeScreen === "home" && (
          <main className="flex-1 overflow-y-auto p-4">
            <HomeScreen session={session} />
          </main>
        )}

        {activeScreen === "sale" && (!shift || !workstation) && (
          <main className="flex-1 overflow-y-auto">
            <ShiftSetupScreen
              session={session}
              onReady={(readyShift, readyWorkstation) => {
                setShift(readyShift);
                setWorkstation(readyWorkstation);
              }}
              onLogout={handleLogout}
            />
          </main>
        )}

        {activeScreen === "sale" && shift && workstation && (
          <>
            <div className="flex flex-1 flex-col overflow-hidden">
              <main className="flex-1 space-y-4 overflow-y-auto p-4">
                {/* Не из исходного ТЗ — по прямому запросу клиента: когда у организации нет
                    других категорий, вкладки "Категории" сводятся к одинокой кнопке "Все",
                    которая ничего не переключает (только она и есть) — просто мусор на экране
                    поверх списка чеков. Показываем панель только когда есть куда переключаться. */}
                {(!showReceiptsInline || categories.length > 0) && (
                  <CategoryTabs categories={categories} active={activeCategory} onChange={setActiveCategory} />
                )}
                {showReceiptsInline && activeCategory === "all" ? (
                  <ReturnsScreen
                    session={session}
                    embedded
                    onStockChanged={() => setStockVersion((v) => v + 1)}
                  />
                ) : (
                  <ProductGrid products={visibleProducts} onAdd={addToCart} businessType={businessType} />
                )}
              </main>

              <div className="no-print flex flex-wrap gap-2.5 border-t border-slate-200 bg-white px-4 py-3">
                {/* Не из исходного ТЗ — по прямому запросу клиента: для Магазина/Аптеки поиск и
                    возврат любого чека теперь во вкладке "Все" (см. showReceiptsInline выше) —
                    эта кнопка там больше не нужна. Ресторан не затронут. */}
                {!showReceiptsInline && (
                  <button
                    onClick={() => setReturnModalOpen(true)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-3.5 text-sm font-bold text-slate-600 hover:border-accent/40 hover:text-accent"
                  >
                    <ReturnIcon width={20} height={20} />
                    {t("sale.returnAction")}
                  </button>
                )}
                <button
                  onClick={addTicket}
                  disabled={tickets.length >= MAX_TICKETS}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-3.5 text-sm font-bold text-slate-600 hover:border-accent/40 hover:text-accent disabled:opacity-30"
                >
                  <ClockIcon width={20} height={20} />
                  {t("sale.holdTicket")}
                </button>

                {session.role === "CASHIER" && (
                  <>
                    <button
                      onClick={() => setCashierModal("products")}
                      className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-3.5 text-sm font-bold text-slate-600 hover:border-accent/40 hover:text-accent"
                    >
                      <BoxIcon width={20} height={20} />
                      {t("nav.products")}
                    </button>
                    {!showReceiptsInline && (
                      <button
                        onClick={() => setCashierModal("returns")}
                        className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-3.5 text-sm font-bold text-slate-600 hover:border-accent/40 hover:text-accent"
                      >
                        <ReturnIcon width={20} height={20} />
                        {t("nav.returns")}
                      </button>
                    )}
                    <button
                      onClick={() => setCashierModal("shifts")}
                      className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-3.5 text-sm font-bold text-slate-600 hover:border-accent/40 hover:text-accent"
                    >
                      <ClockIcon width={20} height={20} />
                      {t("nav.shifts")}
                    </button>
                    <button
                      onClick={() => setCashierModal("equipment")}
                      className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-3.5 text-sm font-bold text-slate-600 hover:border-accent/40 hover:text-accent"
                    >
                      <MonitorIcon width={20} height={20} />
                      {t("nav.equipment")}
                    </button>
                  </>
                )}
              </div>
            </div>

            <ReceiptPanel
              lines={lines}
              discountPercent={discountPercent}
              preview={receiptPreview}
              maxDiscountPercent={
                session.role === "CASHIER" && maxCashierDiscountPercent != null
                  ? maxCashierDiscountPercent
                  : undefined
              }
              onDiscountChange={setDiscountPercent}
              onIncrement={increment}
              onDecrement={decrement}
              onRemove={remove}
              onClear={clear}
              onPay={openPaymentModal}
              lastReceipt={lastReceipt}
              onReturnClick={() => setReturnModalOpen(true)}
              tickets={tickets}
              activeTicketId={activeTicketId}
              onSwitchTicket={switchTicket}
              onAddTicket={addTicket}
              addTicketDisabled={tickets.length >= MAX_TICKETS}
              onCloseTicket={closeTicket}
              consumableProducts={showConsumablesPanel ? consumableProducts : []}
              onAddConsumable={addToCart}
              onDecrementConsumable={decrement}
            />
          </>
        )}

        {activeScreen === "equipment" && (
          <main className="flex-1 overflow-y-auto p-4">
            <EquipmentScreen session={session} />
          </main>
        )}

        {activeScreen === "products" && (
          <main className="flex-1 overflow-y-auto p-4">
            <ProductsScreen session={session} onCatalogChanged={loadCatalog} businessType={businessType} />
          </main>
        )}

        {activeScreen === "warehouse" && (
          <main className="flex-1 overflow-y-auto p-4">
            <WarehouseScreen session={session} onStockChanged={() => setStockVersion((v) => v + 1)} />
          </main>
        )}

        {activeScreen === "customers" && (
          <main className="flex-1 overflow-y-auto p-4">
            <CustomersScreen session={session} />
          </main>
        )}

        {activeScreen === "discounts" && (
          <main className="flex-1 overflow-y-auto p-4">
            <DiscountsScreen session={session} />
          </main>
        )}

        {activeScreen === "returns" && (
          <main className="flex-1 overflow-y-auto p-4">
            <ReturnsScreen session={session} onStockChanged={() => setStockVersion((v) => v + 1)} />
          </main>
        )}

        {activeScreen === "reports" && (
          <main className="flex-1 overflow-y-auto p-4">
            <ReportsScreen session={session} />
          </main>
        )}

        {activeScreen === "shifts" && (
          <main className="flex-1 overflow-y-auto p-4">
            <ShiftsScreen session={session} storeId={workstation?.storeId} />
          </main>
        )}

        {activeScreen === "integrations" && (
          <main className="flex-1 overflow-y-auto p-4">
            <IntegrationsScreen session={session} />
          </main>
        )}

        {activeScreen === "employees" && (
          <main className="flex-1 overflow-y-auto p-4">
            <EmployeesScreen session={session} />
          </main>
        )}

        {activeScreen === "settings" && (
          <main className="flex-1 overflow-y-auto p-4">
            <SettingsScreen session={session} />
          </main>
        )}
      </div>

      {paymentModalOpen && (
        <PaymentModal
          total={receiptPreview?.total ?? computeTotals(lines, discountPercent).total}
          status={paymentStatus}
          errorMessage={paymentErrorMessage}
          quickCashAmounts={quickCashAmounts}
          onClose={() => setPaymentModalOpen(false)}
          onConfirm={confirmPayment}
        />
      )}

      {returnModalOpen && (
        <ReturnConfirmModal
          organizationId={session.organizationId}
          onClose={() => setReturnModalOpen(false)}
          onConfirm={confirmReturn}
        />
      )}

      {notFoundCode && (
        <ProductNotFoundModal code={notFoundCode} onClose={() => setNotFoundCode(null)} />
      )}

      {blockedScan && (
        <ScanBlockedModal
          productName={blockedScan.product.name}
          reason={blockedScan.reason}
          onClose={() => setBlockedScan(null)}
        />
      )}

      {closeShiftOpen && (
        <CloseShiftModal
          expectedCash={expectedCash}
          onClose={() => setCloseShiftOpen(false)}
          onConfirm={handleCloseShift}
          onDone={handleCloseShiftDone}
        />
      )}

      {cashierModal === "products" && (
        <Modal title={t("nav.products")} onClose={() => setCashierModal(null)}>
          <ProductsScreen session={session} onCatalogChanged={loadCatalog} businessType={businessType} />
        </Modal>
      )}
      {cashierModal === "returns" && (
        <Modal title={t("nav.returns")} onClose={() => setCashierModal(null)}>
          <ReturnsScreen session={session} onStockChanged={() => setStockVersion((v) => v + 1)} />
        </Modal>
      )}
      {cashierModal === "shifts" && (
        <Modal title={t("nav.shifts")} onClose={() => setCashierModal(null)}>
          <ShiftsScreen session={session} storeId={workstation?.storeId} />
        </Modal>
      )}
      {cashierModal === "equipment" && (
        <Modal title={t("nav.equipment")} onClose={() => setCashierModal(null)}>
          <EquipmentScreen session={session} workstationId={workstation?.id ?? null} />
        </Modal>
      )}
    </div>
  );
}

export default App;
