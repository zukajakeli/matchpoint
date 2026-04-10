import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "../../i18n/LanguageContext";
import LanguageSwitcher from "./LanguageSwitcher";
import "./PublicLayout.css";

const VENUE_NAME = import.meta.env.VITE_VENUE_NAME || "MatchPoint";

export default function PublicLayout({ children }) {
  const location = useLocation();
  const { t } = useTranslation();

  const navLinks = [
    { to: "/", label: t("nav_home") },
    { to: "/book", label: t("nav_book") },
    { to: "/events", label: t("nav_events") },
    { to: "/blog", label: t("nav_blog") },
    { to: "/contact", label: t("nav_contact") },
  ];

  return (
    <div className="mp-public-layout">
      <header className="mp-public-header">
        <div className="mp-header-inner">
          <Link to="/" className="mp-header-logo">
            <img src="/matchpoint-logo.png" alt={VENUE_NAME} />
            <span>{VENUE_NAME}</span>
          </Link>
          <nav className="mp-header-nav">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`mp-nav-link ${location.pathname === link.to ? "active" : ""}`}
              >
                {link.label}
              </Link>
            ))}
            <LanguageSwitcher />
          </nav>
        </div>
      </header>
      <main className="mp-public-main">{children}</main>
      <footer className="mp-public-footer">
        <div className="mp-footer-inner">
          <div className="mp-footer-brand">
            <img src="/matchpoint-logo.png" alt={VENUE_NAME} />
            <span>{VENUE_NAME}</span>
          </div>
          <div className="mp-footer-links">
            {navLinks.map((link) => (
              <Link key={link.to} to={link.to}>{link.label}</Link>
            ))}
          </div>
          <div className="mp-footer-copy">
            © {new Date().getFullYear()} {VENUE_NAME}. {t("footer_rights")}
          </div>
        </div>
      </footer>
    </div>
  );
}
