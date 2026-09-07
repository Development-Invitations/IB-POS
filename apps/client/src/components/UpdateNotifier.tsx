import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

type Phase = "idle" | "available" | "downloading" | "installing" | "error";

// Раз в столько миллисекунд повторяем проверку, пока обновление не найдено — киоск обычно не
// перезапускают неделями, проверки только при старте недостаточно, чтобы обновление реально
// "дошло" до кассы (не из исходного ТЗ — по прямому запросу клиента).
const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

// Проверяем обновления при старте приложения и затем периодически, вне зависимости от того,
// залогинен ли пользователь — это киоск-устройство, апдейт должен долетать даже до экрана
// логина. Вне Tauri (dev-режим в обычном браузере) check() бросит исключение — тихо игнорируем.
export function UpdateNotifier() {
  const { t } = useTranslation();
  const [update, setUpdate] = useState<Update | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    function runCheck() {
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
    }
    runCheck();
    const id = window.setInterval(() => {
      // Не перепроверяем, если уже что-то нашли/качаем/ставим — не сбивать кассира с толку
      // новым баннером поверх уже идущего процесса.
      setPhase((current) => {
        if (current === "idle") runCheck();
        return current;
      });
    }, RECHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  if (phase === "idle" || !update) return null;

  // Тело релиза (см. .github/workflows/release.yml — Generate changelog) — список коммитов
  // с прошлого тега построчно, с "- " в начале. Не из исходного ТЗ — по прямому запросу
  // клиента: перед обновлением кассир/админ должен видеть текстом, что именно изменилось,
  // а не только номер версии.
  const changeLines = (update.body ?? "")
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);

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
    <div className="no-print fixed bottom-4 right-4 z-50 w-80 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200">
      {phase === "available" && (
        <>
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">
              {t("updater.available", { version: update.version })}
            </p>
          </div>

          {changeLines.length > 0 && (
            <ul className="max-h-40 list-disc space-y-1 overflow-y-auto px-4 py-3 pl-8 text-xs text-slate-500">
              {changeLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}

          <div className="px-4 py-3">
            <button
              onClick={handleUpdate}
              className="w-full rounded-lg bg-accent py-2 text-sm font-bold text-white hover:bg-accent-hover"
            >
              {t("updater.update")}
            </button>
          </div>
        </>
      )}
      {phase === "downloading" && (
        <p className="px-4 py-4 text-sm text-slate-600">{t("updater.downloading", { percent })}</p>
      )}
      {phase === "installing" && <p className="px-4 py-4 text-sm text-slate-600">{t("updater.installing")}</p>}
      {phase === "error" && <p className="px-4 py-4 text-sm text-red-600">{t("updater.error")}</p>}
    </div>
  );
}
