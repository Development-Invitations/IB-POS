import { WebSocketServer, type WebSocket } from "ws";
import type { AgentRequest, AgentResponse, DeviceKind } from "@ib-pos/shared";
import {
  MockFiscalRegistrarDriver,
  MockCashDrawerDriver,
  MockCustomerDisplayDriver,
  MockPaymentTerminalDriver,
  type DeviceDriver,
} from "./drivers.js";

const PORT = 8765;

const drivers: Record<DeviceKind, DeviceDriver> = {
  fiscal_registrar: new MockFiscalRegistrarDriver(),
  cash_drawer: new MockCashDrawerDriver(),
  customer_display: new MockCustomerDisplayDriver(),
  payment_terminal: new MockPaymentTerminalDriver(),
};

function send(socket: WebSocket, message: AgentResponse) {
  socket.send(JSON.stringify(message));
}

function statusOf(kind: DeviceKind) {
  return drivers[kind].status();
}

async function handleRequest(socket: WebSocket, request: AgentRequest) {
  switch (request.type) {
    case "status": {
      const devices = Object.keys(drivers).map((kind) => statusOf(kind as DeviceKind));
      send(socket, { type: "status", devices });
      return;
    }

    case "test": {
      const driver = drivers[request.device];
      const result = await driver.test();
      send(socket, { type: "test.result", device: request.device, success: result.success, message: result.message });
      return;
    }

    case "drawer.open": {
      const result = await (drivers.cash_drawer as MockCashDrawerDriver).openDrawer();
      send(socket, { type: "test.result", device: "cash_drawer", success: result.success, message: result.message });
      return;
    }

    case "display.show": {
      const result = await (drivers.customer_display as MockCustomerDisplayDriver).show(request.text);
      send(socket, {
        type: "test.result",
        device: "customer_display",
        success: result.success,
        message: result.message,
      });
      return;
    }
  }
}

const wss = new WebSocketServer({ port: PORT, host: "127.0.0.1" });

wss.on("connection", (socket) => {
  send(socket, { type: "hello", agent: "ib-pos-device-agent", version: "0.1.0" });

  socket.on("message", async (raw) => {
    try {
      const request = JSON.parse(raw.toString()) as AgentRequest;
      await handleRequest(socket, request);
    } catch {
      send(socket, { type: "error", message: "Некорректный запрос" });
    }
  });
});

console.log(`[device-agent] listening on ws://127.0.0.1:${PORT}`);
