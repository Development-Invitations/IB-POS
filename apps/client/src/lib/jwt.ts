// Только чтение claims для отображения в UI (роль/логин/касса) — подпись не проверяется,
// т.к. реальная авторизация всё равно выполняется backend'ом на каждом запросе.
export function decodeJwtPayload<T>(token: string): T | null {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder("utf-8").decode(bytes);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
