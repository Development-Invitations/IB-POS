// Подключение к серверу (не из исходного ТЗ — по прямому запросу клиента): раньше адрес
// сервера (API_BASE) был вшит в сборку через VITE_API_URL и не менялся без пересборки
// приложения. Теперь его можно указать прямо в приложении — на экране входа (для первой
// настройки новой кассы, когда войти ещё не во что) и в Настройках (для админа, который уже
// вошёл). Два режима — не более чем подсказка, что вводить: адрес компьютера-сервера в той же
// локальной сети/Wi-Fi, либо полный адрес удалённого сервера в интернете.
const API_BASE_KEY = "ibpos.apiBase";
const CONNECTION_MODE_KEY = "ibpos.connectionMode";

export type ConnectionMode = "local" | "internet";

const BUILT_IN_DEFAULT = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export function loadApiBase(): string {
  return localStorage.getItem(API_BASE_KEY) ?? BUILT_IN_DEFAULT;
}

export function loadConnectionMode(): ConnectionMode {
  const stored = localStorage.getItem(CONNECTION_MODE_KEY);
  return stored === "internet" ? "internet" : "local";
}

// Пользователь может ввести голый адрес без протокола/порта ("192.168.1.50" или
// "api.mybiz.uz") — достраиваем до полного URL, чтобы не заставлять его помнить синтаксис.
export function normalizeServerAddress(mode: ConnectionMode, raw: string): string {
  let value = raw.trim().replace(/\/+$/, "");
  if (!value) return value;
  if (!/^https?:\/\//i.test(value)) {
    value = mode === "internet" ? `https://${value}` : `http://${value}`;
  }
  if (mode === "local" && !/:\d+$/.test(value)) {
    value = `${value}:3000`;
  }
  return value;
}

export function saveServerConnection(mode: ConnectionMode, address: string) {
  const normalized = normalizeServerAddress(mode, address);
  localStorage.setItem(CONNECTION_MODE_KEY, mode);
  localStorage.setItem(API_BASE_KEY, normalized);
  return normalized;
}
