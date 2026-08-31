import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import {
  HomeIcon,
  CartIcon,
  BoxIcon,
  UsersIcon,
  TagIcon,
  ReturnIcon,
  ChartIcon,
  ClockIcon,
  PlugIcon,
  MonitorIcon,
  IdBadgeIcon,
  SettingsIcon,
  ChevronLeftIcon,
} from "./icons";
import type { ScreenKey } from "../types/screen";
import type { Role } from "../types/auth";

interface NavItem {
  key: string;
  labelKey: string;
  icon: (props: { className?: string }) => ReactElement;
  screen?: ScreenKey;
  // Для пунктов без экрана (сейчас только "Главная") — доступ не через SCREEN_ACCESS.
  roles?: Role[];
}

// У кассира нет своей "Главной": их рабочий экран и так "Продажа" (он же экран по умолчанию
// после входа, см. App.tsx) — отдельная сводная панель им не нужна и не должна маячить в меню.
const NON_CASHIER_ROLES: Role[] = ["ADMIN", "MANAGER", "WAREHOUSE", "ACCOUNTANT"];

const NAV_ITEMS: NavItem[] = [
  { key: "home", labelKey: "nav.home", icon: HomeIcon, roles: NON_CASHIER_ROLES },
  { key: "sale", labelKey: "nav.sale", icon: CartIcon, screen: "sale" },
  { key: "products", labelKey: "nav.products", icon: BoxIcon, screen: "products" },
  { key: "customers", labelKey: "nav.customers", icon: UsersIcon, screen: "customers" },
  { key: "discounts", labelKey: "nav.discounts", icon: TagIcon, screen: "discounts" },
  { key: "returns", labelKey: "nav.returns", icon: ReturnIcon, screen: "returns" },
  { key: "reports", labelKey: "nav.reports", icon: ChartIcon, screen: "reports" },
  { key: "shifts", labelKey: "nav.shifts", icon: ClockIcon, screen: "shifts" },
  { key: "integrations", labelKey: "nav.integrations", icon: PlugIcon, screen: "integrations" },
  { key: "equipment", labelKey: "nav.equipment", icon: MonitorIcon, screen: "equipment" },
  { key: "employees", labelKey: "nav.employees", icon: IdBadgeIcon, screen: "employees" },
  { key: "settings", labelKey: "nav.settings", icon: SettingsIcon, screen: "settings" },
];

// Раздел 3 ТЗ (docs/Roadmap_TZ.md) — кто вообще имеет доступ к модулю (✅ или 👁), не важно,
// полный или только просмотр: сами экраны внутри уже разводят полный/ограниченный доступ.
// Кассир исключён из "Отчётов": по ТЗ ему положен только просмотр "своей смены", а это уже
// полностью закрывается экраном "Смены" (там есть отчёт по текущей/прошлой смене) — открывать
// ему общий экран аналитики бизнеса, где для его роли всё равно всё запрещено (см.
// CAN_DASHBOARD_ROLES/CAN_STOCK_ROLES в ReportsScreen.tsx), только вводит в заблуждение.
const SCREEN_ACCESS: Record<ScreenKey, Role[]> = {
  sale: ["ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"],
  products: ["ADMIN", "MANAGER", "WAREHOUSE", "CASHIER", "ACCOUNTANT"],
  customers: ["ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"],
  discounts: ["ADMIN", "MANAGER", "ACCOUNTANT"],
  returns: ["ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"],
  reports: ["ADMIN", "MANAGER", "WAREHOUSE", "ACCOUNTANT"],
  shifts: ["ADMIN", "MANAGER", "CASHIER"],
  integrations: ["ADMIN"],
  equipment: ["ADMIN", "MANAGER", "CASHIER"],
  employees: ["ADMIN"],
  settings: ["ADMIN"],
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeScreen: ScreenKey;
  onNavigate: (screen: ScreenKey) => void;
  role: Role;
  className?: string;
}

export function Sidebar({ collapsed, onToggle, activeScreen, onNavigate, role, className }: SidebarProps) {
  const { t } = useTranslation();
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.screen) return SCREEN_ACCESS[item.screen].includes(role);
    if (item.roles) return item.roles.includes(role);
    return true;
  });

  return (
    <aside
      className={`flex shrink-0 flex-col bg-sidebar text-white transition-[width] duration-200 ${
        collapsed ? "w-[76px]" : "w-60"
      } ${className ?? ""}`}
    >
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.screen === activeScreen;
          return (
            <button
              key={item.key}
              title={t(item.labelKey)}
              onClick={() => item.screen && onNavigate(item.screen)}
              className={`flex h-11 w-full shrink-0 items-center gap-3 rounded-lg text-sm font-medium transition ${
                collapsed ? "justify-center px-0" : "px-3"
              } ${isActive ? "bg-accent text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
            </button>
          );
        })}
      </nav>

      <button
        onClick={onToggle}
        className="flex items-center gap-2 border-t border-white/10 px-4 py-4 text-sm text-white/60 hover:text-white"
      >
        <ChevronLeftIcon className={`transition-transform ${collapsed ? "rotate-180" : ""}`} />
        {!collapsed && <span>{t("nav.collapse")}</span>}
      </button>
    </aside>
  );
}
