import { useTranslation } from "react-i18next";

export interface CategoryTabItem {
  id: string;
  name: string;
}

interface CategoryTabsProps {
  categories: CategoryTabItem[];
  active: string;
  onChange: (id: string) => void;
}

export function CategoryTabs({ categories, active, onChange }: CategoryTabsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onChange("all")}
        className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
          active === "all"
            ? "bg-accent text-white"
            : "border border-slate-200 bg-white text-slate-600 hover:border-accent/40"
        }`}
      >
        {t("categories.all")}
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          onClick={() => onChange(category.id)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            active === category.id
              ? "bg-accent text-white"
              : "border border-slate-200 bg-white text-slate-600 hover:border-accent/40"
          }`}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}
