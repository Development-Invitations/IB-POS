import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

type Phase = "idle" | "available" | "downloading" | "installing" | "error";

// Проверяем обновления один раз при старте приложения, вне зависимости от того, залогинен
// ли пользователь — это киоск-устройство, апдейт должен долетать даже до экрана логина.
// Вне Tauri (dev-режим в обычном браузере) check() бросит исключение — тихо игнорируем.
export function UpdateNotifier() {
  const { t } = useTranslation();
  const [update, setUpdate] = useState<Update | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    check()
      .then((result) => {
        if (result) {
          setUpdate(result);
          setPhase("available");
        }
      })
      .catch(() => {
        // Нет апдейтера (dev-браузер) или нет сети — не мешаем работе кассы.
      });
  }, []);

  if (phase === "idle" || !update) return null;

  const handleUpdate = async () => {
    setPhase("downloading");
    let total = 0;
    let downloaded = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setPercent(total > 0 ? Math.round((downloaded / total) * 100) : 0);
        } else if (event.event === "Finished") {
          setPhase("installing");
        }
      });
      await relaunch();
    } catch {
      setPhase("error");
    }
  };

  return (
    <div className="no-print fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg bg-slate-800 px-4 py-3 text-sm text-white shadow-lg">
      {phase === "available" && (
        <>
          <span>{t("updater.available", { version: update.version })}</span>
          <button
            onClick={handleUpdate}
            className="rounded bg-accent px-3 py-1.5 font-medium hover:opacity-90"
          >
            {t("updater.update")}
          </button>
        </>
      )}
      {phase === "downloading" && <span>{t("updater.downloading", { percent })}</span>}
      {phase === "installing" && <span>{t("updater.installing")}</span>}
      {phase === "error" && <span className="text-red-400">{t("updater.error")}</span>}
    </div>
  );
}
