// Товар в UI кассы — приведённая к числам проекция ApiProduct (см. types/api.ts),
// где Decimal-поля backend возвращает строками.
export interface CartProduct {
  id: string;
  name: string;
  price: number;
  unit: string;
  barcode: string | null;
  categoryId: string | null;
}
