import { useEffect } from "react";

// Не из исходного ТЗ — по прямому запросу клиента: все модальные окна должны закрываться по
// Esc, так же как и кликом по фону вне окна (см. onClick={onClose} на обёртке fixed inset-0 в
// каждом модальном компоненте). Общий хук вместо копипасты одного и того же useEffect в ~20
// модалках.
export function useEscapeClose(onClose: () => void) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
}
