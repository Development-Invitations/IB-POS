import ru from "../locales/ru.json";
import uz from "../locales/uz.json";
import uzCyrl from "../locales/uz-Cyrl.json";

export const SUPPORTED_LOCALES = ["ru", "uz", "uz-Cyrl"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  ru: "RU",
  uz: "UZ",
  "uz-Cyrl": "ЎЗ",
};

export const resources: Record<Locale, { translation: typeof ru }> = {
  ru: { translation: ru },
  uz: { translation: uz },
  "uz-Cyrl": { translation: uzCyrl },
};

export const DEFAULT_LOCALE: Locale = "ru";
