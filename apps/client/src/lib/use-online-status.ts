import { useEffect, useState } from "react";
import { checkApiHealth } from "./api";

// Реальный опрос /health (не имитация) — индикатор "Онлайн"/"Офлайн" в хедере
// должен честно отражать доступность backend, а не быть статичной декорацией.
export function useOnlineStatus(intervalMs = 15000): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const ok = await checkApiHealth();
      if (!cancelled) setOnline(ok);
    }
    check();
    const id = setInterval(check, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return online;
}
