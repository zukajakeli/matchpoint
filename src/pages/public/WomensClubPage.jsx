import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n/LanguageContext";
import PublicLayout from "../../components/landing/PublicLayout";
import { isSupabaseConfigured } from "../../services/supabaseClient";
import { fetchWcSchedule, registerWc, wcErrorCode, WC_LEVELS } from "../../services/supabase/womensClubApi";
import { sessionParts, sessionState, validateWcForm } from "../../utils/womensClub";
import { pageSeo } from "../../seo/seo";
import "./WomensClubPage.css";

// Women's Social Club registration: free weekly sessions, in the site
// menu and shared by link in the club's WhatsApp group. Nothing here
// touches table bookings or payments; see womens_club_* in schema.sql.

const EMPTY = { firstName: "", lastName: "", phone: "", email: "", level: "", sessionId: "" };

const SERVER_ERRORS = {
  SESSION_FULL: "wc_err_full",
  SESSION_CLOSED: "wc_err_closed",
  SESSION_STARTED: "wc_err_closed",
  SESSION_NOT_FOUND: "wc_err_closed",
  ALREADY_REGISTERED: "wc_err_duplicate",
  RATE_LIMITED: "wc_err_rate",
};
const SERVER_FIELD_ERRORS = {
  NAME_REQUIRED: ["firstName", "wc_err_required"],
  NAME_TOO_LONG: ["firstName", "wc_err_required"],
  INVALID_PHONE: ["phone", "wc_err_phone"],
  INVALID_EMAIL: ["email", "wc_err_email"],
  INVALID_LEVEL: ["level", "wc_err_level"],
};

function SessionOption({ session, selected, onSelect, lang, t }) {
  const state = sessionState(session);
  const { weekday, day, time } = sessionParts(session.starts_at, lang);
  const disabled = state !== "open";
  const few = state === "open" && session.spots_left <= 3;
  const label =
    state === "full"
      ? t("wc_full")
      : state === "closed"
        ? t("wc_closed")
        : session.spots_left === 1
          ? t("wc_spot_left")
          : t("wc_spots_left").replace("{n}", session.spots_left);

  return (
    <label className={`wc-session ${selected ? "is-selected" : ""} ${disabled ? "is-disabled" : ""}`}>
      <input
        type="radio"
        name="sessionId"
        value={session.id}
        checked={selected}
        disabled={disabled}
        onChange={() => onSelect(session.id)}
      />
      <span className="wc-session-when">
        <span className="wc-session-day">{weekday}</span>
        <span className="wc-session-date">{day}</span>
      </span>
      <span className="wc-session-time">{time}</span>
      <span className={`wc-session-spots ${disabled ? "none" : few ? "few" : ""}`}>{label}</span>
    </label>
  );
}

export default function WomensClubPage() {
  const { t, lang } = useTranslation();
  const [sessions, setSessions] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null); // { name, startsAt }
  const formRef = useRef(null);
  const doneRef = useRef(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoadError(true);
      setSessions([]);
      return [];
    }
    try {
      const rows = await fetchWcSchedule();
      setSessions(rows);
      setLoadError(false);
      return rows;
    } catch {
      setLoadError(true);
      setSessions((prev) => prev || []);
      return null;
    }
  }, []);

  useEffect(() => {
    load();
    // Places change while the page sits open in WhatsApp's browser.
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  // A selected session that has since filled up is unselected.
  useEffect(() => {
    if (!form.sessionId || !sessions) return;
    const s = sessions.find((x) => x.id === form.sessionId);
    if (!s || sessionState(s) !== "open") setForm((f) => ({ ...f, sessionId: "" }));
  }, [sessions, form.sessionId]);

  useEffect(() => {
    if (!done) return;
    window.scrollTo(0, 0);
    doneRef.current?.focus({ preventScroll: true });
  }, [done]);

  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
    setMessage("");
  };

  const focusField = (field) => {
    const el = formRef.current?.querySelector(`[name="${field}"]:not(:disabled)`) || formRef.current?.querySelector(`[data-field="${field}"]`);
    el?.focus?.();
    el?.scrollIntoView?.({ block: "center" });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (sending) return;
    const found = validateWcForm(form);
    if (Object.keys(found).length) {
      setErrors(found);
      setMessage(t("wc_err_fields"));
      focusField(Object.keys(EMPTY).find((f) => found[f]));
      return;
    }
    setSending(true);
    setMessage("");
    try {
      const result = await registerWc({
        sessionId: form.sessionId,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        level: form.level,
      });
      const session = sessions?.find((s) => s.id === form.sessionId);
      setDone({ name: form.firstName.trim(), startsAt: result?.starts_at || session?.starts_at });
      load();
    } catch (err) {
      const code = wcErrorCode(err);
      if (SERVER_FIELD_ERRORS[code]) {
        const [field, key] = SERVER_FIELD_ERRORS[code];
        setErrors({ [field]: key });
        setMessage(t("wc_err_fields"));
        focusField(field);
      } else {
        setMessage(t(SERVER_ERRORS[code] || "wc_err_generic"));
        if (["SESSION_FULL", "SESSION_CLOSED", "SESSION_STARTED", "SESSION_NOT_FOUND"].includes(code)) {
          await load();
          focusField("sessionId");
        }
      }
    }
    setSending(false);
  };

  const field = (name, label, props = {}) => (
    <div className={`wc-field ${errors[name] ? "has-error" : ""}`}>
      <label htmlFor={`wc-${name}`}>{label}</label>
      <input
        id={`wc-${name}`}
        name={name}
        value={form[name]}
        onChange={(e) => set(name, e.target.value)}
        aria-invalid={errors[name] ? "true" : undefined}
        aria-describedby={errors[name] ? `wc-${name}-err` : undefined}
        {...props}
      />
      {errors[name] && <span className="wc-error" id={`wc-${name}-err`}>{t(errors[name])}</span>}
    </div>
  );

  const seo = pageSeo(t("wc_title"), t("wc_seo_desc"), "/womens-club", { image: "/hero-tables.jpg" });

  if (done) {
    const parts = done.startsAt ? sessionParts(done.startsAt, lang) : null;
    return (
      <PublicLayout seo={seo}>
        <div className="wc-page">
          <div className="wc-card wc-done" role="status" tabIndex={-1} ref={doneRef}>
            <div className="wc-done-icon" aria-hidden="true">✓</div>
            <h1>{t("wc_done_title")}</h1>
            <p>{t("wc_done_text").replace("{name}", done.name)}</p>
            {parts && (
              <div className="wc-done-session">
                <span className="wc-done-day">{parts.weekday}, {parts.day}</span>
                <span className="wc-done-time">{parts.time}</span>
              </div>
            )}
            <p className="wc-done-where">{t("wc_done_where")}</p>
            <button
              type="button"
              className="wc-secondary"
              onClick={() => {
                setForm((f) => ({ ...f, sessionId: "" }));
                setDone(null);
              }}
            >
              {t("wc_done_another")}
            </button>
          </div>
        </div>
      </PublicLayout>
    );
  }

  const anyOpen = sessions?.some((s) => sessionState(s) === "open");

  return (
    <PublicLayout seo={seo}>
      <div className="wc-page">
        <header className="wc-hero">
          <h1>{t("wc_title")}</h1>
          <p>{t("wc_intro")}</p>
        </header>

        <form className="wc-card" onSubmit={onSubmit} noValidate ref={formRef}>
          <fieldset className="wc-step" data-field="sessionId" tabIndex={-1}>
            <legend><span className="wc-step-num">1</span>{t("wc_step_session")}</legend>
            {sessions === null && <p className="wc-muted">{t("wc_loading")}</p>}
            {sessions && loadError && <p className="wc-error-box">{t("wc_load_error")}</p>}
            {sessions && !loadError && sessions.length === 0 && <p className="wc-muted">{t("wc_no_sessions")}</p>}
            {sessions && sessions.length > 0 && (
              <div className="wc-sessions" role="radiogroup">
                {sessions.map((s) => (
                  <SessionOption
                    key={s.id}
                    session={s}
                    selected={form.sessionId === s.id}
                    onSelect={(id) => set("sessionId", id)}
                    lang={lang}
                    t={t}
                  />
                ))}
              </div>
            )}
            {errors.sessionId && <span className="wc-error">{t(errors.sessionId)}</span>}
          </fieldset>

          <fieldset className="wc-step">
            <legend><span className="wc-step-num">2</span>{t("wc_step_you")}</legend>
            <div className="wc-grid">
              {field("firstName", t("wc_first_name"), { autoComplete: "given-name", maxLength: 80 })}
              {field("lastName", t("wc_last_name"), { autoComplete: "family-name", maxLength: 80 })}
              {field("phone", t("wc_phone"), { type: "tel", inputMode: "tel", autoComplete: "tel", placeholder: "5XX XX XX XX", maxLength: 20 })}
              {field("email", t("wc_email"), { type: "email", inputMode: "email", autoComplete: "email", maxLength: 200 })}
            </div>
          </fieldset>

          <fieldset className="wc-step" data-field="level" tabIndex={-1}>
            <legend><span className="wc-step-num">3</span>{t("wc_step_level")}</legend>
            <div className="wc-levels" role="radiogroup">
              {WC_LEVELS.map((level) => (
                <label key={level} className={`wc-level ${form.level === level ? "is-selected" : ""}`}>
                  <input type="radio" name="level" value={level} checked={form.level === level} onChange={() => set("level", level)} />
                  <span className="wc-level-name">{t(`wc_level_${level}`)}</span>
                  <span className="wc-level-hint">{t(`wc_level_${level}_hint`)}</span>
                </label>
              ))}
            </div>
            {errors.level && <span className="wc-error">{t(errors.level)}</span>}
          </fieldset>

          {message && <p className="wc-error-box" role="alert">{message}</p>}

          <button type="submit" className="wc-submit" disabled={sending || (sessions && !anyOpen)}>
            {sending ? t("wc_sending") : t("wc_submit")}
          </button>
        </form>
      </div>
    </PublicLayout>
  );
}
