import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useEscapeClose } from "../lib/use-escape-close";
import { CloseIcon } from "./icons";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

// Обёртка для модулей, которые Кассир открывает поверх кассы (Товары/Клиенты/Возвраты/Смены/
// Оборудование) вместо перехода на отдельный экран — см. App.tsx cashierModal. У Кассира больше
// нет сайдбара (по прямому запросу клиента: "убираем сайдбар, делаем кнопки снизу"), поэтому эти
// разделы должны оставаться доступными, просто в модальном окне поверх экрана "Продажа".
export function Modal({ title, onClose, children }: ModalProps) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={t("common.close")}>
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
