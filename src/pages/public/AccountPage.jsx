import React, { useCallback, useEffect, useMemo, useState } from "react";
import PublicLayout from "../../components/landing/PublicLayout";
import { useTranslation } from "../../i18n/LanguageContext";
import { supabase, isSupabaseConfigured } from "../../services/supabaseClient";
import { claimMemberAccount } from "../../services/supabaseData";
import { formatDuration, loyaltySummary, normalizePhone } from "../../utils/memberAnalytics";
import "./AccountPage.css";

// Phone sign-in needs an SMS provider configured in Supabase Auth.
const PHONE_LOGIN_ENABLED = import.meta.env.VITE_MEMBER_PHONE_LOGIN === "true";

async function loadAccount(memberId) {
  const [member, sessions, transactions, redemptions, rewards] = await Promise.all([
    supabase.from("members").select("*").eq("id", memberId).single(),
    supabase
      .from("member_sessions")
      .select("id, started_at, ended_at, duration_seconds, amount_paid, status, table_name")
      .eq("member_id", memberId)
      .neq("status", "cancelled")
      .order("started_at", { ascending: false }),
    supabase.from("point_transactions").select("points, kind, session_id").eq("member_id", memberId),
    supabase
      .from("reward_redemptions")
      .select("id, reward_name, points_deducted, created_at")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false }),
    supabase
      .from("rewards")
      .select("id, name, description, points_required, limitations, expires_at")
      .eq("is_active", true)
      .order("points_required"),
  ]);
  for (const result of [member, sessions, transactions, redemptions, rewards]) {
    if (result.error) throw result.error;
  }
  const liveRewards = (rewards.data || []).filter(
    (r) => !r.expires_at || new Date(r.expires_at).getTime() > Date.now()
  );
  return {
    member: member.data,
    sessions: sessions.data || [],
    transactions: transactions.data || [],
    redemptions: redemptions.data || [],
    rewards: liveRewards,
  };
}

function SignIn() {
  const { t } = useTranslation();
  const [usePhone, setUsePhone] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("enter"); // enter | sent
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (isBusy || !supabase) return;
    setIsBusy(true);
    setError("");
    try {
      if (usePhone && step === "sent") {
        const { error: err } = await supabase.auth.verifyOtp({
          phone: `+${normalizePhone(phone)}`,
          token: code.trim(),
          type: "sms",
        });
        if (err) throw err;
      } else if (usePhone) {
        const { error: err } = await supabase.auth.signInWithOtp({ phone: `+${normalizePhone(phone)}` });
        if (err) throw err;
        setStep("sent");
      } else {
        const { error: err } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: `${window.location.origin}/account` },
        });
        if (err) throw err;
        setStep("sent");
      }
    } catch (err) {
      console.error("Member sign-in failed:", err);
      setError(t("acc_error"));
    } finally {
      setIsBusy(false);
    }
  };

  if (!usePhone && step === "sent") {
    return (
      <div className="acc-card acc-signin">
        <h2>{t("acc_login_title")}</h2>
        <p>
          {t("acc_link_sent")} <strong>{email}</strong>
        </p>
      </div>
    );
  }

  return (
    <form className="acc-card acc-signin" onSubmit={submit}>
      <h2>{t("acc_login_title")}</h2>
      <p>{usePhone ? t("acc_login_subtitle_phone") : t("acc_login_subtitle")}</p>
      {usePhone ? (
        <>
          <input
            type="tel"
            inputMode="tel"
            placeholder={t("acc_phone")}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={step === "sent"}
            required
          />
          {step === "sent" && (
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t("acc_code")}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
            />
          )}
        </>
      ) : (
        <input
          type="email"
          placeholder={t("acc_email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
      )}
      {error && <p className="acc-error">{error}</p>}
      <button type="submit" className="acc-btn" disabled={isBusy}>
        {usePhone ? (step === "sent" ? t("acc_verify") : t("acc_send_code")) : t("acc_send_link")}
      </button>
      {PHONE_LOGIN_ENABLED && (
        <button
          type="button"
          className="acc-link"
          onClick={() => {
            setUsePhone((v) => !v);
            setStep("enter");
            setError("");
          }}
        >
          {usePhone ? t("acc_use_email") : t("acc_use_phone")}
        </button>
      )}
    </form>
  );
}

function Account({ data, onSignOut }) {
  const { t, lang } = useTranslation();
  const { member, sessions, transactions, redemptions, rewards } = data;
  const loyalty = useMemo(() => loyaltySummary(transactions, rewards), [transactions, rewards]);
  const pointsBySession = useMemo(() => {
    const map = new Map();
    transactions.forEach((tx) => {
      if (tx.session_id && (tx.kind === "earn" || tx.kind === "reversal")) {
        map.set(tx.session_id, (map.get(tx.session_id) || 0) + tx.points);
      }
    });
    return map;
  }, [transactions]);

  const locale = lang === "ka" ? "ka-GE" : "en-GB";
  const date = (iso, opts) => new Date(iso).toLocaleString(locale, { timeZone: "Asia/Tbilisi", ...opts });
  const completed = sessions.filter((s) => s.status === "completed");
  const hours = completed.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / 3600;
  const next = loyalty.nextReward;

  return (
    <div className="acc-grid">
      <section className="acc-card acc-membership">
        <div className="acc-card-head">
          <h2>{t("acc_membership")}</h2>
          <button type="button" className="acc-link" onClick={onSignOut}>{t("acc_sign_out")}</button>
        </div>
        <div className="acc-name">{member.first_name} {member.last_name}</div>
        <dl className="acc-facts">
          <div><dt>{t("acc_member_id")}</dt><dd>{member.member_code}</dd></div>
          <div>
            <dt>{t("acc_member_since")}</dt>
            <dd>{date(member.registered_at, { day: "numeric", month: "long", year: "numeric" })}</dd>
          </div>
          <div>
            <dt>{t("acc_status")}</dt>
            <dd><span className={`acc-status ${member.status}`}>{t(`acc_status_${member.status}`)}</span></dd>
          </div>
          <div>
            <dt>{t("acc_history")}</dt>
            <dd>{completed.length} · {hours.toFixed(1)} {t("acc_hours")}</dd>
          </div>
        </dl>
      </section>

      <section className="acc-card acc-loyalty">
        <h2>{t("acc_loyalty")}</h2>
        <div className="acc-points">
          <strong>{loyalty.balance}</strong>
          <span>{t("acc_points")}</span>
        </div>
        <div className="acc-lifetime">
          {t("acc_lifetime_points")}: <strong>{loyalty.lifetime}</strong>
        </div>
        {next ? (
          <div className="acc-next">
            <div className="acc-next-label">
              {t("acc_next_reward")}: <strong>{next.points_required} — {next.name}</strong>
            </div>
            <div className="acc-progress">
              <div style={{ width: `${Math.min(100, (100 * Math.max(0, loyalty.balance)) / next.points_required)}%` }} />
            </div>
            <div className="acc-progress-text">
              {loyalty.balance} / {next.points_required} ·{" "}
              {t("acc_points_to_go").replace("{n}", String(next.points_required - loyalty.balance))}
            </div>
          </div>
        ) : (
          rewards.length > 0 && <p className="acc-muted">{t("acc_all_unlocked")}</p>
        )}
      </section>

      <section className="acc-card acc-rewards">
        <h2>{t("acc_rewards")}</h2>
        {rewards.length === 0 && <p className="acc-muted">{t("acc_no_rewards")}</p>}
        <ul>
          {rewards.map((r) => {
            const available = loyalty.balance >= r.points_required;
            return (
              <li key={r.id} className={available ? "available" : ""}>
                <div>
                  <strong>{r.name}</strong>
                  {r.description && <div className="acc-muted">{r.description}</div>}
                  {r.limitations && <div className="acc-muted">{r.limitations}</div>}
                </div>
                <div className="acc-reward-points">
                  {r.points_required}
                  {available && <span>{t("acc_available")}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        {loyalty.available.length > 0 && <p className="acc-muted">{t("acc_redeem_hint")}</p>}
        {redemptions.length > 0 && (
          <>
            <h3>{t("acc_redeemed")}</h3>
            <ul className="acc-redeemed">
              {redemptions.map((r) => (
                <li key={r.id}>
                  {date(r.created_at, { day: "numeric", month: "short" })} · {r.reward_name} · −{r.points_deducted}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="acc-card acc-history">
        <h2>{t("acc_history")}</h2>
        {sessions.length === 0 ? (
          <p className="acc-muted">{t("acc_no_history")}</p>
        ) : (
          <div className="acc-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("acc_date")}</th>
                  <th>{t("acc_time")}</th>
                  <th className="num">{t("acc_duration")}</th>
                  <th className="num">{t("acc_amount")}</th>
                  <th className="num">{t("acc_points_col")}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{date(s.started_at, { day: "numeric", month: "short" })}</td>
                    <td>{date(s.started_at, { hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="num">
                      {s.status === "active" ? t("acc_playing_now") : formatDuration(s.duration_seconds)}
                    </td>
                    <td className="num">{s.amount_paid != null ? `${Number(s.amount_paid).toFixed(0)} ₾` : "—"}</td>
                    <td className="num acc-plus">
                      {pointsBySession.get(s.id) ? `+${pointsBySession.get(s.id)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default function AccountPage() {
  const { t } = useTranslation();
  // checking | signed-out | not-member | ready | error
  const [state, setState] = useState("checking");
  const [data, setData] = useState(null);

  const resolve = useCallback(async (session) => {
    if (!session) {
      setState("signed-out");
      setData(null);
      return;
    }
    try {
      const memberId = await claimMemberAccount();
      if (!memberId) {
        setState("not-member");
        return;
      }
      setData(await loadAccount(memberId));
      setState("ready");
    } catch (err) {
      console.error("Failed to load member account:", err);
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setState("error");
      return undefined;
    }
    supabase.auth.getSession().then(({ data: { session } }) => resolve(session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") return;
      // Defer: calling supabase inside this callback can deadlock the auth lock.
      setTimeout(() => resolve(session), 0);
    });
    return () => listener.subscription.unsubscribe();
  }, [resolve]);

  const signOut = () => supabase.auth.signOut();

  return (
    <PublicLayout>
      <div className="acc-page">
        <h1>{t("acc_title")}</h1>
        {state === "checking" && <p className="acc-muted">{t("acc_loading")}</p>}
        {state === "signed-out" && <SignIn />}
        {state === "error" && <p className="acc-error">{t("acc_error")}</p>}
        {state === "not-member" && (
          <div className="acc-card acc-signin">
            <p>{t("acc_not_member")}</p>
            <button type="button" className="acc-link" onClick={signOut}>{t("acc_sign_out")}</button>
          </div>
        )}
        {state === "ready" && data && <Account data={data} onSignOut={signOut} />}
      </div>
    </PublicLayout>
  );
}
