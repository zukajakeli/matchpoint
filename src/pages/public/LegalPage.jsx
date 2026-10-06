import React from "react";
import { Link, Navigate } from "react-router-dom";
import PublicLayout from "../../components/landing/PublicLayout";
import { pageSeo } from "../../seo/seo";
import CompanyDetails from "../../components/landing/CompanyDetails";
import { useTranslation } from "../../i18n/LanguageContext";
import { LEGAL_PAGES, LEGAL_SLUGS, LEGAL_UPDATED } from "../../legal/legalContent";
import "./LegalPage.css";

function Block({ block }) {
  if (typeof block === "string") return <p>{block}</p>;
  return (
    <ul>
      {block.list.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

// /terms, /privacy, /refunds, /payments — Georgian or English by site language.
export default function LegalPage({ slug }) {
  const { t, lang } = useTranslation();
  const page = LEGAL_PAGES[slug]?.[lang === "ka" ? "ka" : "en"];
  if (!page) return <Navigate to="/" replace />;

  const updated = new Date(`${LEGAL_UPDATED}T12:00:00+04:00`).toLocaleDateString(
    lang === "ka" ? "ka-GE" : "en-GB",
    { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Tbilisi" }
  );

  return (
    <PublicLayout seo={pageSeo(page.title, page.intro, `/${slug}`)}>
      <div className="mp-legal-page">
        <nav className="mp-legal-nav" aria-label={t("legal_documents")}>
          {LEGAL_SLUGS.map((s) => (
            <Link key={s} to={`/${s}`} className={s === slug ? "active" : ""}>
              {t(`legal_${s}`)}
            </Link>
          ))}
        </nav>
        <article className="mp-legal-doc">
          <h1>{page.title}</h1>
          <p className="mp-legal-updated">
            {t("legal_updated")}: {updated}
          </p>
          <p className="mp-legal-intro">{page.intro}</p>
          {page.sections.map((section) => (
            <section key={section.h}>
              <h2>{section.h}</h2>
              {section.body.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </section>
          ))}
          <CompanyDetails />
        </article>
      </div>
    </PublicLayout>
  );
}
