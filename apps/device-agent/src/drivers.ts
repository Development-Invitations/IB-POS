import type { DeviceKind, DeviceStatusInfo } from "@ib-pos/shared";

export interface TestResult {
  success: boolean;
  message?: string;
}

export interface DeviceDriver {
  kind: DeviceKind;
  label: string;
  status(): DeviceStatusInfo;
  test(): Promise<TestResult>;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Реальный SDK/протокол конкретной модели фискального регистратора клиента ещё не выбран
// (см. ТЗ Этап 4 — "первый провод под конкретную модель клиента"). До тех пор — заглушка,
// которая честно эмулирует поведение, чтобы можно было разрабатывать и тестировать UI
// "Оборудование" и не блокироваться на отсутствии физического устройства.
export class MockFiscalRegistrarDriver implements DeviceDriver {
  kind: DeviceKind = "fiscal_registrar";
  label = "Фискальный регистратор";

  status(): DeviceStatusInfo {
    return { kind: this.kind, label: this.label, connected: true, detail: "Симуляция (SDK не подключён)" };
  }

  async test(): Promise<TestResult> {
    await delay(600);
    return { success: true, message: "Тестовый чек напечатан (симуляция)" };
  }
}

export class MockCashDrawerDriver implements DeviceDriver {
  kind: DeviceKind = "cash_drawer";
  label = "Денежный ящик";
  private open = false;

  status(): DeviceStatusInfo {
    return { kind: this.kind, label: this.label, connected: true, detail: this.open ? "Открыт" : "Закрыт" };
  }

  async openDrawer(): Promise<TestResult> {
    await delay(200);
    this.open = true;
    return { success: true, message: "Ящик открыт (симуляция)" };
  }

  async test(): Promise<TestResult> {
    return this.openDrawer();
  }
}

export class MockCustomerDisplayDriver implements DeviceDriver {
  kind: DeviceKind = "customer_display";
  label = "Дисплей покупателя";
  private lastText = "";

  status(): DeviceStatusInfo {
    return { kind: this.kind, label: this.label, connected: true, detail: this.lastText || "Симуляция" };
  }

  async show(text: string): Promise<TestResult> {
    await delay(100);
    this.lastText = text;
    return { success: true };
  }

  async test(): Promise<TestResult> {
    return this.show("IB-POS — добро пожаловать");
  }
}

export class MockPaymentTerminalDriver implements DeviceDriver {
  kind: DeviceKind = "payment_terminal";
  label = "Терминал оплаты";

  status(): DeviceStatusInfo {
    return { kind: this.kind, label: this.label, connected: true, detail: "Симуляция (SDK не подключён)" };
  }

  async test(): Promise<TestResult> {
    await delay(500);
    return { success: true, message: "Связь с терминалом установлена (симуляция)" };
  }
}
