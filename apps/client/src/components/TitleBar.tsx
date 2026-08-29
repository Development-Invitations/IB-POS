import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import logo from "../assets/logo-mark.png";

// Безрамочное окно (decorations: false в tauri.conf.json) — эта полоса заменяет системную
// шапку Windows целиком внутри веб-контента, чтобы модалки/оверлеи (position: fixed) могли
// реально перекрывать всё окно, включая область заголовка — раньше системную шапку ОС
// перекрыть CSS-оверлеем было физически невозможно.
const appWindow = getCurrentWindow();

export function TitleBar() {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    appWindow.isMaximized().then(setMaximized);
    appWindow.onResized(() => {
      appWindow.isMaximized().then(setMaximized);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  return (
    <div
      data-tauri-drag-region
      className="no-print flex h-8 shrink-0 items-center justify-between bg-sidebar pl-3 text-white select-none"
    >
      <div data-tauri-drag-region className="flex flex-1 items-center gap-2">
        <img src={logo} alt="" className="h-4 w-4" />
        <span className="text-xs font-medium text-white/70">IB-POS</span>
      </div>

      <div className="flex h-full shrink-0">
        <button
          onClick={() => appWindow.minimize()}
          aria-label={t("titleBar.minimize")}
          className="flex h-full w-11 items-center justify-center hover:bg-white/10"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          aria-label={t("titleBar.maximize")}
          className="flex h-full w-11 items-center justify-center hover:bg-white/10"
        >
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="1.5" y="0" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
              <rect x="0" y="2.5" width="7" height="7" fill="#1e293b" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="0" y="0" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </button>
        <button
          onClick={() => appWindow.close()}
          aria-label={t("titleBar.close")}
          className="flex h-full w-11 items-center justify-center hover:bg-red-600"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1" />
            <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
