import { useMemo, useState } from "react";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { CategoryTabs } from "./components/CategoryTabs";
import { ProductGrid } from "./components/ProductGrid";
import { ReceiptPanel, type CartLine } from "./components/ReceiptPanel";
import { DEMO_PRODUCTS, type CategoryId, type CatalogProduct } from "./data/catalog";
import "./App.css";

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryId>("all");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);

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

  function pay() {
    // Этап 3: модальное окно оплаты (наличные/карта/Click/Payme/QR/смешанная).
    clear();
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100 text-slate-900">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((v) => !v)} />

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
          onPay={pay}
        />
      </div>
    </div>
  );
}

export default App;
