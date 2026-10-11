import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n/LanguageContext";
import PublicLayout from "../../components/landing/PublicLayout";
import { isSupabaseConfigured } from "../../services/supabaseClient";
import { fetchSiteContent } from "../../services/supabase/siteContentApi";
import { DEFAULT_CONTACT, DEFAULT_CORPORATE, DEFAULT_HERO_IMAGE, localized, mergeContent } from "../../content/siteDefaults";
import { validateInquiry } from "../../../supabase/functions/_shared/corporateInquiry.ts";
import { corporateSeo } from "../../seo/seo";
import "./LandingPage.css";
import "./CorporateEventsPage.css";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const EMPTY_FORM = { fullName: "", company: "", email: "", phone: "", eventDate: "", participants: "", message: "" };

// Server field names → form field names, and error codes → messages
const FIELD_MAP = {
  full_name: "fullName",
  company: "company",
  email: "email",
  phone: "phone",
  event_date: "eventDate",
  participants: "participants",
  message: "message",
};
const ERROR_KEYS = {
  fullName: "corp_err_required",
  company: "corp_err_too_long",
  email: "corp_err_email",
  phone: "corp_err_phone",
  eventDate: "corp_err_date",
  participants: "corp_err_participants",
  message: "corp_err_message",
};

function toFieldErrors(serverErrors) {
  const out = {};
  for (const [field, code] of Object.entries(serverErrors || {})) {
    const name = FIELD_MAP[field];
    if (name) out[name] = code === "too_long" ? "corp_err_too_long" : ERROR_KEYS[name];
  }
  return out;
}

function todayInTbilisi() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tbilisi" });
}

function InquiryForm({ t }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState({});
  // idle | sending | success | error
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const startedAt = useRef(Date.now());
  const formRef = useRef(null);
  const resultRef = useRef(null);

  useEffect(() => {
    if (status === "success" || status === "error") resultRef.current?.focus();
  }, [status]);

  const update = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    if (errors[field]) setErrors((errs) => ({ ...errs, [field]: undefined }));
  };

  const focusFirstError = (fieldErrors) => {
    const first = Object.keys(EMPTY_FORM).find((f) => fieldErrors[f]);
    if (first) formRef.current?.querySelector(`[name="${first}"]`)?.focus();
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (status === "sending") return;
    const payload = { ...form, website: honeypot, startedAt: startedAt.current };

    // Same checks as the server, so most mistakes show up instantly.
    const check = validateInquiry({ ...payload, startedAt: 0 }, Date.now());
    if (!check.ok && !check.spam) {
      const fieldErrors = toFieldErrors(check.errors);
      setErrors(fieldErrors);
      setErrorMessage(t("corp_error_fields"));
      setStatus("idle");
      focusFirstError(fieldErrors);
      return;
    }

    setStatus("sending");
    setErrorMessage("");
    try {
      if (!SUPABASE_URL) throw new Error("Supabase is not configured");
      const res = await fetch(`${SUPABASE_URL}/functions/v1/corporate-inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        setStatus("success");
        setForm(EMPTY_FORM);
        setErrors({});
        return;
      }
      if (res.status === 422 && json.fields) {
        const fieldErrors = toFieldErrors(json.fields);
        setErrors(fieldErrors);
        setErrorMessage(t("corp_error_fields"));
        setStatus("idle");
        focusFirstError(fieldErrors);
        return;
      }
      setErrorMessage(res.status === 429 ? t("corp_error_rate") : t("corp_error"));
      setStatus("error");
    } catch {
      setErrorMessage(t("corp_error"));
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="mp-corp-success" role="status" tabIndex={-1} ref={resultRef}>
        <div className="mp-corp-success-icon" aria-hidden="true">✓</div>
        <h3>{t("corp_success_title")}</h3>
        <p>{t("corp_success_text")}</p>
        <button
          type="button"
          className="mp-btn mp-btn-secondary"
          onClick={() => {
            startedAt.current = Date.now();
            setStatus("idle");
          }}
        >
          {t("corp_send_another")}
        </button>
      </div>
    );
  }

  const field = (name, label, { type = "text", required = false, autoComplete, textarea = false, ...rest } = {}) => {
    const id = `corp-${name}`;
    const errorKey = errors[name];
    const props = {
      id,
      name,
      value: form[name],
      onChange: update(name),
      required,
      "aria-invalid": errorKey ? "true" : undefined,
      "aria-describedby": errorKey ? `${id}-error` : undefined,
      autoComplete,
      ...rest,
    };
    return (
      <div className={`mp-corp-field ${textarea ? "is-wide" : ""} ${errorKey ? "has-error" : ""}`}>
        <label htmlFor={id}>
          {label}
          {required ? <span className="mp-corp-req" aria-hidden="true"> *</span> : <span className="mp-corp-opt"> ({t("corp_f_optional")})</span>}
        </label>
        {textarea ? <textarea rows={5} {...props} /> : <input type={type} {...props} />}
        {errorKey && (
          <span className="mp-corp-error" id={`${id}-error`}>
            {t(errorKey)}
          </span>
        )}
      </div>
    );
  };

  return (
    <form ref={formRef} className="mp-corp-form" onSubmit={onSubmit} noValidate>
      <div className="mp-corp-grid">
        {field("fullName", t("corp_f_name"), { required: true, autoComplete: "name", maxLength: 120 })}
        {field("company", t("corp_f_company"), { autoComplete: "organization", maxLength: 160 })}
        {field("email", t("corp_f_email"), { type: "email", required: true, autoComplete: "email", maxLength: 200 })}
        {field("phone", t("corp_f_phone"), { type: "tel", required: true, autoComplete: "tel", maxLength: 40 })}
        {field("eventDate", t("corp_f_date"), { type: "date", min: todayInTbilisi() })}
        {field("participants", t("corp_f_participants"), { type: "number", min: 1, max: 10000, inputMode: "numeric" })}
        {field("message", t("corp_f_message"), { required: true, textarea: true, maxLength: 5000 })}
      </div>

      {/* Spam trap: hidden from people, bots fill it in */}
      <div className="mp-corp-trap" aria-hidden="true">
        <label htmlFor="corp-company-website">Website</label>
        <input
          id="corp-company-website"
          name="company_website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      {errorMessage && (
        <p className="mp-corp-form-error" role="alert" tabIndex={-1} ref={status === "error" ? resultRef : undefined}>
          {errorMessage}
        </p>
      )}

      <button type="submit" className="mp-btn mp-btn-primary mp-corp-submit" disabled={status === "sending"}>
        {status === "sending" ? t("corp_sending") : t("corp_submit")}
      </button>
    </form>
  );
}

export default function CorporateEventsPage() {
  const { t, lang } = useTranslation();
  const [corporate, setCorporate] = useState(DEFAULT_CORPORATE);
  const [contact, setContact] = useState(DEFAULT_CONTACT);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    fetchSiteContent(["corporate", "contact"])
      .then((saved) => {
        setCorporate(mergeContent(DEFAULT_CORPORATE, saved.corporate));
        setContact(mergeContent(DEFAULT_CONTACT, saved.contact));
      })
      .catch(() => {});
  }, []);

  const scrollToForm = (e) => {
    e.preventDefault();
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("inquiry")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
    document.getElementById("corp-fullName")?.focus({ preventScroll: true });
  };

  const address = localized(contact.address, lang);
  const phoneHref = `tel:${String(contact.phone).replace(/[^\d+]/g, "")}`;
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`MatchPoint, ${localized(contact.address, "en")}`)}`;

  return (
    <PublicLayout seo={corporateSeo(t("corp_title"), t("corp_hero_sub"))}>
      <section className="mp-corp-hero" style={{ backgroundImage: `url(${DEFAULT_HERO_IMAGE})` }}>
        <div className="mp-corp-hero-inner">
          <h1>{t("corp_title").toUpperCase()}</h1>
          <p>{t("corp_hero_sub")}</p>
          <a href="#inquiry" className="mp-btn mp-btn-lime" onClick={scrollToForm}>
            {t("corp_hero_cta")}
          </a>
        </div>
      </section>

      <section className="mp-section mp-corp-intro">
        <h2 className="mp-section-title">{localized(corporate.intro_title, lang)}</h2>
        <p className="mp-corp-intro-text">{localized(corporate.intro_text, lang)}</p>
      </section>

      <section className="mp-section-alt mp-dots-blue mp-corp-options" aria-labelledby="corp-options-title">
        <h2 className="mp-section-title" id="corp-options-title">{t("corp_options_title")}</h2>
        <ul className="mp-corp-options-grid">
          {(corporate.options || []).map((option, i) => (
            <li key={i} className="mp-corp-option">
              {option.icon && <span className="mp-corp-option-icon" aria-hidden="true">{option.icon}</span>}
              <h3>{localized(option.title, lang)}</h3>
              <p>{localized(option.text, lang)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mp-section mp-corp-contact" id="inquiry">
        <div className="mp-corp-contact-grid">
          <aside className="mp-corp-contact-card" aria-labelledby="corp-contact-title">
            <h2 id="corp-contact-title">{t("corp_contact_title")}</h2>
            <ul>
              <li>
                <span className="mp-corp-contact-icon" aria-hidden="true">☎</span>
                <div>
                  <span className="mp-corp-contact-label">{t("contact_phone")}</span>
                  <a href={phoneHref}>{contact.phone}</a>
                </div>
              </li>
              <li>
                <span className="mp-corp-contact-icon" aria-hidden="true">✉</span>
                <div>
                  <span className="mp-corp-contact-label">{t("contact_email")}</span>
                  <a href={`mailto:${contact.email}`}>{contact.email}</a>
                </div>
              </li>
              <li>
                <span className="mp-corp-contact-icon" aria-hidden="true">⌖</span>
                <div>
                  <span className="mp-corp-contact-label">{t("contact_address")}</span>
                  <a href={mapsHref} target="_blank" rel="noopener noreferrer">{address}</a>
                </div>
              </li>
            </ul>
          </aside>

          <div className="mp-corp-form-card">
            <h2>{t("corp_form_title")}</h2>
            <p className="mp-corp-form-sub">{t("corp_form_sub")}</p>
            <InquiryForm t={t} />
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
