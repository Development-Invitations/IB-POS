import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from "@ib-pos/i18n";
import { API_BASE } from "../lib/api";
import logo from "../assets/logo-mark.png";
import { useOnlineStatus } from "../lib/use-online-status";
import type { AuthSession, Role } from "../types/auth";
import type { CartProduct } from "../types/catalog";
import { SearchIcon, BellIcon, LogOutIcon } from "./icons";

const MAX_RESULTS = 8;

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

const ROLE_KEY: Record<Role, string> = {
  CASHIER: "roles.cashier",
  MANAGER: "roles.manager",
  WAREHOUSE: "roles.warehouse",
  ADMIN: "roles.admin",
  ACCOUNTANT: "roles.accountant",
};

interface HeaderProps {
  session: AuthSession;
  workstationName: string | null;
  shiftOpenedAt: string | null;
  products: CartProduct[];
  onSelectProduct: (product: CartProduct) => void;
  onLogout: () => void;
  onCloseShift: () => void;
  className?: string;
}

export function Header({
  session,
  workstationName,
  shiftOpenedAt,
  products,
  onSelectProduct,
  onLogout,
  onCloseShift,
  className,
}: HeaderProps) {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const online = useOnlineStatus();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const trimmedQuery = query.trim().toLowerCase();
  const results = trimmedQuery
    ? products
        .filter(
          (p) => p.name.toLowerCase().includes(trimmedQuery) || (p.barcode && p.barcode.includes(trimmedQuery)),
        )
        .slice(0, MAX_RESULTS)
    : [];

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    function handleGlobalKeydown(e: KeyboardEvent) {
      if (e.key === "F2") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    }
    window.addEventListener("keydown", handleGlobalKeydown);
    return () => window.removeEventListener("keydown", handleGlobalKeydown);
  }, []);

  function selectProduct(product: CartProduct) {
    onSelectProduct(product);
    setQuery("");
    setSearchOpen(false);
    searchInputRef.current?.blur();
  }

  function handleSearchKeydown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!searchOpen || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectProduct(results[activeIndex]);
    } else if (e.key === "Escape") {
      setSearchOpen(false);
    }
  }

  return (
    <header className={`flex shrink-0 items-center gap-6 border-b border-slate-200 bg-white px-6 py-3 ${className ?? ""}`}>
      <div className="flex items-center gap-2">
        <img src={logo} alt="IB-POS" className="h-8 w-8" />
        <span className="text-lg font-bold text-slate-900">IB-POS</span>
      </div>

      <div className="relative flex-1 max-w-xl">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
          onKeyDown={handleSearchKeydown}
          placeholder={t("common.search")}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-12 text-sm outline-none focus:border-accent"
        />
        {!query && (
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-400">
            F2
          </kbd>
        )}

        {searchOpen && trimmedQuery && (
          <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {results.length === 0 && (
              <p className="px-4 py-3 text-sm text-slate-400">{t("common.searchEmpty")}</p>
            )}
            {results.map((product, i) => (
              <button
                key={product.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectProduct(product)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
                  i === activeIndex ? "bg-slate-50" : ""
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-[10px] font-bold text-slate-500">
                  {product.imageUrl ? (
                    <img src={`${API_BASE}${product.imageUrl}`} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initials(product.name)
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">{product.name}</span>
                  {product.barcode && <span className="block text-xs text-slate-400">{product.barcode}</span>}
                </span>
                <span className="shrink-0 text-sm font-semibold text-slate-700">{product.price.toLocaleString("ru-RU")}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-sm">
        {workstationName && (
          <>
            <div className="text-right">
              <div className="font-semibold text-slate-800">{workstationName}</div>
              <div
                className={`flex items-center justify-end gap-1 text-xs ${online ? "text-emerald-600" : "text-red-600"}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-500" : "bg-red-500"}`} />
                {online ? t("header.online") : t("auth.networkError")}
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200" />
          </>
        )}

        {shiftOpenedAt ? (
          <button className="text-right hover:opacity-70" onClick={onCloseShift}>
            <div className="font-semibold text-slate-800">{t("header.shift")}</div>
            <div className="text-xs text-slate-400">
              {new Date(shiftOpenedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </button>
        ) : (
          <div className="text-right">
            <div className="font-semibold text-slate-400">{t("header.noShift")}</div>
          </div>
        )}

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
