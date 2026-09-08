import { useEffect, useRef } from "react";

// USB-сканеры штрихкодов в режиме "клавиатурного эмулятора" (keyboard wedge) —
// самый распространённый тип, не требует драйверов и отдельного протокола через
// Device Agent: сканер просто "печатает" код очень быстро и завершает Enter'ом.
// Отличаем скан от обычного набора текста по интервалу между нажатиями.
const MAX_INTERVAL_MS = 60;
const MIN_BARCODE_LENGTH = 4;

// Штрихкод/маркировка — всегда латиница и цифры, а сканер физически "нажимает" те же клавиши,
// что нажал бы человек на английской раскладке. Но раньше буфер собирался из `e.key` — а это
// СИМВОЛ, который браузер подставляет по ТЕКУЩЕЙ раскладке ОС, а не физическая клавиша. Если на
// компьютере активна русская раскладка, `e.key` для той же самой физической клавиши возвращает
// кириллицу (жалоба клиента: "записывает на русском код маркировки", и как следствие — один и
// тот же физический скан двух одинаковых маркировок иногда расходился в кириллице по-разному,
// из-за чего проверка на дубликат не срабатывала: "сканировали одну и ту же маркировку 2-3 раза
// и он вносит как уникальную"). Правильный источник — `e.code`: физическая клавиша, не зависит
// от раскладки ОС ("KeyA" — всегда буква на месте A/Ф независимо от языка ввода). Ниже — карта
// физическая клавиша → символ на английской раскладке, с учётом Shift.
const KEY_MAP: Record<string, [string, string]> = {
  Digit0: ["0", ")"],
  Digit1: ["1", "!"],
  Digit2: ["2", "@"],
  Digit3: ["3", "#"],
  Digit4: ["4", "$"],
  Digit5: ["5", "%"],
  Digit6: ["6", "^"],
  Digit7: ["7", "&"],
  Digit8: ["8", "*"],
  Digit9: ["9", "("],
  Minus: ["-", "_"],
  Equal: ["=", "+"],
  BracketLeft: ["[", "{"],
  BracketRight: ["]", "}"],
  Semicolon: [";", ":"],
  Quote: ["'", '"'],
  Backquote: ["`", "~"],
  Backslash: ["\\", "|"],
  Comma: [",", "<"],
  Period: [".", ">"],
  Slash: ["/", "?"],
  Space: [" ", " "],
};
for (let i = 0; i < 26; i++) {
  const letter = String.fromCharCode(97 + i);
  KEY_MAP[`Key${letter.toUpperCase()}`] = [letter, letter.toUpperCase()];
}

// Не всякая клавиатура/сканер даёт различимый e.code (виртуальные раскладки, эмуляторы) —
// тогда используем e.key как раньше, лучше поймать хоть что-то в латинице/цифрах, чем ничего.
function resolveChar(e: KeyboardEvent): string | null {
  const mapped = KEY_MAP[e.code];
  if (mapped) return e.shiftKey ? mapped[1] : mapped[0];
  if (e.key.length === 1) return e.key;
  return null;
}

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

      const char = resolveChar(e);
      if (char === null) return;

      bufferRef.current = elapsed > MAX_INTERVAL_MS ? char : bufferRef.current + char;
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
