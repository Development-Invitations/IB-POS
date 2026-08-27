export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

// Реальная проверка доступности backend (не имитация): используется на шаге оплаты,
// чтобы честно продемонстрировать поведение "ошибка/офлайн не теряет чек" из ТЗ.
// Полное сохранение через POST /receipts подключим вместе с логином кассира в клиенте.
export async function checkApiHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
