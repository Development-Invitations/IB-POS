import { useTranslation } from "react-i18next";
import { API_BASE } from "../lib/api";
import { formatSum } from "../lib/format";
import { loadShowProductImages } from "../lib/preferences";
import type { CartProduct } from "../types/catalog";
import type { BusinessType } from "../types/api";

interface ProductGridProps {
  products: CartProduct[];
  onAdd: (product: CartProduct) => void;
  // Ресторан не показывает остатки/срок годности на плитке — там позиции готовятся на месте,
  // а не продаются со склада поштучно (см. App.tsx, откуда приходит businessType).
  businessType?: BusinessType;
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

const EXPIRY_WARNING_DAYS = 30;

export function ProductGrid({ products, onAdd, businessType }: ProductGridProps) {
  const { t } = useTranslation();
  const showImages = loadShowProductImages();
  const showStockInfo = businessType && businessType !== "RESTAURANT";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => {
        const expiryDays =
          showStockInfo && product.expiryDate
            ? Math.ceil((new Date(product.expiryDate).getTime() - Date.now()) / 86400000)
            : null;

        return (
          <button
            key={product.id}
            onClick={() => onAdd(product)}
            className="relative flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md active:translate-y-0"
          >
            {showStockInfo && product.stockQty !== undefined && (
              <span
                className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  product.stockQty > 0
                    ? "bg-slate-100 text-slate-500"
                    : "bg-red-50 text-red-600"
                }`}
              >
                {product.stockQty > 0
                  ? t("products.stockQty", { qty: product.stockQty, unit: product.unit })
                  : t("products.outOfStock")}
              </span>
            )}

            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50 text-sm font-bold text-slate-500">
              {showImages && product.imageUrl ? (
                <img src={`${API_BASE}${product.imageUrl}`} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(product.name)
              )}
            </span>
            <span className="text-sm font-semibold text-slate-800">{product.name}</span>
            <span className="text-xs text-slate-400">{product.unit}</span>

            {expiryDays !== null && expiryDays <= EXPIRY_WARNING_DAYS && (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  expiryDays < 0 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
                }`}
              >
                {expiryDays < 0
                  ? t("products.expired")
                  : t("products.expiresSoon", { date: new Date(product.expiryDate!).toLocaleDateString("ru-RU") })}
              </span>
            )}

            <span className="mt-auto text-sm font-bold text-slate-900">
              {formatSum(product.price)} {t("common.currency")}
            </span>
          </button>
        );
      })}
    </div>
  );
}
