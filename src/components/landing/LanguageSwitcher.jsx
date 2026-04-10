import React from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import "./LanguageSwitcher.css";

export default function LanguageSwitcher() {
  const { lang, setLang } = useLanguage();

  return (
    <div className="mp-lang-switcher">
      <button
        className={`mp-lang-btn${lang === "ka" ? " active" : ""}`}
        onClick={() => setLang("ka")}
        title="ქართული"
      >
        GE
      </button>
      <span className="mp-lang-divider">|</span>
      <button
        className={`mp-lang-btn${lang === "en" ? " active" : ""}`}
        onClick={() => setLang("en")}
        title="English"
      >
        EN
      </button>
    </div>
  );
}
