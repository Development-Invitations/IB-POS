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
}

const NAV_ITEMS: NavItem[] = [
  { key: "home", labelKey: "nav.home", icon: HomeIcon, screen: "home" },
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
// "Главная" — только у тех, чья работа не сводится к одному рабочему экрану (Раздел 3: у них
// везде "✅ весь бизнес"/"свои точки"). У Кассира и Зав. складом своя "главная" и так есть — их
// основной рабочий экран ("Продажа"/"Товары", см. ROLE_HOME_SCREEN в App.tsx), отдельная сводная
// панель им не нужна и не должна маячить в меню лишним пунктом.
// Бухгалтер лишён "Продажи" и "Товаров" сверх Раздела 3 (там у него было "👁 просмотр" для
// обоих) — по прямому запросу клиента: у бухгалтера это вообще не его работа, ни в каком виде.
// Экспортируется — Header.tsx использует ту же запись для sale, чтобы не показывать поиск
// товаров (он ведёт именно на экран "Продажа") тем, у кого туда всё равно нет доступа.
export const SCREEN_ACCESS: Record<ScreenKey, Role[]> = {
  home: ["ADMIN", "MANAGER", "ACCOUNTANT"],
  sale: ["ADMIN", "MANAGER", "CASHIER"],
  products: ["ADMIN", "MANAGER", "WAREHOUSE", "CASHIER"],
  customers: ["ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"],
  discounts: ["ADMIN", "MANAGER", "ACCOUNTANT"],
  returns: ["ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"],
  reports: ["ADMIN", "MANAGER", "WAREHOUSE", "ACCOUNTANT"],
  // Бухгалтер — сверх исходного ТЗ (там у него "Смены" ❌), по прямому запросу клиента: только
  // просмотр, без открытия/закрытия и внесения/изъятия наличных (см. ShiftsScreen.tsx).
  shifts: ["ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"],
  integrations: ["ADMIN"],
  equipment: ["ADMIN", "MANAGER", "CASHIER"],
  // Раздел 3 ТЗ отдаёт "Сотрудники и роли" только Админу — Бухгалтер добавлен сверх ТЗ по
  // прямому запросу клиента: ему нужно видеть сотрудников, чтобы вести зарплаты (см. поле
  // User.salary и ограничение по ролям в UsersService.update()).
  employees: ["ADMIN", "ACCOUNTANT"],
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
  const visibleItems = NAV_ITEMS.filter((item) => !item.screen || SCREEN_ACCESS[item.screen].includes(role));

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
