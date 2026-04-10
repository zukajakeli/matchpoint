import React, { createContext, useContext, useState, useCallback } from "react";
import translations from "./translations";

const STORAGE_KEY = "matchpoint_language";
const DEFAULT_LANG = "ka"; // Georgian default

function getSavedLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && translations[saved]) return saved;
  } catch {}
  return DEFAULT_LANG;
}

const LanguageContext = createContext({
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(getSavedLanguage);

  const setLang = useCallback((newLang) => {
    if (!translations[newLang]) return;
    setLangState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
    } catch {}
  }, []);

  const t = useCallback(
    (key, fallback) => {
      return translations[lang]?.[key] ?? translations.en?.[key] ?? fallback ?? key;
    },
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LanguageContext);
}

export function useLanguage() {
  const { lang, setLang } = useContext(LanguageContext);
  return { lang, setLang };
}
