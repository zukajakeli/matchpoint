import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n/LanguageContext";
import PublicLayout from "../../components/landing/PublicLayout";
import { isSupabaseConfigured } from "../../services/supabaseClient";
import { applyWc, fetchWcSlots, wcErrorCode, WC_LEVELS } from "../../services/supabase/womensClubApi";
import { slotState, slotTime, validateWcForm, weekdayName } from "../../utils/womensClub";
import { pageSeo } from "../../seo/seo";
import "./WomensClubPage.css";

// Unlisted application page shared in the club's WhatsApp group: not in
// any menu, not in the sitemap, and marked noindex (also by vercel.json).
// No booking or payment: each woman applies once, for one weekly time.

const EMPTY = { slotId: "", firstName: "", lastName: "", phone: "", email: "", level: "" };

const SERVER_ERRORS = {
  SLOT_FULL: "wc_err_full",
  SLOT_CLOSED: "wc_err_closed",
  SLOT_NOT_FOUND: "wc_err_closed",
  ALREADY_APPLIED: "wc_err_duplicate",
  RATE_LIMITED: "wc_err_rate",
};
const SERVER_FIELD_ERRORS = {
  NAME_REQUIRED: ["firstName", "wc_err_required"],
  NAME_TOO_LONG: ["firstName", "wc_err_required"],
  INVALID_PHONE: ["phone", "wc_err_phone"],
  INVALID_EMAIL: ["email", "wc_err_email"],
  INVALID_LEVEL: ["level", "wc_err_level"],
};

function SlotOption({ slot, selected, onSelect, lang, t }) {
  const state = slotState(slot);
  const disabled = state !== "open";
  const few = state === "open" && slot.spots_left <= 3;
  const label =
    state === "full"
      ? t("wc_full")
      : state === "closed"
        ? t("wc_closed")
        : slot.spots_left === 1
          ? t("wc_spot_left")
          : t("wc_spots_left").replace("{n}", slot.spots_left);

  return (
    <label className={`wc-session ${selected ? "is-selected" : ""} ${disabled ? "is-disabled" : ""}`}>
      <input type="radio" name="slotId" value={slot.id} checked={selected} disabled={disabled} onChange={() => onSelect(slot.id)} />
      <span className="wc-session-when">
        <span className="wc-session-day">{weekdayName(slot.weekday, lang)}</span>
      </span>
      <span className="wc-session-time">{slotTime(slot)}</span>
      <span className={`wc-session-spots ${disabled ? "none" : few ? "few" : ""}`}>{label}</span>
    </label>
  );
}

export default function WomensClubPage() {
  const { t, lang } = useTranslation();
  const [slots, setSlots] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null); // { name, slot }
  const formRef = useRef(null);
  const doneRef = useRef(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoadError(true);
      setSlots([]);
      return;
    }
    try {
      setSlots(await fetchWcSlots());
      setLoadError(false);
    } catch {
      setLoadError(true);
      setSlots((prev) => prev || []);
    }
  }, []);

  useEffect(() => {
    load();
    // Places change while the page sits open in WhatsApp's browser.
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  // A chosen time that has since filled up is unselected.
  useEffect(() => {
    if (!form.slotId || !slots) return;
    const slot = slots.find((s) => s.id === form.slotId);
    if (!slot || slotState(slot) !== "open") setForm((f) => ({ ...f, slotId: "" }));
  }, [slots, form.slotId]);

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
    const el =
      formRef.current?.querySelector(`[name="${field}"]:not(:disabled)`) ||
      formRef.current?.querySelector(`[data-field="${field}"]`);
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
      const result = await applyWc({
        slotId: form.slotId,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        level: form.level,
      });
      setDone({ name: form.firstName.trim(), slot: result || slots?.find((s) => s.id === form.slotId) });
      setForm(EMPTY);
    } catch (err) {
      const code = wcErrorCode(err);
      if (SERVER_FIELD_ERRORS[code]) {
        const [field, key] = SERVER_FIELD_ERRORS[code];
        setErrors({ [field]: key });
        setMessage(t("wc_err_fields"));
        focusField(field);
      } else {
        setMessage(t(SERVER_ERRORS[code] || "wc_err_generic"));
        if (["SLOT_FULL", "SLOT_CLOSED", "SLOT_NOT_FOUND"].includes(code)) {
          await load();
          focusField("slotId");
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

  const seo = pageSeo(t("wc_title"), t("wc_seo_desc"), "/womens-club", { noindex: true });

  if (done) {
    return (
      <PublicLayout seo={seo}>
        <div className="wc-page">
          <div className="wc-card wc-done" role="status" tabIndex={-1} ref={doneRef}>
            <div className="wc-done-icon" aria-hidden="true">✓</div>
            <h1>{t("wc_done_title")}</h1>
            <p>{t("wc_done_text").replace("{name}", done.name)}</p>
            {done.slot && (
              <div className="wc-done-session">
                <span className="wc-done-day">{weekdayName(done.slot.weekday, lang)}</span>
                <span className="wc-done-time">{slotTime(done.slot)}</span>
              </div>
            )}
            <p className="wc-done-where">{t("wc_done_where")}</p>
          </div>
        </div>
      </PublicLayout>
    );
  }

  const anyOpen = slots?.some((s) => slotState(s) === "open");

  return (
    <PublicLayout seo={seo}>
      <div className="wc-page">
        <header className="wc-hero">
          <h1>{t("wc_title")}</h1>
          <p>{t("wc_intro")}</p>
        </header>

        <form className="wc-card" onSubmit={onSubmit} noValidate ref={formRef}>
          <fieldset className="wc-step" data-field="slotId" tabIndex={-1}>
            <legend><span className="wc-step-num">1</span>{t("wc_step_slot")}</legend>
            {slots === null && <p className="wc-muted">{t("wc_loading")}</p>}
            {slots && loadError && <p className="wc-error-box">{t("wc_load_error")}</p>}
            {slots && !loadError && slots.length === 0 && <p className="wc-muted">{t("wc_no_slots")}</p>}
            {slots && slots.length > 0 && (
              <div className="wc-sessions" role="radiogroup">
                {slots.map((slot) => (
                  <SlotOption key={slot.id} slot={slot} selected={form.slotId === slot.id} onSelect={(id) => set("slotId", id)} lang={lang} t={t} />
                ))}
              </div>
            )}
            {errors.slotId && <span className="wc-error">{t(errors.slotId)}</span>}
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

          <button type="submit" className="wc-submit" disabled={sending || (slots && !anyOpen)}>
            {sending ? t("wc_sending") : t("wc_submit")}
          </button>
        </form>
      </div>
    </PublicLayout>
  );
}
