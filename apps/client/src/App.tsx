import { useCallback, useEffect, useMemo, useState } from "react";
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
import { LoginScreen } from "./components/LoginScreen";
import { RegisterScreen } from "./components/RegisterScreen";
import { ShiftSetupScreen } from "./components/ShiftSetupScreen";
import { CloseShiftModal } from "./components/CloseShiftModal";
import {
  ApiError,
  closeShift,
  createReceipt,
  getCategories,
  getProducts,
  getShiftReport,
  payReceipt,
  returnReceipt,
} from "./lib/api";
import { computeTotals } from "./lib/cart";
import { useBarcodeScanner } from "./lib/use-barcode-scanner";
import { clearSession, loadSession, saveSession } from "./lib/session";
import type { CartProduct } from "./types/catalog";
import type { PaymentMethod } from "./types/payment";
import type { ScreenKey } from "./types/screen";
import type { AuthSession } from "./types/auth";
import type { ApiShift, ApiWorkstation, BackendPaymentMethod } from "./types/api";
import "./App.css";

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

  const [activeScreen, setActiveScreen] = useState<ScreenKey>("sale");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [products, setProducts] = useState<CartProduct[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("idle");
  const [lastReceipt, setLastReceipt] = useState<PaidReceipt | null>(null);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);

  const [closeShiftOpen, setCloseShiftOpen] = useState(false);
  const [expectedCash, setExpectedCash] = useState(0);
  const [closeShiftSubmitting, setCloseShiftSubmitting] = useState(false);
  const [closeShiftError, setCloseShiftError] = useState<string | null>(null);

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
          })),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) handleUnauthorized();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    if (!session || !shift) return;
    loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, shift]);

  const visibleProducts = useMemo(
    () =>
      activeCategory === "all"
        ? products
        : products.filter((product) => product.categoryId === activeCategory),
    [products, activeCategory],
  );

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
    setCloseShiftError(null);
    try {
      const report = await getShiftReport(session.accessToken, shift.id);
      setExpectedCash(report.expectedCash);
      setCloseShiftOpen(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) handleUnauthorized();
    }
  }

  async function handleCloseShift(closingCash: number) {
    if (!session || !shift) return;
    setCloseShiftSubmitting(true);
    setCloseShiftError(null);
    try {
      await closeShift(session.accessToken, shift.id, closingCash);
      setCloseShiftOpen(false);
      setShift(null);
    } catch (err) {
      setCloseShiftError(err instanceof ApiError ? err.message : "error");
    } finally {
      setCloseShiftSubmitting(false);
    }
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
    if (authMode === "register") {
      return (
        <RegisterScreen
          onBackToLogin={() => setAuthMode("login")}
          onDone={(organizationId, login) => {
            setPrefillOrgId(organizationId);
            setPrefillLogin(login);
            setAuthMode("login");
          }}
        />
      );
    }
    return (
      <LoginScreen
        initialOrgId={prefillOrgId}
        initialLogin={prefillLogin}
        onRegisterClick={() => setAuthMode("register")}
        onSuccess={(s) => {
          saveSession(s);
          setSession(s);
        }}
      />
    );
  }

  if (!shift || !workstation) {
    return (
      <ShiftSetupScreen
        session={session}
        onReady={(readyShift, readyWorkstation) => {
          setShift(readyShift);
          setWorkstation(readyWorkstation);
        }}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100 text-slate-900">
      <Header
        session={session}
        workstationName={workstation.name}
        shiftOpenedAt={shift.openedAt}
        onLogout={handleLogout}
        onCloseShift={openCloseShiftModal}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((v) => !v)}
          activeScreen={activeScreen}
          onNavigate={setActiveScreen}
        />

        {activeScreen === "sale" && (
          <>
            <main className="flex-1 space-y-4 overflow-y-auto p-4">
              <CategoryTabs categories={categories} active={activeCategory} onChange={setActiveCategory} />
              <ProductGrid products={visibleProducts} onAdd={addToCart} />
            </main>

            <ReceiptPanel
              lines={lines}
              discountPercent={discountPercent}
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
          <main className="flex-1 overflow-y-auto p-6">
            <EquipmentScreen />
          </main>
        )}

        {activeScreen === "products" && (
          <main className="flex-1 overflow-y-auto p-6">
            <ProductsScreen session={session} onCatalogChanged={loadCatalog} />
          </main>
        )}

        {activeScreen === "customers" && (
          <main className="flex-1 overflow-y-auto p-6">
            <CustomersScreen session={session} />
          </main>
        )}
      </div>

      {paymentModalOpen && (
        <PaymentModal
          total={computeTotals(lines, discountPercent).total}
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
          submitting={closeShiftSubmitting}
          error={closeShiftError}
          onClose={() => setCloseShiftOpen(false)}
          onConfirm={handleCloseShift}
        />
      )}
    </div>
  );
}

export default App;
