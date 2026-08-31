import { useTranslation } from "react-i18next";

// "Главная" — общая для тех, у кого доступ ко всему бизнесу (Админ/Управляющий/Бухгалтер, см.
// SCREEN_ACCESS.home в Sidebar.tsx). Пока без содержимого — честная заглушка (тот же приём, что
// и в SettingsScreen.tsx для ещё не сделанных вкладок), пока нет самой страницы по ТЗ и макету.
export function HomeScreen() {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <h1 className="text-xl font-bold text-slate-800">{t("home.title")}</h1>
      <p className="text-sm text-slate-400">{t("home.notReady")}</p>
    </div>
  );
}
