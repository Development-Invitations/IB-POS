import { useTranslation } from "react-i18next";
import { formatSum } from "../lib/format";
import type { CartProduct } from "../types/catalog";
import { PlusIcon } from "./icons";

interface ProductGridProps {
  products: CartProduct[];
  onAdd: (product: CartProduct) => void;
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

export function ProductGrid({ products, onAdd }: ProductGridProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => (
        <button
          key={product.id}
          onClick={() => onAdd(product)}
          className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md active:translate-y-0"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-50 text-sm font-bold text-slate-500">
            {initials(product.name)}
          </span>
          <span className="text-sm font-semibold text-slate-800">{product.name}</span>
          <span className="text-xs text-slate-400">{product.unit}</span>
          <span className="mt-auto text-sm font-bold text-slate-900">
            {formatSum(product.price)} {t("common.currency")}
          </span>
        </button>
      ))}

      <button className="flex min-h-[168px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 transition hover:border-accent/40 hover:text-accent">
        <PlusIcon />
        <span className="text-sm font-medium">{t("product.addProduct")}</span>
      </button>
    </div>
  );
}
