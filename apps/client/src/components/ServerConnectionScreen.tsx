import { useState } from "react";
import { useTranslation } from "react-i18next";
import logo from "../assets/logo-mark.png";
import { loadApiBase, loadConnectionMode, saveServerConnection, type ConnectionMode } from "../lib/server-config";
import { CloseIcon } from "./icons";

interface ServerConnectionScreenProps {
  // Модальное окно (открыто из экрана входа или из Настроек, поверх уже видимого контента) —
  // с крестиком закрытия. Полноэкранный режим (первая настройка новой кассы, ещё нет сессии,
  // закрывать некуда) — без крестика.
  onClose?: () => void;
}

const MODES: ConnectionMode[] = ["local", "internet"];

// Не из исходного ТЗ — по прямому запросу клиента: адрес сервера теперь настраивается прямо в
// приложении (раньше был вшит в сборку). Один и тот же экран используется и на экране входа
// (для первой настройки новой кассы, когда локальный сервер — это другой компьютер в той же
// сети) и в Настройках у уже вошедшего админа. Сохранение перезагружает всё приложение целиком
// (см. handleSave) — иначе часть уже загруженных данных осталась бы со старого сервера.
export function ServerConnectionScreen({ onClose }: ServerConnectionScreenProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ConnectionMode>(loadConnectionMode());
  const [address, setAddress] = useState(loadApiBase());

  function handleSave() {
    if (!address.trim()) return;
    saveServerConnection(mode, address);
    window.location.reload();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <img src={logo} alt="IB-POS" className="h-6 w-6" />
            <h2 className="text-lg font-semibold text-slate-800">{t("serverConnection.title")}</h2>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={t("common.close")}>
              <CloseIcon />
            </button>
          )}
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="space-y-2">
            {MODES.map((m) => (
              <label
                key={m}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                  mode === m ? "border-accent bg-accent/5" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="connection-mode"
                  checked={mode === m}
                  onChange={() => setMode(m)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">
                    {t(`serverConnection.modes.${m}.title`)}
                  </span>
                  <span className="block text-xs text-slate-400">{t(`serverConnection.modes.${m}.hint`)}</span>
                </span>
              </label>
            ))}
          </div>

          <label className="block text-xs font-medium text-slate-500">
            {t("serverConnection.address")}
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t(`serverConnection.modes.${mode}.placeholder`)}
              autoFocus
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
        </div>

        <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
          {onClose && (
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50"
            >
              {t("returns.cancel")}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!address.trim()}
            className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {t("serverConnection.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
