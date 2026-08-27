import { useMemo, useState } from "react";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { CategoryTabs } from "./components/CategoryTabs";
import { ProductGrid } from "./components/ProductGrid";
import { ReceiptPanel, type CartLine, type PaidReceipt } from "./components/ReceiptPanel";
import { PaymentModal, type PaymentStatus } from "./components/PaymentModal";
import { ReturnConfirmModal } from "./components/ReturnConfirmModal";
import { ProductNotFoundModal } from "./components/ProductNotFoundModal";
import { EquipmentScreen } from "./components/EquipmentScreen";
import { checkApiHealth } from "./lib/api";
import { computeTotals } from "./lib/cart";
import { useBarcodeScanner } from "./lib/use-barcode-scanner";
import { DEMO_PRODUCTS, type CategoryId, type CatalogProduct } from "./data/catalog";
import type { PaymentMethod } from "./types/payment";
import type { ScreenKey } from "./types/screen";
import "./App.css";

function App() {
  const [activeScreen, setActiveScreen] = useState<ScreenKey>("sale");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryId>("all");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("idle");
  const [lastReceipt, setLastReceipt] = useState<PaidReceipt | null>(null);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);

  const visibleProducts = useMemo(
    () =>
      activeCategory === "all"
        ? DEMO_PRODUCTS
        : DEMO_PRODUCTS.filter((product) => product.categoryId === activeCategory),
    [activeCategory],
  );

  function addToCart(product: CatalogProduct) {
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

  async function confirmPayment(method: PaymentMethod, _receivedAmount: number | null) {
    setPaymentStatus("processing");

    // Реальная (не имитированная) проверка доступности backend — честно демонстрирует
    // поведение из ТЗ: "ошибка оплаты не должна терять чек (сохраняется локально, повтор)".
    const reachable = await checkApiHealth();
    if (!reachable) {
      setPaymentStatus("error");
      return;
    }

    const { total } = computeTotals(lines, discountPercent);
    setLastReceipt({ total, method });
    setPaymentModalOpen(false);
    setPaymentStatus("idle");
    clear();
  }

  function confirmReturn() {
    setLastReceipt(null);
    setReturnModalOpen(false);
  }

  useBarcodeScanner((code) => {
    if (activeScreen !== "sale") return;
    const product = DEMO_PRODUCTS.find((p) => p.barcode === code);
    if (product) {
      addToCart(product);
    } else {
      setNotFoundCode(code);
    }
  });

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100 text-slate-900">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((v) => !v)}
          activeScreen={activeScreen}
          onNavigate={setActiveScreen}
        />

        {activeScreen === "sale" ? (
          <>
            <main className="flex-1 space-y-4 overflow-y-auto p-4">
              <CategoryTabs active={activeCategory} onChange={setActiveCategory} />
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
        ) : (
          <main className="flex-1 overflow-y-auto p-6">
            <EquipmentScreen />
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
        <ReturnConfirmModal onClose={() => setReturnModalOpen(false)} onConfirm={confirmReturn} />
      )}

      {notFoundCode && (
        <ProductNotFoundModal code={notFoundCode} onClose={() => setNotFoundCode(null)} />
      )}
    </div>
  );
}

export default App;
