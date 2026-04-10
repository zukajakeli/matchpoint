import React from "react";
import { useTranslation } from "../../i18n/LanguageContext";
import PublicLayout from "../../components/landing/PublicLayout";
import "./ContactPage.css";

const VENUE_NAME = import.meta.env.VITE_VENUE_NAME || "MatchPoint";

export default function ContactPage() {
  const { t } = useTranslation();

  return (
    <PublicLayout>
      <div className="mp-contact-page">
        <section className="mp-contact-hero">
          <h1>{t("contact_title")}</h1>
          <p>{t("contact_subtitle")}</p>
        </section>

        <section className="mp-contact-content">
          <div className="mp-contact-info">
            <div className="mp-contact-card">
              <div className="mp-contact-icon">&#128205;</div>
              <h3>{t("contact_address")}</h3>
              <p>{t("contact_address_value")}</p>
            </div>
            <div className="mp-contact-card">
              <div className="mp-contact-icon">&#128222;</div>
              <h3>{t("contact_phone")}</h3>
              <p><a href="tel:+995555613330">+995 555 613 330</a></p>
            </div>
            <div className="mp-contact-card">
              <div className="mp-contact-icon">&#128231;</div>
              <h3>{t("contact_email")}</h3>
              <p><a href="mailto:info@matchpoint.ge">info@matchpoint.ge</a></p>
            </div>
            <div className="mp-contact-card">
              <div className="mp-contact-icon">&#128336;</div>
              <h3>{t("contact_hours")}</h3>
              <p>{t("contact_hours_weekday")}<br />{t("contact_hours_weekend")}</p>
            </div>
          </div>

          <div className="mp-contact-map">
            <iframe
              title={`${VENUE_NAME} location`}
              src="https://www.google.com/maps?q=17+Petre+Kavtaradze+St,+Tbilisi+0186,+Georgia&output=embed"
              width="100%"
              height="450"
              style={{ border: 0, borderRadius: "16px" }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
