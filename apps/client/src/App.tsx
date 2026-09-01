import { useCallback, useEffect, useMemo, useState } from "react";
import { TitleBar } from "./components/TitleBar";
import { HomeScreen } from "./components/HomeScreen";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { CategoryTabs } from "./components/CategoryTabs";
import { ProductGrid } from "./components/ProductGrid";
import { ReceiptPanel, type CartLine, type PaidReceipt } from "./components/ReceiptPanel";
import { PaymentModal, type PaymentStatus, type ClickProvider } from "./components/PaymentModal";
import { ReturnConfirmModal } from "./components/ReturnConfirmModal";
import { ProductNotFoundModal } from "./components/ProductNotFoundModal";
import { EquipmentScreen } from "./components/EquipmentScreen";
import { ProductsScreen } from "./components/ProductsScreen";
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
  // Лимит ручной скидки кассира (Раздел 3 ТЗ: "применяет в рамках лимита") — null значит
  // использовать прежний потолок по умолчанию в ReceiptPanel.tsx, не "без ограничений".
  const [maxCashierDiscountPercent, setMaxCashierDiscountPercent] = useState<number | null>(null);
  // Порог "заканчивается" для уведомлений в шапке — не из исходного ТЗ, по прямому запросу
  // клиента. null = уведомления выключены (порог не настроен).
  const [lowStockProducts, setLowStockProducts] = useState<{ name: string; quantity: number }[]>([]);

  const [activeScreen, setActiveScreen] = useState<ScreenKey>(() => ROLE_HOME_SCREEN[loadSession()?.role ?? "CASHIER"]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [products, setProducts] = useState<CartProduct[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [receiptPreview, setReceiptPreview] = useState<ReceiptPreview | null>(null);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("idle");
  const [lastReceipt, setLastReceipt] = useState<PaidReceipt | null>(null);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);

  const [closeShiftOpen, setCloseShiftOpen] = useState(false);
  const [expectedCash, setExpectedCash] = useState(0);

  function handleLogout() {
    clearSession();
    setSession(null);
    setShift(null);
    setWorkstation(null);
    setLines([]);
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
            categoryId: p.categoryId,
            imageUrl: p.imageUrl,
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

  // Остатки на плитках товара — только для Магазина/Аптеки (см. businessType выше) и только
  // когда известна касса (без неё непонятно, остаток по какой точке показывать). Ресторан не
  // тратит лишний запрос — товары там не привязаны к конечным остаткам так строго.
  useEffect(() => {
    if (!session || !workstation || businessType === "RESTAURANT") return;
    let cancelled = false;
    getStockReport(session.accessToken, workstation.storeId)
      .then((entries) => {
        if (cancelled) return;
        const byProductId = new Map(entries.map((e) => [e.productId, e]));
        setProducts((prev) =>
          prev.map((p) => {
            const entry = byProductId.get(p.id);
            return entry
              ? { ...p, stockQty: Number(entry.quantity), expiryDate: entry.product.expiryDate }
              : p;
          }),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session, workstation, businessType, products.length]);

  const visibleProducts = useMemo(
    () =>
      activeCategory === "all"
        ? products
        : products.filter((product) => product.categoryId === activeCategory),
    [products, activeCategory],
  );

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

  function addToCart(product: CartProduct) {
    setLines((prev) => {
      const existing = prev.find((line) => line.product.id === product.id);
      if (existing) {
        return prev.map((line) => (line.product.id === product.id ? { ...line, qty: line.qty + 1 } : line));
      }
      return [...prev, { product, qty: 1 }];
    });
  }

  function increment(productId: string) {
    setLines((prev) => prev.map((line) => (line.product.id === productId ? { ...line, qty: line.qty + 1 } : line)));
  }

  function decrement(productId: string) {
    setLines((prev) =>
      prev
        .map((line) => (line.product.id === productId ? { ...line, qty: line.qty - 1 } : line))
        .filter((line) => line.qty > 0),
    );
  }

  function remove(productId: string) {
    setLines((prev) => prev.filter((line) => line.product.id !== productId));
  }

  function clear() {
    setLines([]);
    setDiscountPercent(0);
  }

  function openPaymentModal() {
    setPaymentStatus("idle");
    setPaymentModalOpen(true);
  }

  async function confirmPayment(method: PaymentMethod, _receivedAmount: number | null, clickProvider: ClickProvider) {
    if (!session || !workstation || !shift) return;
    setPaymentStatus("processing");
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
      clear();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleUnauthorized();
        return;
      }
      // Ошибка оплаты не должна терять чек: корзина (lines) остаётся как была,
      // кассир может повторить попытку кнопкой "Повторить" в модалке (см. ТЗ, Этап 3).
      setPaymentStatus("error");
    }
  }

  async function confirmReturn(approver: AuthSession) {
    if (!lastReceipt) return;
    await returnReceipt(approver.accessToken, lastReceipt.id);
    setLastReceipt(null);
    setReturnModalOpen(false);
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
      addToCart(product);
    } else {
      setNotFoundCode(code);
    }
  });

  if (!session) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <TitleBar />
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
      <Header
        session={session}
        workstationName={workstation?.name ?? null}
        shiftOpenedAt={shift?.openedAt ?? null}
        products={products}
        lowStockProducts={lowStockProducts}
        onSelectProduct={(product) => {
          addToCart(product);
          setActiveScreen("sale");
        }}
        onLogout={handleLogout}
        onCloseShift={openCloseShiftModal}
        className="no-print"
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((v) => !v)}
          activeScreen={activeScreen}
          onNavigate={setActiveScreen}
          role={session.role}
          className="no-print"
        />

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
            <main className="flex-1 space-y-4 overflow-y-auto p-4">
              <CategoryTabs categories={categories} active={activeCategory} onChange={setActiveCategory} />
              <ProductGrid products={visibleProducts} onAdd={addToCart} businessType={businessType} />
            </main>

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
            <ReturnsScreen session={session} />
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

      {closeShiftOpen && (
        <CloseShiftModal
          expectedCash={expectedCash}
          onClose={() => setCloseShiftOpen(false)}
          onConfirm={handleCloseShift}
          onDone={handleCloseShiftDone}
        />
      )}
    </div>
  );
}

export default App;
