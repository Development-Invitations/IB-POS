export type Role = "CASHIER" | "MANAGER" | "WAREHOUSE" | "ADMIN" | "ACCOUNTANT";

export interface AuthSession {
  accessToken: string;
  userId: string;
  organizationId: string;
  role: Role;
  login: string;
}
