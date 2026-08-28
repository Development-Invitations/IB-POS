import type {
  ApiCategory,
  ApiProduct,
  ApiReceipt,
  ApiShift,
  ApiStore,
  ApiWorkstation,
  BackendPaymentMethod,
} from "../types/api";

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

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
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

export function getProducts(token: string) {
  return request<ApiProduct[]>("/products", {}, token);
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
  expectedCash: number;
}

export function getShiftReport(token: string, shiftId: string) {
  return request<ShiftReport>(`/shifts/${shiftId}/report`, {}, token);
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
