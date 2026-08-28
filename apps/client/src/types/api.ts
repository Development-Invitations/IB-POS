// Формы данных, которые реально возвращает apps/server (см. prisma/schema.prisma).
// Decimal-поля (цены, суммы, количества) Prisma сериализует в JSON строками, а не числами.

export interface ApiCategory {
  id: string;
  name: string;
  parentId: string | null;
}

export interface ApiProduct {
  id: string;
  categoryId: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  cost: string | null;
  unit: string;
  isActive: boolean;
}

export interface ApiStore {
  id: string;
  name: string;
  address: string | null;
}

export interface ApiWorkstation {
  id: string;
  storeId: string;
  name: string;
}

export type ShiftStatus = "OPEN" | "CLOSED";

export interface ApiShift {
  id: string;
  storeId: string;
  workstationId: string;
  userId: string;
  status: ShiftStatus;
  openedAt: string;
  closedAt: string | null;
  openingCash: string;
  closingCash: string | null;
}

export type ReceiptStatus = "OPEN" | "PAID" | "RETURNED" | "VOID";

export interface ApiReceiptItem {
  id: string;
  productId: string;
  quantity: string;
  price: string;
}

export type BackendPaymentMethod = "CASH" | "CARD" | "CLICK" | "PAYME" | "QR" | "MIXED";

export interface ApiPayment {
  id: string;
  method: BackendPaymentMethod;
  amount: string;
  createdAt: string;
}

export interface ApiReceipt {
  id: string;
  storeId: string;
  workstationId: string;
  shiftId: string;
  status: ReceiptStatus;
  total: string;
  discountTotal: string;
  createdAt: string;
  items: ApiReceiptItem[];
  payments?: ApiPayment[];
}

export interface ApiCustomer {
  id: string;
  fullName: string;
  phone: string | null;
  bonusBalance: string;
}
