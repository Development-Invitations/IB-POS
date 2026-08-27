import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from "@ib-pos/i18n";
import logo from "./assets/logo-mark.png";
import "./App.css";

function App() {
  const { t, i18n } = useTranslation();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="flex items-center justify-between bg-sidebar px-6 py-4 text-white">
        <div className="flex items-center gap-2">
          <img src={logo} alt="IB-POS" className="h-8 w-8" />
          <span className="text-xl font-bold">IB-POS</span>
        </div>
        <div className="flex gap-1 rounded-lg bg-white/10 p-1">
          {SUPPORTED_LOCALES.map((locale: Locale) => (
            <button
              key={locale}
              onClick={() => i18n.changeLanguage(locale)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition ${
                i18n.language === locale ? "bg-accent text-white" : "text-white/70 hover:text-white"
              }`}
            >
              {LOCALE_LABELS[locale]}
            </button>
          ))}
        </div>
      </header>

      <main className="flex flex-col items-center gap-4 px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">{t("app.subtitle")}</h1>
        <p className="text-slate-500">{t("common.search")}</p>
        <div className="mt-4 rounded-xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
          <p className="text-sm uppercase tracking-wide text-slate-400">{t("receipt.current")}</p>
          <p className="mt-1 text-lg font-medium">
            {t("receipt.total")}: 0
          </p>
          <button className="mt-3 rounded-lg bg-accent px-4 py-2 font-medium text-white hover:bg-accent-hover">
            {t("receipt.pay")}
          </button>
        </div>
      </main>
    </div>
  );
}

export default App;
