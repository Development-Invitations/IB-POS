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
  BusinessType,
  CashMovementType,
  DashboardReport,
  DiscountType,
  EquipmentKind,
  FinanceReport,
  InvoiceExtractionResult,
  OneCCredentials,
  OneCStatus,
  ReceiptStatus,
  ReceivingMode,
  StaffReportRow,
  TopProduct,
} from "../types/api";
import type { Role } from "../types/auth";
import { loadApiBase } from "./server-config";

// Не из исходного ТЗ — по прямому запросу клиента: раньше адрес сервера был вшит в сборку
// (VITE_API_URL) и не менялся без пересборки. Теперь берётся из localStorage (см.
// server-config.ts, экран "Подключение к серверу"), с тем же дефолтом, если ещё не настроен.
// После смены адреса приложение перезагружается целиком (см. ServerConnectionScreen.tsx) —
// этого достаточно, чтобы подхватить новое значение здесь, отдельный сеттер не нужен.
export const API_BASE = loadApiBase();

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

export interface BarcodeLookupItem {
  mxikCode: string;
  name: string;
  unit?: string;
}

export interface BarcodeLookupResult {
  found: boolean;
  items: BarcodeLookupItem[];
  // Когда items пуст — ближайшие похожие варианты (штрихкод НЕ совпадает точно, только
  // визуально похож), на подтверждение приёмщиком, см. WarehouseScreen.tsx.
  suggestions: BarcodeLookupItem[];
}

// Госкаталог tasnif.soliq.uz (не из исходного ТЗ) — автозаполнение названия товара по
// штрихкоду при приёмке на "Склад", см. WarehouseScreen.tsx.
export function lookupBarcode(token: string, barcode: string) {
  return request<BarcodeLookupResult>(`/products/lookup-barcode/${encodeURIComponent(barcode)}`, {}, token);
}

export interface ProductPayload {
  name: string;
  categoryId?: string;
  sku?: string;
  barcode?: string;
  // Сервер требует число (может быть 0 — @Min(0)). 0 значит "цена ещё не указана" — так создаёт
  // товар приём по маркировке (см. WarehouseScreen.tsx, Настройки → Магазин →
  // OrganizationSettings.receivingMode), цену вносят позже по накладной. Во всех остальных путях
  // создания форма на клиенте (ProductFormModal.tsx) как и раньше не пускает дальше без цены > 0.
  price: number;
  cost?: number;
  unit?: string;
  expiryDate?: string;
  isConsumable?: boolean;
  mxikCode?: string;
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

// Настоящее удаление (не деактивация) — необратимо, сервер сам откажет, если по товару есть
// история продаж (ReceiptItem), см. ProductsService.purge().
export function purgeProduct(token: string, id: string) {
  return request<void>(`/products/${id}/purge`, { method: "DELETE" }, token);
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

export function getShifts(token: string, storeId?: string) {
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
  return request<ApiShift[]>(`/shifts${qs}`, {}, token);
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

export function getReceipt(token: string, receiptId: string) {
  return request<ApiReceipt>(`/receipts/${receiptId}`, {}, token);
}

export interface ReturnReceiptResult extends ApiReceipt {
  refundAmount: number;
}

// items не передан — возвращает весь ещё не возвращённый остаток по каждой позиции (весь чек
// целиком, если он ещё не был возвращён частично) — прежнее поведение для быстрого возврата
// последнего чека на экране «Продажа» (см. ReturnConfirmModal.tsx/App.tsx).
export function returnReceipt(
  token: string,
  receiptId: string,
  items?: { receiptItemId: string; quantity: number }[],
) {
  return request<ReturnReceiptResult>(
    `/receipts/${receiptId}/return`,
    { method: "POST", body: JSON.stringify(items ? { items } : {}) },
    token,
  );
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

// Не из исходного ТЗ — по прямому запросу клиента: без workstationId — весь реестр организации
// (Админ/Управляющий на общем экране "Оборудование"). С workstationId — только оборудование
// этой кассы + общее — раньше кассир на любой кассе видел оборудование вообще всех касс сразу.
export function getEquipment(token: string, workstationId?: string) {
  const query = workstationId ? `?workstationId=${encodeURIComponent(workstationId)}` : "";
  return request<ApiEquipment[]>(`/equipment${query}`, {}, token);
}

export interface EquipmentPayload {
  workstationId?: string | null;
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

// StockService.applyMovement() отдаёт "голую" строку Stock (upsert без include) — без
// вложенных product/store, в отличие от ApiStockEntry, который приходит из /reports/stock.
export interface ApiStockRow {
  id: string;
  storeId: string;
  productId: string;
  quantity: string;
}

export interface ReceiveStockPayload {
  storeId: string;
  productId: string;
  quantity: number;
  comment?: string;
  // Не из исходного ТЗ — по прямому запросу клиента: коды маркировки, отсканированные при
  // приёмке в режиме "Приём по штрихкоду и маркировке", см. WarehouseScreen.tsx.
  markingCodes?: string[];
}

export function receiveStock(token: string, payload: ReceiveStockPayload) {
  return request<ApiStockRow>(
    "/stock/receive",
    { method: "POST", body: JSON.stringify(payload) },
    token,
  );
}

export interface AdjustStockPayload {
  storeId: string;
  productId: string;
  newQuantity: number;
  reason?: string;
}

export function adjustStock(token: string, payload: AdjustStockPayload) {
  return request<ApiStockRow>(
    "/stock/adjust",
    { method: "POST", body: JSON.stringify(payload) },
    token,
  );
}

export interface ApiStockMovement {
  id: string;
  type: "RECEIPT_IN" | "ADJUSTMENT" | "SALE" | "RETURN";
  quantityDelta: string;
  comment: string | null;
  markingCodes: string[];
  createdAt: string;
  stock: { productId: string };
}

// Не из исходного ТЗ — по прямому запросу клиента: узнать, какие коды маркировки уже записаны
// за товаром (см. WarehouseScreen.tsx — "Корректировка" в режиме приёма по маркировке должна
// пропускать уже известные коды и добавлять только новые, а не просто менять число остатка; без
// productId — все движения по точке разом, чтобы показать статус маркировки сразу по всем
// товарам в "Остатках", не дёргая эндпоинт на каждую строку отдельно).
export function getStockMovements(token: string, storeId: string, productId?: string) {
  const params = new URLSearchParams({ storeId });
  if (productId) params.set("productId", productId);
  return request<ApiStockMovement[]>(`/stock/movements?${params.toString()}`, {}, token);
}

export interface ApiProductMarking {
  productId: string;
  code: string;
  // Не из исходного ТЗ — по прямому запросу клиента: null — товар ещё в наличии ("активная"
  // маркировка), заполнено — товар продан ("проданная", хранится до ручной очистки кеша, чтобы
  // при возврате можно было вернуть именно этот код, см. StockService.restoreMarkings).
  consumedAt: string | null;
}

// Не из исходного ТЗ — по прямому запросу клиента: маркировка расходуется вместе с остатком при
// продаже (без сканирования на кассе — это сделал бы продажу медленнее), поэтому бейдж/попап в
// "Остатках" и защита от повторного скана при приёмке используют этот эндпоинт вместо истории
// движений — тот отдаёт ВСЕ когда-либо принятые коды без учёта того, что часть уже продана.
export function getMarkings(token: string, storeId: string) {
  return request<ApiProductMarking[]>(`/stock/markings?storeId=${encodeURIComponent(storeId)}`, {}, token);
}

export interface ClearMarkingCacheResult {
  cleared: number;
}

// Не из исходного ТЗ — по прямому запросу клиента: "1 файл активных маркировок который не
// чистится, 2 файл маркировок товаров которые проданы который можно чистить" — удаляет ТОЛЬКО
// уже проданные коды (активные, ещё в наличии, сервер не трогает никогда), см.
// StockService.clearMarkingCache.
export function clearMarkingCache(token: string) {
  return request<ClearMarkingCacheResult>("/stock/markings/clear-cache", { method: "POST" }, token);
}

export function getTopProducts(token: string, filter: PeriodFilter) {
  return request<TopProduct[]>(`/reports/top-products${periodQuery(filter)}`, {}, token);
}

export function getStaffReport(token: string, filter: PeriodFilter) {
  return request<StaffReportRow[]>(`/reports/staff${periodQuery(filter)}`, {}, token);
}

export function getFinanceReport(token: string, filter: PeriodFilter) {
  return request<FinanceReport>(`/reports/finance${periodQuery(filter)}`, {}, token);
}

export function getIntegrations(token: string) {
  return request<ApiIntegration[]>("/integrations", {}, token);
}

export function connectIntegration(token: string, provider: string, config: Record<string, string>) {
  return request<AdapterActionResult>(
    `/integrations/${provider}/connect`,
    { method: "POST", body: JSON.stringify({ config }) },
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

// Не из исходного ТЗ — по прямому запросу клиента: чтение накладной (фото/PDF/Excel) через Groq
// (console.groq.com — облачный, но бесплатный тариф + быстрый инференс + vision для фото). Как и
// uploadProductImage — минуя JSON-обёртку request(), т.к. это multipart. Таймаут с запасом (обычный
// облачный ответ занимает секунды), но оставлен повыше на случай большой накладной или задержек сети.
export async function extractInvoiceItems(token: string, file: Blob, filename: string) {
  const form = new FormData();
  form.append("file", file, filename);
  const res = await fetch(`${API_BASE}/ai/invoice/extract`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(120000),
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
  return (await res.json()) as InvoiceExtractionResult;
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
  businessType?: BusinessType;
  maxCashierDiscountPercent?: number | null;
  lowStockThreshold?: number | null;
  quickCashAmounts?: number[];
  showConsumablesPanel?: boolean;
  receivingMode?: ReceivingMode;
}

export function updateSettings(token: string, payload: UpdateSettingsPayload) {
  return request<ApiSettings>("/settings", { method: "PATCH", body: JSON.stringify(payload) }, token);
}

export interface ClearHistoryResult {
  receiptsDeleted: number;
  shiftsDeleted: number;
  outboxDeleted: number;
}

// Не из исходного ТЗ — по прямому запросу клиента: очистка тестовых чеков/смен, накопленных
// при настройке, чтобы после можно было свободно удалять товары без блокировки по внешнему
// ключу (см. SettingsService.clearHistory на сервере). Необратимо.
export function clearHistory(token: string) {
  return request<ClearHistoryResult>("/settings/clear-history", { method: "POST" }, token);
}

// Доступно всем ролям (не только Админу, как остальные /settings) — экран "Продажа" должен
// знать профиль бизнеса, лимит скидки кассира и быстрые суммы наличными независимо от того,
// кто за кассой.
export function getSaleConfig(token: string) {
  return request<{
    businessType: BusinessType;
    maxCashierDiscountPercent: number | null;
    quickCashAmounts: number[];
    showConsumablesPanel: boolean;
  }>("/settings/sale-config", {}, token);
}

// Доступно ролям с доступом к остаткам (Раздел 3: Админ/Управляющий/Зав.складом/Бухгалтер) —
// порог "заканчивается" для уведомлений в шапке (Header.tsx).
export function getNotificationsConfig(token: string) {
  return request<{ lowStockThreshold: number | null }>("/settings/notifications-config", {}, token);
}

// Доступно ролям, управляющим "Складом" (Админ/Управляющий/Зав.складом) — способ приёмки и
// профиль бизнеса, не открывая остальные настройки, см. WarehouseScreen.tsx.
export function getWarehouseConfig(token: string) {
  return request<{ receivingMode: ReceivingMode; businessType: BusinessType }>(
    "/settings/warehouse-config",
    {},
    token,
  );
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
  payload: Partial<Omit<UserPayload, "login">> & { isActive?: boolean; salary?: number },
) {
  return request<ApiUser>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) }, token);
}

export function getAuditLog(token: string, userId?: string) {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return request<ApiAuditLog[]>(`/audit-log${qs}`, {}, token);
}
