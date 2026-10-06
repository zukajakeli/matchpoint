import React from "react";
import { useTranslation } from "../../i18n/LanguageContext";
import { COMPANY } from "../../legal/legalContent";

// Legal entity block (payment providers require it on the site).
export default function CompanyDetails({ compact = false }) {
  const { t, lang } = useTranslation();
  const ka = lang === "ka";

  if (compact) {
    return (
      <div className="mp-company-line">
        {ka ? COMPANY.legalNameKa : `${COMPANY.legalNameEn} (${COMPANY.legalNameKa})`} · {t("legal_id")}{" "}
        {COMPANY.idNumber} · {ka ? COMPANY.addressKa : COMPANY.addressEn} ·{" "}
        <a href={COMPANY.phoneHref}>{COMPANY.phone}</a> · <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
      </div>
    );
  }

  return (
    <div className="mp-company-details">
      <h3>{t("legal_company")}</h3>
      <dl>
        <div>
          <dt>{t("legal_company_name")}</dt>
          <dd>{ka ? COMPANY.legalNameKa : `${COMPANY.legalNameEn} (${COMPANY.legalNameKa})`}</dd>
        </div>
        <div>
          <dt>{t("legal_id")}</dt>
          <dd>{COMPANY.idNumber}</dd>
        </div>
        <div>
          <dt>{t("contact_address")}</dt>
          <dd>{ka ? COMPANY.addressKa : COMPANY.addressEn}</dd>
        </div>
        <div>
          <dt>{t("contact_phone")}</dt>
          <dd><a href={COMPANY.phoneHref}>{COMPANY.phone}</a></dd>
        </div>
        <div>
          <dt>{t("contact_email")}</dt>
          <dd><a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></dd>
        </div>
      </dl>
    </div>
  );
}
