import { useTranslation } from "react-i18next";
import { CATEGORY_IDS, type CategoryId } from "../data/catalog";

interface CategoryTabsProps {
  active: CategoryId;
  onChange: (id: CategoryId) => void;
}

export function CategoryTabs({ active, onChange }: CategoryTabsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-2">
      {CATEGORY_IDS.map((id) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            active === id
              ? "bg-accent text-white"
              : "border border-slate-200 bg-white text-slate-600 hover:border-accent/40"
          }`}
        >
          {t(`categories.${id}`)}
        </button>
      ))}
    </div>
  );
}
