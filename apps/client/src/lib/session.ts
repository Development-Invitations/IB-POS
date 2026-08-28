import { decodeJwtPayload } from "./jwt";
import type { AuthSession, Role } from "../types/auth";

const SESSION_KEY = "ibpos.session";
const WORKSTATION_KEY = "ibpos.workstation";
const LAST_ORG_KEY = "ibpos.lastOrgId";
const LAST_LOGIN_KEY = "ibpos.lastLogin";

interface JwtClaims {
  sub: string;
  organizationId: string;
  role: Role;
  login: string;
}

export function sessionFromToken(accessToken: string): AuthSession | null {
  const claims = decodeJwtPayload<JwtClaims>(accessToken);
  if (!claims) return null;
  return {
    accessToken,
    userId: claims.sub,
    organizationId: claims.organizationId,
    role: claims.role,
    login: claims.login,
  };
}

export function saveSession(session: AuthSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadSession(): AuthSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// Привязка кассы к устройству — сознательно хранится отдельно от сессии кассира:
// физическая касса не меняется между сменами разных кассиров на одном моноблоке.
export interface WorkstationSelection {
  storeId: string;
  workstationId: string;
}

export function saveWorkstation(selection: WorkstationSelection) {
  localStorage.setItem(WORKSTATION_KEY, JSON.stringify(selection));
}

export function loadWorkstation(): WorkstationSelection | null {
  const raw = localStorage.getItem(WORKSTATION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WorkstationSelection;
  } catch {
    return null;
  }
}

export function clearWorkstation() {
  localStorage.removeItem(WORKSTATION_KEY);
}

// Кассир не должен перепечатывать ID организации на каждом входе — сохраняем
// последний использованный, но не используем как секрет (это не пароль).
export function saveLastOrgId(organizationId: string) {
  localStorage.setItem(LAST_ORG_KEY, organizationId);
}

export function loadLastOrgId(): string {
  return localStorage.getItem(LAST_ORG_KEY) ?? "";
}

// Логин тоже запоминаем (не пароль — его нигде не храним) — тот же кассир обычно
// входит с одного и того же моноблока много раз подряд за смену.
export function saveLastLogin(login: string) {
  localStorage.setItem(LAST_LOGIN_KEY, login);
}

export function loadLastLogin(): string {
  return localStorage.getItem(LAST_LOGIN_KEY) ?? "";
}
