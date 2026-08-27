import { useEffect, useRef } from "react";

// USB-сканеры штрихкодов в режиме "клавиатурного эмулятора" (keyboard wedge) —
// самый распространённый тип, не требует драйверов и отдельного протокола через
// Device Agent: сканер просто "печатает" код очень быстро и завершает Enter'ом.
// Отличаем скан от обычного набора текста по интервалу между нажатиями.
const MAX_INTERVAL_MS = 60;
const MIN_BARCODE_LENGTH = 4;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

export function useBarcodeScanner(onScan: (barcode: string) => void) {
  const bufferRef = useRef("");
  const lastTimeRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;

      const now = performance.now();
      const elapsed = now - lastTimeRef.current;
      lastTimeRef.current = now;

      if (e.key === "Enter") {
        const code = bufferRef.current;
        bufferRef.current = "";
        if (code.length >= MIN_BARCODE_LENGTH) {
          onScanRef.current(code);
        }
        return;
      }

      if (e.key.length !== 1) return;

      bufferRef.current = elapsed > MAX_INTERVAL_MS ? e.key : bufferRef.current + e.key;
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
