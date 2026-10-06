import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "../../i18n/LanguageContext";
import LanguageSwitcher from "./LanguageSwitcher";
import CompanyDetails from "./CompanyDetails";
import { LEGAL_SLUGS } from "../../legal/legalContent";
import Seo from "../Seo";
import "./PublicLayout.css";

const VENUE_NAME = import.meta.env.VITE_VENUE_NAME || "MatchPoint";

// seo: page metadata from src/seo/seo.js; defaults to the site title with
// this URL as canonical.
export default function PublicLayout({ children, seo }) {
  const location = useLocation();
  const { t } = useTranslation();

  const navLinks = [
    { to: "/", label: t("nav_home") },
    { to: "/book", label: t("nav_book") },
    { to: "/events", label: t("nav_events") },
    { to: "/blog", label: t("nav_blog") },
    { to: "/contact", label: t("nav_contact") },
  ];
  const clubLink = { to: "/account", label: t("nav_account") };
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu whenever the route changes
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Lock page scroll and allow Escape to close while the menu is open
  useEffect(() => {
    if (!menuOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="mp-public-layout">
      <Seo {...(seo || { path: location.pathname })} />
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
          </nav>
          {/* Always visible, even when the links scroll on small screens */}
          <div className="mp-header-actions">
            {/* Member account: a button, not just another link */}
            <Link
              to={clubLink.to}
              className={`mp-nav-link mp-nav-club ${location.pathname === clubLink.to ? "active" : ""}`}
            >
              <svg className="mp-nav-club-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2.2" />
                <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              <span className="mp-nav-club-label">{clubLink.label}</span>
            </Link>
            <LanguageSwitcher />
            <button
              type="button"
              className={`mp-burger ${menuOpen ? "open" : ""}`}
              aria-label={menuOpen ? t("nav_close") : t("nav_menu")}
              aria-expanded={menuOpen}
              aria-controls="mp-mobile-menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>
      <div
        id="mp-mobile-menu"
        className={`mp-mobile-menu ${menuOpen ? "open" : ""}`}
        aria-hidden={!menuOpen}
        inert={!menuOpen}
      >
        <div className="mp-mobile-menu-ball" aria-hidden="true" />
        <div className="mp-mobile-menu-ball small" aria-hidden="true" />
        <nav className="mp-mobile-menu-nav">
          {navLinks.map((link, i) => (
            <Link
              key={link.to}
              to={link.to}
              style={{ "--i": i }}
              className={`mp-mobile-link ${location.pathname === link.to ? "active" : ""}`}
              onClick={() => setMenuOpen(false)}
            >
              <span className="mp-mobile-link-num">{String(i + 1).padStart(2, "0")}</span>
              <span className="mp-mobile-link-label">{link.label}</span>
              <svg className="mp-mobile-link-arrow" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          ))}
        </nav>
        <Link
          to={clubLink.to}
          style={{ "--i": navLinks.length }}
          className="mp-mobile-club"
          onClick={() => setMenuOpen(false)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2.2" />
            <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          {clubLink.label}
        </Link>
      </div>
      <main className="mp-public-main">{children}</main>
      <footer className="mp-public-footer mp-halftone-fade mp-grain">
        <div className="mp-footer-inner">
          <div className="mp-footer-brand">
            <img src="/matchpoint-logo.png" alt={VENUE_NAME} />
            <span>{VENUE_NAME}</span>
          </div>
          <div className="mp-footer-links">
            {[...navLinks, clubLink].map((link) => (
              <Link key={link.to} to={link.to}>{link.label}</Link>
            ))}
          </div>
          <div className="mp-footer-payments">
            <span className="mp-pay-badge">
              <span className="mp-pay-visa">VISA</span>
            </span>
            <span className="mp-pay-badge mp-pay-mc-badge">
              <svg width="26" height="16" viewBox="0 0 26 16" fill="none"><circle cx="9" cy="8" r="7.5" fill="#EB001B"/><circle cx="17" cy="8" r="7.5" fill="#F79E1B"/><path d="M13 1.6a7.5 7.5 0 0 1 0 12.8 7.5 7.5 0 0 1 0-12.8z" fill="#FF5F00"/></svg>
            </span>
            <span className="mp-pay-badge">
              <span className="mp-pay-gpay">G&nbsp;Pay</span>
            </span>
            <span className="mp-pay-badge">
              <span className="mp-pay-applepay">&nbsp;Pay</span>
            </span>
          </div>
          <div className="mp-footer-legal">
            {LEGAL_SLUGS.map((slug) => (
              <Link key={slug} to={`/${slug}`}>{t(`legal_${slug}`)}</Link>
            ))}
          </div>
          <CompanyDetails compact />
          <div className="mp-footer-copy">
            © {new Date().getFullYear()} {VENUE_NAME}. {t("footer_rights")}
          </div>
        </div>
      </footer>
    </div>
  );
}
