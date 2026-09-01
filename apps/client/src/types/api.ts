// Формы данных, которые реально возвращает apps/server (см. prisma/schema.prisma).
// Decimal-поля (цены, суммы, количества) Prisma сериализует в JSON строками, а не числами.

import type { Role } from "./auth";

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
  imageUrl: string | null;
  isActive: boolean;
  expiryDate: string | null;
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
  fiscalShiftNumber: string | null;
  zReportNumber: string | null;
}

export type CashMovementType = "DEPOSIT" | "WITHDRAWAL";

export interface ApiCashMovement {
  id: string;
  shiftId: string;
  userId: string;
  type: CashMovementType;
  amount: string;
  comment: string | null;
  createdAt: string;
}

export type ReceiptStatus = "OPEN" | "PAID" | "RETURNED" | "VOID";

export interface ApiReceiptItem {
  id: string;
  productId: string;
  quantity: string;
  price: string;
  // Не из исходного ТЗ — накопительно, сколько по этой позиции уже возвращено (возврат
  // отдельных позиций чека, см. ReceiptsService.returnReceipt на сервере).
  returnedQuantity: string;
  // Заполняется только у GET /receipts/:id (findOne) — список/поиск чеков это не подтягивает.
  product?: { name: string; unit: string };
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
  customer?: { id: string; fullName: string; phone: string | null } | null;
}

export interface ApiCustomer {
  id: string;
  fullName: string;
  phone: string | null;
  bonusBalance: string;
}

export type DiscountType = "PERCENT" | "FIXED";

export interface ApiDiscount {
  id: string;
  name: string;
  type: DiscountType;
  value: string;
  productId: string | null;
  categoryId: string | null;
  minRole: Role;
  isActive: boolean;
}

export type EquipmentKind =
  | "FISCAL_REGISTRAR"
  | "CASH_DRAWER"
  | "CUSTOMER_DISPLAY"
  | "PAYMENT_TERMINAL"
  | "BARCODE_SCANNER"
  | "OTHER";

export interface ApiEquipment {
  id: string;
  kind: EquipmentKind;
  label: string;
  description: string | null;
  imageUrl: string | null;
  connectionInfo: string | null;
  isConnected: boolean;
  isActive: boolean;
  createdAt: string;
}

// getDashboard считает суммы через Number() на бэкенде (не Decimal-объекты Prisma),
// поэтому в отличие от ApiProduct/ApiReceipt эти поля реально приходят числами.
export interface DashboardChange {
  totalSales: number | null;
  receiptsCount: number | null;
  averageCheck: number | null;
  profit: number | null;
}

export interface DashboardReport {
  period: { from: string; to: string };
  totalSales: number;
  receiptsCount: number;
  averageCheck: number;
  profit: number;
  profitDataIncomplete: boolean;
  salesByHour: { hour: number; total: number }[];
  changeVsPrevious: DashboardChange;
}

export interface TopProduct {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  revenue: number;
}

export interface StaffReportRow {
  userId: string;
  fullName: string;
  login: string;
  receiptsCount: number;
  salesTotal: number;
  averageCheck: number;
}

export interface ApiCashMovementWithUser extends ApiCashMovement {
  user: { fullName: string };
}

export interface FinanceReport {
  paymentsByMethod: Partial<Record<BackendPaymentMethod, number>>;
  deposits: number;
  withdrawals: number;
  cashMovements: ApiCashMovementWithUser[];
}

export interface ApiStockEntry {
  id: string;
  storeId: string;
  productId: string;
  quantity: string;
  product: ApiProduct;
  store: ApiStore;
}

export type FiscalProviderName = "REGOS" | "EPOS" | "SMARTPOS" | "ARCAGROUP" | "RAHMATPOS";

export interface ApiIntegration {
  provider: FiscalProviderName;
  isConnected: boolean;
  config: Record<string, unknown> | null;
  updatedAt: string | null;
}

export interface AdapterActionResult {
  success: boolean;
  message?: string;
}

export interface OneCStatus {
  isConnected: boolean;
  login: string | null;
  exchangePath: string;
  updatedAt: string | null;
}

export interface OneCCredentials {
  login: string;
  token: string;
  exchangePath: string;
}

export type BusinessType = "RESTAURANT" | "STORE" | "PHARMACY";

export interface ApiSettings {
  name: string;
  currency: string;
  defaultLanguage: string;
  taxRatePercent: string | null;
  autoBackupEnabled: boolean;
  businessType: BusinessType;
  maxCashierDiscountPercent: number | null;
  lowStockThreshold: number | null;
  quickCashAmounts: number[];
  warnings: string[];
}

export type BackupTrigger = "MANUAL" | "AUTO";

export interface ApiBackup {
  id: string;
  trigger: BackupTrigger;
  sizeBytes: number;
  createdAt: string;
}

export interface ApiUser {
  id: string;
  fullName: string;
  login: string;
  role: Role;
  isActive: boolean;
  salary: string | null;
  createdAt: string;
}

export interface ApiAuditLog {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; fullName: string; login: string } | null;
}
