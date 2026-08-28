import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from "@ib-pos/i18n";
import logo from "../assets/logo-mark.png";
import { useOnlineStatus } from "../lib/use-online-status";
import type { AuthSession, Role } from "../types/auth";
import { SearchIcon, BellIcon, LogOutIcon } from "./icons";

const ROLE_KEY: Record<Role, string> = {
  CASHIER: "roles.cashier",
  MANAGER: "roles.manager",
  WAREHOUSE: "roles.warehouse",
  ADMIN: "roles.admin",
  ACCOUNTANT: "roles.accountant",
};

interface HeaderProps {
  session: AuthSession;
  workstationName: string;
  shiftOpenedAt: string;
  onLogout: () => void;
  onCloseShift: () => void;
  className?: string;
}

export function Header({ session, workstationName, shiftOpenedAt, onLogout, onCloseShift, className }: HeaderProps) {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const online = useOnlineStatus();

  return (
    <header className={`flex shrink-0 items-center gap-6 border-b border-slate-200 bg-white px-6 py-3 ${className ?? ""}`}>
      <div className="flex items-center gap-2">
        <img src={logo} alt="IB-POS" className="h-8 w-8" />
        <span className="text-lg font-bold text-slate-900">IB-POS</span>
      </div>

      <div className="relative flex-1 max-w-xl">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder={t("common.search")}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-12 text-sm outline-none focus:border-accent"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-400">
          F2
        </kbd>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <div className="text-right">
          <div className="font-semibold text-slate-800">{workstationName}</div>
          <div className={`flex items-center justify-end gap-1 text-xs ${online ? "text-emerald-600" : "text-red-600"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-500" : "bg-red-500"}`} />
            {online ? t("header.online") : t("auth.networkError")}
          </div>
        </div>

        <div className="h-8 w-px bg-slate-200" />

        <button className="text-right hover:opacity-70" onClick={onCloseShift}>
          <div className="font-semibold text-slate-800">{t("header.shift")}</div>
          <div className="text-xs text-slate-400">
            {new Date(shiftOpenedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </button>

        <div className="h-8 w-px bg-slate-200" />

        <div className="text-right text-xs text-slate-400">
          <div>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
          <div>{now.toLocaleDateString("ru-RU")}</div>
        </div>

        <button
          className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100"
          aria-label={t("common.notifications")}
        >
          <BellIcon />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent" />
        </button>

        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {SUPPORTED_LOCALES.map((locale: Locale) => (
            <button
              key={locale}
              onClick={() => i18n.changeLanguage(locale)}
              className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                i18n.language === locale ? "bg-accent text-white" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {LOCALE_LABELS[locale]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
            {session.login.slice(0, 2).toUpperCase()}
          </div>
          <div className="hidden text-xs text-slate-500 lg:block">{t(ROLE_KEY[session.role])}</div>
          <button
            onClick={onLogout}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={t("auth.logout")}
          >
            <LogOutIcon />
          </button>
        </div>
      </div>
    </header>
  );
}
