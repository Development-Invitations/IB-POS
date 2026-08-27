// Кассовый терминал: блокируем случайную перезагрузку (потеря текущего чека),
// открытие DevTools и правый клик — как с клавиатуры, так и через контекстное меню.

const BLOCKED_KEYS = new Set(["F5", "F12"]);

function isReloadOrDevtoolsShortcut(e: KeyboardEvent): boolean {
  if (BLOCKED_KEYS.has(e.key)) return true;

  const ctrlOrCmd = e.ctrlKey || e.metaKey;
  if (!ctrlOrCmd) return false;

  // Ctrl/Cmd+R, Ctrl/Cmd+Shift+R — reload
  if (e.key.toLowerCase() === "r") return true;
  // Ctrl/Cmd+U — view source
  if (e.key.toLowerCase() === "u") return true;
  // Ctrl/Cmd+Shift+I/J/C — devtools panels
  if (e.shiftKey && ["i", "j", "c"].includes(e.key.toLowerCase())) return true;

  return false;
}

export function installKioskGuards() {
  window.addEventListener("keydown", (e) => {
    if (isReloadOrDevtoolsShortcut(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  window.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });
}
