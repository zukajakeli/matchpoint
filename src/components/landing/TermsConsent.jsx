import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "../../i18n/LanguageContext";

// Required before any online payment (payment provider requirement).
// Links open in a new tab so the form isn't lost.
export default function TermsConsent({ checked, onChange }) {
  const { t } = useTranslation();
  return (
    <label className="mp-terms-consent">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} required />
      <span>
        {t("consent_1")}
        <Link to="/terms" target="_blank" rel="noopener">{t("consent_terms")}</Link>
        {t("consent_2")}
        <Link to="/refunds" target="_blank" rel="noopener">{t("consent_refunds")}</Link>
        {t("consent_3")}
        <Link to="/privacy" target="_blank" rel="noopener">{t("consent_privacy")}</Link>
        {t("consent_4")}
      </span>
    </label>
  );
}
