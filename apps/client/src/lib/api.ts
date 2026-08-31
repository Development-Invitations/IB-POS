import type {
  AdapterActionResult,
  ApiAuditLog,
  ApiBackup,
  ApiCashMovement,
  ApiCategory,
  ApiCustomer,
  ApiDiscount,
  ApiEquipment,
  ApiIntegration,
  ApiProduct,
  ApiReceipt,
  ApiSettings,
  ApiShift,
  ApiStockEntry,
  ApiStore,
  ApiUser,
  ApiWorkstation,
  BackendPaymentMethod,
  CashMovementType,
  DashboardReport,
  DiscountType,
  EquipmentKind,
  OneCCredentials,
  OneCStatus,
  ReceiptStatus,
  TopProduct,
} from "../types/api";
import type { Role } from "../types/auth";

export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  // status 0 значит запрос вообще не дошёл до сервера (сеть/таймаут) — используется, чтобы
  // честно отличить "нет соединения" от реальной ошибки, которую вернул backend.
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

interface RequestBody {
  message?: string | string[];
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ApiError("network", 0);
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as RequestBody;
      message = Array.isArray(body.message)
        ? body.message.join("; ")
        : (body.message ?? message);
    } catch {
      // тело ответа не JSON — оставляем statusText
    }
    throw new ApiError(message, res.status);
  }

  // Не полагаемся только на статус 204 — некоторые эндпоинты (например DELETE
  // /products/:id, /discounts/:id) отвечают 200 с пустым телом, и res.json() на пустой
  // строке бросает SyntaxError. Без этой проверки та ошибка тихо проглатывалась вызывающим
  // кодом (catch {}), и деактивация "зависала" на клиенте, хотя на сервере уже прошла.
  const text = await res.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface RegisterOrganizationPayload {
  name: string;
  admin: { fullName: string; login: string; password: string };
}

export function registerOrganization(payload: RegisterOrganizationPayload) {
  return request<{ id: string }>("/organizations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function login(organizationId: string, login: string, password: string) {
  return request<{ accessToken: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ organizationId, login, password }),
  });
}

export function loginPin(organizationId: string, login: string, pin: string) {
  return request<{ accessToken: string }>("/auth/login-pin", {
    method: "POST",
    body: JSON.stringify({ organizationId, login, pin }),
  });
}

export function getCategories(token: string) {
  return request<ApiCategory[]>("/categories", {}, token);
}

export function createCategory(token: string, name: string, parentId?: string) {
  return request<ApiCategory>(
    "/categories",
    { method: "POST", body: JSON.stringify({ name, parentId }) },
    token,
  );
}

export function getProducts(token: string) {
  return request<ApiProduct[]>("/products", {}, token);
}

export interface ProductPayload {
  name: string;
  categoryId?: string;
  sku?: string;
  barcode?: string;
  price: number;
  cost?: number;
  unit?: string;
}

export function createProduct(token: string, payload: ProductPayload) {
  return request<ApiProduct>(
    "/products",
    { method: "POST", body: JSON.stringify(payload) },
    token,
  );
}

export function updateProduct(token: string, id: string, payload: Partial<ProductPayload> & { isActive?: boolean }) {
  return request<ApiProduct>(
    `/products/${id}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    token,
  );
}

export function deactivateProduct(token: string, id: string) {
  return request<void>(`/products/${id}`, { method: "DELETE" }, token);
}

// Multipart — не через общий request(), у него JSON Content-Type всегда выставлен явно,
// а тут его должен проставить сам браузер вместе с boundary.
export async function uploadProductImage(token: string, id: string, file: Blob, filename: string) {
  const form = new FormData();
  form.append("file", file, filename);
  const res = await fetch(`${API_BASE}/products/${id}/image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      message = Array.isArray(body.message) ? body.message.join("; ") : (body.message ?? message);
    } catch {
      // тело не JSON — оставляем statusText
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as ApiProduct;
}

export function getStores(token: string) {
  return request<ApiStore[]>("/stores", {}, token);
}

export function getWorkstations(token: string) {
  return request<ApiWorkstation[]>("/workstations", {}, token);
}

export function getShifts(token: string, storeId: string) {
  return request<ApiShift[]>(`/shifts?storeId=${encodeURIComponent(storeId)}`, {}, token);
}

export function openShift(
  token: string,
  storeId: string,
  workstationId: string,
  openingCash: number,
) {
  return request<ApiShift>(
    "/shifts/open",
    { method: "POST", body: JSON.stringify({ storeId, workstationId, openingCash }) },
    token,
  );
}

export interface ShiftReport {
  shift: ApiShift;
  receiptsCount: number;
  salesTotal: number;
  paymentsByMethod: Partial<Record<BackendPaymentMethod, number>>;
  cashMovements: ApiCashMovement[];
  deposits: number;
  withdrawals: number;
  expectedCash: number;
}

export function getShiftReport(token: string, shiftId: string) {
  return request<ShiftReport>(`/shifts/${shiftId}/report`, {}, token);
}

export function createCashMovement(
  token: string,
  shiftId: string,
  type: CashMovementType,
  amount: number,
  comment?: string,
) {
  return request<ApiCashMovement>(
    `/shifts/${shiftId}/cash-movements`,
    { method: "POST", body: JSON.stringify({ type, amount, comment }) },
    token,
  );
}

export function closeShift(token: string, shiftId: string, closingCash: number) {
  return request<ApiShift>(
    `/shifts/${shiftId}/close`,
    { method: "POST", body: JSON.stringify({ closingCash }) },
    token,
  );
}

export interface CreateReceiptPayload {
  storeId: string;
  workstationId: string;
  shiftId: string;
  discountPercent?: number;
  items: { productId: string; quantity: number }[];
}

export function createReceipt(token: string, payload: CreateReceiptPayload) {
  return request<ApiReceipt>(
    "/receipts",
    { method: "POST", body: JSON.stringify(payload) },
    token,
  );
}

export interface ReceiptPreview {
  subtotal: number;
  autoDiscountTotal: number;
  manualDiscountAmount: number;
  discountTotal: number;
  total: number;
}

export function previewReceipt(
  token: string,
  payload: { discountPercent?: number; items: { productId: string; quantity: number }[] },
) {
  return request<ReceiptPreview>(
    "/receipts/preview",
    { method: "POST", body: JSON.stringify(payload) },
    token,
  );
}

export function payReceipt(
  token: string,
  receiptId: string,
  payments: { method: BackendPaymentMethod; amount: number }[],
) {
  return request<ApiReceipt>(
    `/receipts/${receiptId}/pay`,
    { method: "POST", body: JSON.stringify({ payments }) },
    token,
  );
}

export function returnReceipt(token: string, receiptId: string) {
  return request<ApiReceipt>(`/receipts/${receiptId}/return`, { method: "POST" }, token);
}

export interface ReceiptsFilter {
  storeId?: string;
  status?: ReceiptStatus;
  from?: string;
  to?: string;
  search?: string;
}

export function getReceipts(token: string, filter: ReceiptsFilter) {
  const params = new URLSearchParams();
  if (filter.storeId) params.set("storeId", filter.storeId);
  if (filter.status) params.set("status", filter.status);
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
  if (filter.search) params.set("search", filter.search);
  const qs = params.toString();
  return request<ApiReceipt[]>(`/receipts${qs ? `?${qs}` : ""}`, {}, token);
}

export function getCustomers(token: string, search?: string) {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  return request<ApiCustomer[]>(`/customers${query}`, {}, token);
}

export interface CustomerPayload {
  fullName: string;
  phone?: string;
}

export function createCustomer(token: string, payload: CustomerPayload) {
  return request<ApiCustomer>(
    "/customers",
    { method: "POST", body: JSON.stringify(payload) },
    token,
  );
}

export function updateCustomer(token: string, id: string, payload: Partial<CustomerPayload>) {
  return request<ApiCustomer>(
    `/customers/${id}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    token,
  );
}

export function adjustCustomerBonus(token: string, id: string, delta: number, comment?: string) {
  return request<ApiCustomer>(
    `/customers/${id}/bonus`,
    { method: "POST", body: JSON.stringify({ delta, comment }) },
    token,
  );
}

export function getCustomerPurchaseHistory(token: string, id: string) {
  return request<ApiReceipt[]>(`/customers/${id}/receipts`, {}, token);
}

export function getDiscounts(token: string) {
  return request<ApiDiscount[]>("/discounts", {}, token);
}

export interface DiscountPayload {
  name: string;
  type: DiscountType;
  value: number;
  productId?: string;
  categoryId?: string;
  minRole?: Role;
}

export function createDiscount(token: string, payload: DiscountPayload) {
  return request<ApiDiscount>(
    "/discounts",
    { method: "POST", body: JSON.stringify(payload) },
    token,
  );
}

export function updateDiscount(
  token: string,
  id: string,
  payload: Partial<DiscountPayload> & { isActive?: boolean },
) {
  return request<ApiDiscount>(
    `/discounts/${id}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    token,
  );
}

export function deactivateDiscount(token: string, id: string) {
  return request<void>(`/discounts/${id}`, { method: "DELETE" }, token);
}

export function getEquipment(token: string) {
  return request<ApiEquipment[]>("/equipment", {}, token);
}

export interface EquipmentPayload {
  kind: EquipmentKind;
  label: string;
  description?: string;
  connectionInfo?: string;
}

export function createEquipment(token: string, payload: EquipmentPayload) {
  return request<ApiEquipment>(
    "/equipment",
    { method: "POST", body: JSON.stringify(payload) },
    token,
  );
}

export function updateEquipment(
  token: string,
  id: string,
  payload: Partial<EquipmentPayload> & { isActive?: boolean; isConnected?: boolean },
) {
  return request<ApiEquipment>(
    `/equipment/${id}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    token,
  );
}

export function deactivateEquipment(token: string, id: string) {
  return request<void>(`/equipment/${id}`, { method: "DELETE" }, token);
}

export async function uploadEquipmentImage(token: string, id: string, file: Blob, filename: string) {
  const form = new FormData();
  form.append("file", file, filename);
  const res = await fetch(`${API_BASE}/equipment/${id}/image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      message = Array.isArray(body.message) ? body.message.join("; ") : (body.message ?? message);
    } catch {
      // тело не JSON — оставляем statusText
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as ApiEquipment;
}

export interface EquipmentConnectionTestResult {
  equipment: ApiEquipment;
  reachable: boolean;
  message: string;
}

export function testEquipmentConnection(token: string, id: string) {
  return request<EquipmentConnectionTestResult>(
    `/equipment/${id}/test-connection`,
    { method: "POST" },
    token,
  );
}

export interface PeriodFilter {
  from?: string;
  to?: string;
  storeId?: string;
}

function periodQuery(filter: PeriodFilter): string {
  const params = new URLSearchParams();
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
  if (filter.storeId) params.set("storeId", filter.storeId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function getDashboard(token: string, filter: PeriodFilter) {
  return request<DashboardReport>(`/reports/dashboard${periodQuery(filter)}`, {}, token);
}

// CSV — не JSON, поэтому не через общий request(): нужен сырой текст ответа.
export async function getReportsCsv(token: string, filter: PeriodFilter): Promise<string> {
  const res = await fetch(`${API_BASE}/reports/export${periodQuery(filter)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new ApiError(res.statusText, res.status);
  }
  return res.text();
}

// Тот же экспорт каталога, что backend умел с Этапа 7 — просто раньше не было кнопки в клиенте.
export async function getProductsCsv(token: string): Promise<string> {
  const res = await fetch(`${API_BASE}/products/export`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new ApiError(res.statusText, res.status);
  }
  return res.text();
}

export function getStockReport(token: string, storeId?: string) {
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
  return request<ApiStockEntry[]>(`/reports/stock${qs}`, {}, token);
}

export function getTopProducts(token: string, filter: PeriodFilter) {
  return request<TopProduct[]>(`/reports/top-products${periodQuery(filter)}`, {}, token);
}

export function getIntegrations(token: string) {
  return request<ApiIntegration[]>("/integrations", {}, token);
}

export function connectIntegration(token: string, provider: string, login: string, providerToken: string) {
  return request<AdapterActionResult>(
    `/integrations/${provider}/connect`,
    { method: "POST", body: JSON.stringify({ config: { login, token: providerToken } }) },
    token,
  );
}

export function testIntegration(token: string, provider: string) {
  return request<AdapterActionResult>(`/integrations/${provider}/test`, { method: "POST" }, token);
}

export function runFiscalizationQueue(token: string) {
  return request<{ processed: number }>("/integrations/fiscalize/run", { method: "POST" }, token);
}

export function getOneCStatus(token: string) {
  return request<OneCStatus>("/integrations/onec", {}, token);
}

export function configureOneC(token: string) {
  return request<OneCCredentials>("/integrations/onec/configure", { method: "POST", body: JSON.stringify({}) }, token);
}

export function getSettings(token: string) {
  return request<ApiSettings>("/settings", {}, token);
}

export interface UpdateSettingsPayload {
  name?: string;
  currency?: string;
  defaultLanguage?: string;
  taxRatePercent?: number;
  autoBackupEnabled?: boolean;
}

export function updateSettings(token: string, payload: UpdateSettingsPayload) {
  return request<ApiSettings>("/settings", { method: "PATCH", body: JSON.stringify(payload) }, token);
}

export function getBackups(token: string) {
  return request<ApiBackup[]>("/backups", {}, token);
}

export function runBackup(token: string) {
  return request<ApiBackup>("/backups/run", { method: "POST" }, token);
}

// JSON-снимок, не через общий request() — нужен сырой текст ответа для скачивания файлом.
export async function downloadBackup(token: string, id: string): Promise<string> {
  const res = await fetch(`${API_BASE}/backups/${id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new ApiError(res.statusText, res.status);
  }
  return res.text();
}

export function getUsers(token: string) {
  return request<ApiUser[]>("/users", {}, token);
}

export interface UserPayload {
  fullName: string;
  login: string;
  role: Role;
  pin?: string;
  password?: string;
}

export function createUser(token: string, payload: UserPayload) {
  return request<ApiUser>("/users", { method: "POST", body: JSON.stringify(payload) }, token);
}

export function updateUser(
  token: string,
  id: string,
  payload: Partial<Omit<UserPayload, "login">> & { isActive?: boolean },
) {
  return request<ApiUser>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) }, token);
}

export function getAuditLog(token: string, userId?: string) {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return request<ApiAuditLog[]>(`/audit-log${qs}`, {}, token);
}
