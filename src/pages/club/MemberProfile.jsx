import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js";
import {
  fetchMemberProfile,
  fetchRewards,
  updateMember,
  adjustMemberPoints,
  redeemReward,
  adminSaveMemberSession,
  cancelMemberSession,
  memberErrorMessage,
} from "../../services/supabaseData";
import {
  computeMemberStats,
  formatDate,
  formatDuration,
  formatPhone,
  loyaltySummary,
} from "../../utils/memberAnalytics";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const TZ = "Asia/Tbilisi";

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

// ISO → value for <input type="datetime-local"> in venue time (UTC+4)
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 4 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}

function fromLocalInput(value) {
  return value ? new Date(`${value}:00+04:00`).toISOString() : null;
}

function Stat({ label, value, hint }) {
  return (
    <div className="club-stat">
      <div className="club-stat-value">{value}</div>
      <div className="club-stat-label">{label}</div>
      {hint && <div className="club-stat-hint">{hint}</div>}
    </div>
  );
}

export default function MemberProfile({ clubBase, isSuperadmin }) {
  const { memberId } = useParams();
  const [data, setData] = useState(null);
  const [rewards, setRewards] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editingSession, setEditingSession] = useState(null); // session row, or {} for new

  const load = useCallback(async () => {
    try {
      const [profile, activeRewards] = await Promise.all([fetchMemberProfile(memberId), fetchRewards()]);
      setData(profile);
      setRewards(activeRewards);
    } catch (err) {
      setError(memberErrorMessage(err));
    }
  }, [memberId]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(
    () => (data ? computeMemberStats(data.sessions, data.visits) : null),
    [data]
  );
  const loyalty = useMemo(
    () => (data ? loyaltySummary(data.transactions, rewards) : null),
    [data, rewards]
  );
  const pointsBySession = useMemo(() => {
    const map = new Map();
    (data?.transactions || []).forEach((t) => {
      if (t.session_id && (t.kind === "earn" || t.kind === "reversal")) {
        map.set(t.session_id, (map.get(t.session_id) || 0) + t.points);
      }
    });
    return map;
  }, [data]);

  const run = async (action, successMessage) => {
    setError("");
    setNotice("");
    try {
      await action();
      if (successMessage) setNotice(successMessage);
      await load();
      return true;
    } catch (err) {
      setError(memberErrorMessage(err));
      return false;
    }
  };

  if (error && !data) return <div className="club-panel"><p className="club-error">{error}</p></div>;
  if (!data) return <div className="club-panel"><p className="club-empty">Loading member…</p></div>;

  const { member, sessions, visits, transactions, redemptions } = data;
  const trend = stats.monthlyTrend;

  return (
    <div className="club-panel club-profile">
      <Link to={clubBase} className="club-back">← All members</Link>

      {/* ── Customer information ── */}
      <section className="club-card">
        {isEditing ? (
          <MemberEditForm
            member={member}
            onCancel={() => setIsEditing(false)}
            onSave={async (fields) => {
              if (await run(() => updateMember(member.id, fields), "Member updated.")) setIsEditing(false);
            }}
          />
        ) : (
          <div className="club-profile-head">
            <div>
              <h2>
                {member.first_name} {member.last_name}
                <span className={`club-status status-${member.status}`}>{member.status}</span>
              </h2>
              <div className="club-profile-meta">
                <span>{member.member_code}</span>
                <span>{formatPhone(member.phone)}</span>
                {member.email && <span>{member.email}</span>}
                {member.personal_id && <span>ID {member.personal_id}</span>}
                <span>Member since {formatDate(member.registered_at)}</span>
                {member.auth_user_id && <span>Website account linked</span>}
              </div>
              {member.notes && <p className="club-notes">{member.notes}</p>}
            </div>
            {isSuperadmin && (
              <button type="button" className="club-btn" onClick={() => setIsEditing(true)}>
                Edit
              </button>
            )}
          </div>
        )}
      </section>

      {error && <p className="club-error">{error}</p>}
      {notice && <p className="club-notice">{notice}</p>}

      {/* ── Current statistics ── */}
      <section className="club-stats">
        <Stat label="Visits this month" value={stats.visitsThisMonth} />
        <Stat label="Visits this year" value={stats.visitsThisYear} />
        <Stat label="Lifetime visits" value={stats.lifetimeVisits} hint={`${stats.sessionsCompleted} sessions`} />
        <Stat label="Hours this month" value={stats.hoursThisMonth.toFixed(1)} />
        <Stat label="Lifetime hours" value={stats.lifetimeHours.toFixed(1)} />
        <Stat label="Current points" value={loyalty.balance} />
        <Stat label="Lifetime points" value={loyalty.lifetime} />
        <Stat
          label="Last visit"
          value={stats.lastVisitAt ? formatDate(stats.lastVisitAt) : "—"}
          hint={stats.daysSinceLastVisit !== null ? `${stats.daysSinceLastVisit} days ago` : null}
        />
      </section>

      {/* ── Playing behaviour ── */}
      <section className="club-card">
        <h3>Playing behaviour</h3>
        <div className="club-behaviour">
          <div><span>Most common day</span><strong>{stats.mostCommonDay || "—"}</strong></div>
          <div><span>Most common start</span><strong>{stats.mostCommonHour || "—"}</strong></div>
          <div><span>Usual time range</span><strong>{stats.mostCommonTimeRange || "—"}</strong></div>
          <div>
            <span>Weekday / weekend visits</span>
            <strong>{stats.weekdayVisits} / {stats.weekendVisits}</strong>
          </div>
          <div>
            <span>Average session</span>
            <strong>{stats.averageSessionSeconds ? formatDuration(stats.averageSessionSeconds) : "—"}</strong>
          </div>
          <div>
            <span>Visits per month</span>
            <strong>{stats.averageVisitsPerMonth ? stats.averageVisitsPerMonth.toFixed(1) : "—"}</strong>
          </div>
          <div>
            <span>Days between visits</span>
            <strong>{stats.averageDaysBetweenVisits ? stats.averageDaysBetweenVisits.toFixed(1) : "—"}</strong>
          </div>
          <div><span>Total playing hours</span><strong>{stats.lifetimeHours.toFixed(1)}</strong></div>
        </div>
        <div className="club-chart">
          <Bar
            data={{
              labels: trend.map((m) => m.label),
              datasets: [
                { label: "Visits", data: trend.map((m) => m.visits), backgroundColor: "#1c3fba", yAxisID: "y" },
                {
                  label: "Hours",
                  data: trend.map((m) => Number(m.hours.toFixed(1))),
                  backgroundColor: "#a3c75a",
                  yAxisID: "y1",
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "Visits" } },
                y1: { beginAtZero: true, position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "Hours" } },
              },
            }}
          />
        </div>
      </section>

      <div className="club-columns">
        {/* ── Rewards ── */}
        <section className="club-card">
          <h3>Rewards</h3>
          {loyalty.nextReward && (
            <div className="club-progress">
              <div className="club-progress-label">
                Next: {loyalty.nextReward.name} · {loyalty.balance} / {loyalty.nextReward.points_required}
              </div>
              <div className="club-progress-bar">
                <div style={{ width: `${Math.min(100, (100 * loyalty.balance) / loyalty.nextReward.points_required)}%` }} />
              </div>
            </div>
          )}
          {rewards.length === 0 && <p className="club-empty">No active rewards yet.</p>}
          <ul className="club-rewards">
            {rewards.map((r) => {
              const affordable = loyalty.balance >= r.points_required;
              return (
                <li key={r.id}>
                  <div>
                    <strong>{r.name}</strong> · {r.points_required} pts
                    {r.limitations && <div className="club-muted">{r.limitations}</div>}
                  </div>
                  <button
                    type="button"
                    className="club-btn club-btn-primary"
                    disabled={!affordable || member.status !== "active"}
                    onClick={() => {
                      if (window.confirm(`Redeem "${r.name}" for ${r.points_required} points?`)) {
                        run(() => redeemReward(member.id, r.id), `Redeemed ${r.name}.`);
                      }
                    }}
                  >
                    Redeem
                  </button>
                </li>
              );
            })}
          </ul>
          {redemptions.length > 0 && (
            <>
              <h4>Redeemed</h4>
              <ul className="club-list">
                {redemptions.map((r) => (
                  <li key={r.id}>
                    {formatDateTime(r.created_at)} · {r.reward_name} · −{r.points_deducted}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* ── Points ── */}
        <section className="club-card">
          <h3>Points history</h3>
          {isSuperadmin && (
            <PointsAdjustForm
              onSubmit={(points, reason) =>
                run(() => adjustMemberPoints(member.id, points, reason), `Points ${points > 0 ? "added" : "deducted"}.`)
              }
            />
          )}
          <ul className="club-list club-ledger">
            {transactions.length === 0 && <li className="club-muted">No points yet.</li>}
            {transactions.map((t) => (
              <li key={t.id}>
                <span className="club-muted">{formatDateTime(t.created_at)}</span>
                <span>{t.reason || t.kind}</span>
                <span className={`club-points ${t.points > 0 ? "plus" : "minus"}`}>
                  {t.points > 0 ? `+${t.points}` : t.points}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* ── Sessions ── */}
      <section className="club-card">
        <div className="club-card-head">
          <h3>Sessions ({sessions.length}) · {visits.length} visits</h3>
          {isSuperadmin && (
            <button type="button" className="club-btn" onClick={() => setEditingSession({})}>
              + Add missed session
            </button>
          )}
        </div>
        {editingSession && (
          <SessionEditForm
            session={editingSession}
            onCancel={() => setEditingSession(null)}
            onSave={async (fields) => {
              const ok = await run(
                () => adminSaveMemberSession({ sessionId: editingSession.id, memberId: member.id, ...fields }),
                editingSession.id ? "Session corrected — points recalculated." : "Session added."
              );
              if (ok) setEditingSession(null);
            }}
          />
        )}
        <div className="club-table-wrap">
          <table className="club-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Table</th>
                <th className="num">Duration</th>
                <th className="num">Amount</th>
                <th className="num">Points</th>
                <th>Status</th>
                {isSuperadmin && <th />}
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={8} className="club-empty">No sessions yet — they appear when this member plays.</td>
                </tr>
              )}
              {sessions.map((s) => (
                <tr key={s.id} className={s.status === "cancelled" ? "club-row-muted" : ""}>
                  <td className="nowrap">{formatDate(s.started_at)}</td>
                  <td className="nowrap">
                    {formatTime(s.started_at)}–{s.ended_at ? formatTime(s.ended_at) : "…"}
                  </td>
                  <td>{s.table_name || "—"}</td>
                  <td className="num">{s.duration_seconds != null ? formatDuration(s.duration_seconds) : "—"}</td>
                  <td className="num">{s.amount_paid != null ? `${Number(s.amount_paid).toFixed(2)} ₾` : "—"}</td>
                  <td className="num">{pointsBySession.get(s.id) ? `+${pointsBySession.get(s.id)}` : "—"}</td>
                  <td>
                    <span className={`club-status status-${s.status}`}>
                      {s.status === "active" ? "playing" : s.status}
                    </span>
                  </td>
                  {isSuperadmin && (
                    <td className="nowrap">
                      {s.status !== "active" && (
                        <button type="button" className="club-link" onClick={() => setEditingSession(s)}>
                          Edit
                        </button>
                      )}
                      {s.status !== "cancelled" && (
                        <button
                          type="button"
                          className="club-link danger"
                          onClick={() => {
                            const reason = window.prompt("Why is this session being voided?");
                            if (reason) run(() => cancelMemberSession(s.id, reason), "Session voided — points reversed.");
                          }}
                        >
                          Void
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MemberEditForm({ member, onSave, onCancel }) {
  const [fields, setFields] = useState({
    first_name: member.first_name,
    last_name: member.last_name,
    phone: member.phone,
    email: member.email || "",
    personal_id: member.personal_id || "",
    status: member.status,
    notes: member.notes || "",
  });
  const set = (key) => (e) => setFields((prev) => ({ ...prev, [key]: e.target.value }));
  return (
    <form
      className="club-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(fields);
      }}
    >
      <label>First name<input value={fields.first_name} onChange={set("first_name")} required /></label>
      <label>Last name<input value={fields.last_name} onChange={set("last_name")} required /></label>
      <label>Phone<input value={fields.phone} onChange={set("phone")} required /></label>
      <label>Email<input type="email" value={fields.email} onChange={set("email")} /></label>
      <label>Personal ID<input value={fields.personal_id} onChange={set("personal_id")} /></label>
      <label>
        Status
        <select value={fields.status} onChange={set("status")}>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </label>
      <label className="wide">Notes<textarea rows={2} value={fields.notes} onChange={set("notes")} /></label>
      <div className="club-form-actions wide">
        <button type="button" className="club-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="club-btn club-btn-primary">Save member</button>
      </div>
    </form>
  );
}

function PointsAdjustForm({ onSubmit }) {
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  return (
    <form
      className="club-inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const value = parseInt(points, 10);
        if (!value || !reason.trim()) return;
        if (await onSubmit(value, reason.trim())) {
          setPoints("");
          setReason("");
        }
      }}
    >
      <input
        type="number"
        placeholder="± points"
        value={points}
        onChange={(e) => setPoints(e.target.value)}
        required
      />
      <input placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} required />
      <button type="submit" className="club-btn">Adjust</button>
    </form>
  );
}

function SessionEditForm({ session, onSave, onCancel }) {
  const [fields, setFields] = useState({
    startedAt: toLocalInput(session.started_at),
    endedAt: toLocalInput(session.ended_at),
    tableName: session.table_name || "",
    tableId: session.table_id ?? "",
    amountPaid: session.amount_paid ?? "",
    reason: "",
  });
  const set = (key) => (e) => setFields((prev) => ({ ...prev, [key]: e.target.value }));
  return (
    <form
      className="club-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          startedAt: fromLocalInput(fields.startedAt),
          endedAt: fromLocalInput(fields.endedAt),
          tableName: fields.tableName,
          tableId: fields.tableId === "" ? null : Number(fields.tableId),
          amountPaid: fields.amountPaid,
          reason: fields.reason,
        });
      }}
    >
      <label>Start (venue time)<input type="datetime-local" value={fields.startedAt} onChange={set("startedAt")} required /></label>
      <label>End (venue time)<input type="datetime-local" value={fields.endedAt} onChange={set("endedAt")} required /></label>
      <label>Table name<input value={fields.tableName} onChange={set("tableName")} placeholder="Table 4" /></label>
      <label>Table #<input type="number" value={fields.tableId} onChange={set("tableId")} /></label>
      <label>Amount paid (₾)<input type="number" step="0.01" min="0" value={fields.amountPaid} onChange={set("amountPaid")} required /></label>
      <label>Reason<input value={fields.reason} onChange={set("reason")} placeholder="e.g. timer stopped by mistake" /></label>
      <p className="club-muted wide">
        Duration is taken from start → end. Points are recalculated with the current loyalty rules.
      </p>
      <div className="club-form-actions wide">
        <button type="button" className="club-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="club-btn club-btn-primary">
          {session.id ? "Save correction" : "Add session"}
        </button>
      </div>
    </form>
  );
}
