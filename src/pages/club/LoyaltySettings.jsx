import React, { useEffect, useState } from "react";
import {
  fetchLoyaltySettings,
  saveLoyaltySettings,
  fetchRewards,
  saveReward,
  deleteReward,
  memberErrorMessage,
} from "../../services/supabaseData";
import { SEGMENT_LABELS } from "../../utils/memberAnalytics";

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const RULE_FIELDS = [
  { key: "per_gel", label: "Points per 1 ₾ paid", step: "0.1" },
  { key: "per_visit", label: "Points per visit", hint: "once, on the first session of a visit" },
  { key: "per_30_minutes", label: "Points per 30 min played" },
  { key: "per_hour", label: "Points per full hour played" },
];

const SEGMENT_FIELDS = [
  { key: "new_days", label: "New: registered within (days)" },
  { key: "highly_active_min_visits", label: "Highly active: at least (visits)" },
  { key: "highly_active_window_days", label: "…within the last (days)" },
  { key: "regular_min_visits", label: "Regular: at least (visits)" },
  { key: "regular_window_days", label: "…within the last (days)" },
  { key: "at_risk_prior_min_visits", label: "At risk: had at least (visits)" },
  { key: "at_risk_prior_window_days", label: "…over (days) before going quiet" },
  { key: "at_risk_silent_days", label: "…then none for (days)" },
  { key: "inactive_days", label: "Inactive: no visit for (days)" },
];

const EMPTY_BONUS = {
  name: "",
  active: true,
  days: [],
  from_hour: "",
  to_hour: "",
  starts_on: "",
  ends_on: "",
  multiplier: 2,
  extra_points: 0,
};

const EMPTY_REWARD = {
  name: "",
  description: "",
  points_required: 100,
  is_active: true,
  expires_at: "",
  limitations: "",
  max_per_member: "",
};

export default function LoyaltySettings() {
  const [settings, setSettings] = useState(null);
  const [rewards, setRewards] = useState([]);
  const [editingReward, setEditingReward] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadRewards = () => fetchRewards({ includeInactive: true }).then(setRewards);

  useEffect(() => {
    Promise.all([fetchLoyaltySettings(), loadRewards()])
      .then(([s]) => setSettings(s))
      .catch((err) => setError(memberErrorMessage(err)));
  }, []);

  if (error && !settings) return <div className="club-panel"><p className="club-error">{error}</p></div>;
  if (!settings) return <div className="club-panel"><p className="club-empty">Loading…</p></div>;

  const rules = settings.points_rules || {};
  const bonuses = rules.bonuses || [];
  const segments = settings.segments || {};

  const setRule = (key, value) =>
    setSettings((prev) => ({ ...prev, points_rules: { ...prev.points_rules, [key]: value } }));
  const setBonus = (index, patch) =>
    setRule("bonuses", bonuses.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  const setSegment = (key, value) =>
    setSettings((prev) => ({ ...prev, segments: { ...prev.segments, [key]: value } }));

  const save = async () => {
    setError("");
    setNotice("");
    const numeric = (v) => (v === "" || v === null || v === undefined ? 0 : Number(v));
    const cleanRules = {
      ...Object.fromEntries(RULE_FIELDS.map((f) => [f.key, numeric(rules[f.key])])),
      bonuses: bonuses.map((b) => ({
        name: b.name || "Bonus",
        active: b.active !== false,
        days: b.days || [],
        from_hour: b.from_hour === "" ? null : Number(b.from_hour),
        to_hour: b.to_hour === "" ? null : Number(b.to_hour),
        starts_on: b.starts_on || null,
        ends_on: b.ends_on || null,
        multiplier: b.multiplier === "" ? 1 : Number(b.multiplier),
        extra_points: numeric(b.extra_points),
      })),
    };
    try {
      const saved = await saveLoyaltySettings({
        points_rules: cleanRules,
        visit_gap_minutes: numeric(settings.visit_gap_minutes),
        segments: Object.fromEntries(SEGMENT_FIELDS.map((f) => [f.key, numeric(segments[f.key])])),
        require_personal_id: Boolean(settings.require_personal_id),
      });
      setSettings(saved);
      setNotice("Loyalty settings saved. New sessions use them from now on.");
    } catch (err) {
      setError(memberErrorMessage(err));
    }
  };

  return (
    <div className="club-panel">
      {error && <p className="club-error">{error}</p>}
      {notice && <p className="club-notice">{notice}</p>}

      <section className="club-card">
        <h3>Points formula</h3>
        <p className="club-muted">
          Points for a finished session = (the numbers below added up) × any matching bonus multipliers + bonus extra
          points, rounded down. Changes apply to sessions completed after saving.
        </p>
        <div className="club-form">
          {RULE_FIELDS.map((f) => (
            <label key={f.key}>
              {f.label}
              <input
                type="number"
                min="0"
                step={f.step || "1"}
                value={rules[f.key] ?? 0}
                onChange={(e) => setRule(f.key, e.target.value)}
              />
              {f.hint && <small className="club-muted">{f.hint}</small>}
            </label>
          ))}
        </div>

        <h4>Bonus rules</h4>
        {bonuses.length === 0 && <p className="club-muted">No bonuses. Add one for happy hours or promotions.</p>}
        {bonuses.map((b, i) => (
          <div key={i} className="club-bonus">
            <div className="club-form">
              <label>Name<input value={b.name} onChange={(e) => setBonus(i, { name: e.target.value })} /></label>
              <label>
                Multiplier
                <input type="number" step="0.1" min="0" value={b.multiplier ?? 1}
                  onChange={(e) => setBonus(i, { multiplier: e.target.value })} />
              </label>
              <label>
                Extra points
                <input type="number" min="0" value={b.extra_points ?? 0}
                  onChange={(e) => setBonus(i, { extra_points: e.target.value })} />
              </label>
              <label>
                From hour
                <input type="number" min="0" max="23" value={b.from_hour ?? ""}
                  onChange={(e) => setBonus(i, { from_hour: e.target.value })} />
              </label>
              <label>
                To hour
                <input type="number" min="1" max="24" value={b.to_hour ?? ""}
                  onChange={(e) => setBonus(i, { to_hour: e.target.value })} />
              </label>
              <label>
                Starts on
                <input type="date" value={b.starts_on || ""} onChange={(e) => setBonus(i, { starts_on: e.target.value })} />
              </label>
              <label>
                Ends on
                <input type="date" value={b.ends_on || ""} onChange={(e) => setBonus(i, { ends_on: e.target.value })} />
              </label>
            </div>
            <div className="club-days">
              {DAY_SHORT.map((d, dow) => {
                const on = (b.days || []).includes(dow);
                return (
                  <button
                    type="button"
                    key={d}
                    className={`club-day ${on ? "on" : ""}`}
                    onClick={() =>
                      setBonus(i, {
                        days: on ? b.days.filter((x) => x !== dow) : [...(b.days || []), dow].sort(),
                      })
                    }
                  >
                    {d}
                  </button>
                );
              })}
              <span className="club-muted">{(b.days || []).length === 0 ? "every day" : ""}</span>
              <label className="club-check">
                <input type="checkbox" checked={b.active !== false}
                  onChange={(e) => setBonus(i, { active: e.target.checked })} />
                Active
              </label>
              <button type="button" className="club-link danger"
                onClick={() => setRule("bonuses", bonuses.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          </div>
        ))}
        <button type="button" className="club-btn" onClick={() => setRule("bonuses", [...bonuses, { ...EMPTY_BONUS }])}>
          + Add bonus rule
        </button>
      </section>

      <section className="club-card">
        <h3>Visits & registration</h3>
        <div className="club-form">
          <label>
            Sessions on the same day count as one visit when the gap is at most (minutes)
            <input type="number" min="0" value={settings.visit_gap_minutes}
              onChange={(e) => setSettings((p) => ({ ...p, visit_gap_minutes: e.target.value }))} />
          </label>
          <label className="club-check">
            <input type="checkbox" checked={Boolean(settings.require_personal_id)}
              onChange={(e) => setSettings((p) => ({ ...p, require_personal_id: e.target.checked }))} />
            Personal ID number is required at registration
          </label>
        </div>
      </section>

      <section className="club-card">
        <h3>Member segments</h3>
        <p className="club-muted">
          Each member gets the first segment that fits, in this order:{" "}
          {Object.values(SEGMENT_LABELS).join(" → ")}.
        </p>
        <div className="club-form">
          {SEGMENT_FIELDS.map((f) => (
            <label key={f.key}>
              {f.label}
              <input type="number" min="0" value={segments[f.key] ?? ""}
                onChange={(e) => setSegment(f.key, e.target.value)} />
            </label>
          ))}
        </div>
      </section>

      <div className="club-save-bar">
        <button type="button" className="club-btn club-btn-primary" onClick={save}>
          Save loyalty settings
        </button>
      </div>

      <section className="club-card">
        <div className="club-card-head">
          <h3>Rewards</h3>
          <button type="button" className="club-btn" onClick={() => setEditingReward({ ...EMPTY_REWARD })}>
            + New reward
          </button>
        </div>
        {editingReward && (
          <RewardForm
            reward={editingReward}
            onCancel={() => setEditingReward(null)}
            onSave={async (reward) => {
              try {
                await saveReward(reward);
                setEditingReward(null);
                await loadRewards();
              } catch (err) {
                setError(memberErrorMessage(err));
              }
            }}
          />
        )}
        <div className="club-table-wrap">
          <table className="club-table">
            <thead>
              <tr>
                <th>Reward</th>
                <th className="num">Points</th>
                <th>Status</th>
                <th>Expires</th>
                <th>Limit / member</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rewards.length === 0 && (
                <tr><td colSpan={6} className="club-empty">No rewards yet.</td></tr>
              )}
              {rewards.map((r) => (
                <tr key={r.id} className={r.is_active ? "" : "club-row-muted"}>
                  <td>
                    <strong>{r.name}</strong>
                    {r.description && <div className="club-muted">{r.description}</div>}
                    {r.limitations && <div className="club-muted">{r.limitations}</div>}
                  </td>
                  <td className="num">{r.points_required}</td>
                  <td>{r.is_active ? "Active" : "Inactive"}</td>
                  <td>{r.expires_at ? r.expires_at.slice(0, 10) : "—"}</td>
                  <td>{r.max_per_member || "—"}</td>
                  <td className="nowrap">
                    <button type="button" className="club-link" onClick={() => setEditingReward({
                      ...r,
                      expires_at: r.expires_at ? r.expires_at.slice(0, 10) : "",
                      max_per_member: r.max_per_member ?? "",
                    })}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="club-link danger"
                      onClick={async () => {
                        if (!window.confirm(`Delete "${r.name}"? Past redemptions keep their record.`)) return;
                        try {
                          await deleteReward(r.id);
                          await loadRewards();
                        } catch (err) {
                          setError(memberErrorMessage(err));
                        }
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function RewardForm({ reward, onSave, onCancel }) {
  const [fields, setFields] = useState(reward);
  const set = (key) => (e) =>
    setFields((prev) => ({ ...prev, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  return (
    <form
      className="club-form club-bonus"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...fields,
          expires_at: fields.expires_at ? new Date(`${fields.expires_at}T23:59:59+04:00`).toISOString() : null,
        });
      }}
    >
      <label>Name<input value={fields.name} onChange={set("name")} required placeholder="Free 1-hour rental" /></label>
      <label>Points required<input type="number" min="1" value={fields.points_required} onChange={set("points_required")} required /></label>
      <label>Expires on<input type="date" value={fields.expires_at || ""} onChange={set("expires_at")} /></label>
      <label>Max per member<input type="number" min="1" value={fields.max_per_member ?? ""} onChange={set("max_per_member")} placeholder="unlimited" /></label>
      <label className="wide">Description<input value={fields.description || ""} onChange={set("description")} /></label>
      <label className="wide">Limitations<input value={fields.limitations || ""} onChange={set("limitations")} placeholder="e.g. weekdays before 19:00" /></label>
      <label className="club-check"><input type="checkbox" checked={Boolean(fields.is_active)} onChange={set("is_active")} />Active</label>
      <div className="club-form-actions wide">
        <button type="button" className="club-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="club-btn club-btn-primary">{reward.id ? "Save reward" : "Create reward"}</button>
      </div>
    </form>
  );
}
