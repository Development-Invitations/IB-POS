// Протокол обмена между Device Agent (apps/device-agent) и клиентом (apps/client)
// по WebSocket ws://127.0.0.1:8765. Общий контракт, чтобы обе стороны не расходились.

export type DeviceKind = "fiscal_registrar" | "cash_drawer" | "customer_display" | "payment_terminal";

export interface DeviceStatusInfo {
  kind: DeviceKind;
  label: string;
  connected: boolean;
  detail?: string;
}

export type AgentRequest =
  | { type: "status" }
  | { type: "test"; device: DeviceKind }
  | { type: "drawer.open" }
  | { type: "display.show"; text: string };

export type AgentResponse =
  | { type: "hello"; agent: string; version: string }
  | { type: "status"; devices: DeviceStatusInfo[] }
  | { type: "test.result"; device: DeviceKind; success: boolean; message?: string }
  | { type: "error"; message: string };
