import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { resources, DEFAULT_LOCALE } from "@ib-pos/i18n";

i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
});

export default i18n;
