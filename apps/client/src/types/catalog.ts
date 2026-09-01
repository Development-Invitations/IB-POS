// Товар в UI кассы — приведённая к числам проекция ApiProduct (см. types/api.ts),
// где Decimal-поля backend возвращает строками.
export interface CartProduct {
  id: string;
  name: string;
  price: number;
  unit: string;
  barcode: string | null;
  categoryId: string | null;
  imageUrl: string | null;
  // Заполняются только для профилей "Магазин"/"Аптека" (см. BusinessType, App.tsx loadCatalog) —
  // Ресторану остатки/срок годности на плитке товара не нужны, там позиции готовятся на месте.
  stockQty?: number;
  expiryDate?: string | null;
}
