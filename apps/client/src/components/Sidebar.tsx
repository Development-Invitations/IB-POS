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
  SettingsIcon,
  ChevronLeftIcon,
} from "./icons";

interface NavItem {
  key: string;
  labelKey: string;
  icon: (props: { className?: string }) => ReactElement;
  active?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { key: "home", labelKey: "nav.home", icon: HomeIcon },
  { key: "sale", labelKey: "nav.sale", icon: CartIcon, active: true },
  { key: "products", labelKey: "nav.products", icon: BoxIcon },
  { key: "customers", labelKey: "nav.customers", icon: UsersIcon },
  { key: "discounts", labelKey: "nav.discounts", icon: TagIcon },
  { key: "returns", labelKey: "nav.returns", icon: ReturnIcon },
  { key: "reports", labelKey: "nav.reports", icon: ChartIcon },
  { key: "shifts", labelKey: "nav.shifts", icon: ClockIcon },
  { key: "integrations", labelKey: "nav.integrations", icon: PlugIcon },
  { key: "equipment", labelKey: "nav.equipment", icon: MonitorIcon },
  { key: "settings", labelKey: "nav.settings", icon: SettingsIcon },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { t } = useTranslation();

  return (
    <aside
      className={`flex shrink-0 flex-col bg-sidebar text-white transition-[width] duration-200 ${
        collapsed ? "w-[76px]" : "w-60"
      }`}
    >
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              title={t(item.labelKey)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                item.active ? "bg-accent text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="shrink-0" />
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
