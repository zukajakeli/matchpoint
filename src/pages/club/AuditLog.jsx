import React, { useEffect, useState } from "react";
import { fetchAuditLog, memberErrorMessage } from "../../services/supabaseData";

const ENTITY_LABELS = {
  members: "Member",
  member_sessions: "Session",
  point_transactions: "Points",
  rewards: "Reward",
  reward_redemptions: "Redemption",
  loyalty_settings: "Loyalty settings",
  venue_settings: "Prices & hours",
  staff_members: "Staff access",
};

const IGNORED_KEYS = new Set(["updated_at", "visit_id"]);

// "status: active → suspended, phone: … → …"
function describeChange(row) {
  if (row.action === "INSERT") {
    const d = row.new_data || {};
    if (row.entity === "point_transactions") return `${d.points > 0 ? "+" : ""}${d.points} (${d.kind}) ${d.reason || ""}`;
    if (row.entity === "members") return `${d.first_name} ${d.last_name} registered (${d.member_code})`;
    if (row.entity === "reward_redemptions") return `${d.reward_name} · −${d.points_deducted}`;
    if (row.entity === "member_sessions") return `Started on ${d.table_name || "a table"}`;
    return d.name || "created";
  }
  if (row.action === "DELETE") return "deleted";
  const before = row.old_data || {};
  const after = row.new_data || {};
  return Object.keys(after)
    .filter((k) => !IGNORED_KEYS.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => {
      const show = (v) => (v === null || v === undefined ? "—" : typeof v === "object" ? "…" : String(v));
      return `${k}: ${show(before[k])} → ${show(after[k])}`;
    })
    .join(", ");
}

export default function AuditLog() {
  const [rows, setRows] = useState([]);
  const [entity, setEntity] = useState("");
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    fetchAuditLog({ entity: entity || undefined })
      .then(setRows)
      .catch((err) => setError(memberErrorMessage(err)));
  }, [entity]);

  return (
    <div className="club-panel">
      <div className="club-toolbar">
        <select value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Filter">
          <option value="">Everything</option>
          {Object.entries(ENTITY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <span className="club-muted">Latest 200 changes</span>
      </div>
      {error && <p className="club-error">{error}</p>}
      <div className="club-table-wrap">
        <table className="club-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="club-empty">Nothing logged yet.</td></tr>
            )}
            {rows.map((row) => (
              <React.Fragment key={row.id}>
                <tr className="club-row" onClick={() => setOpenId(openId === row.id ? null : row.id)}>
                  <td className="nowrap">
                    {new Date(row.created_at).toLocaleString("en-GB", { timeZone: "Asia/Tbilisi" })}
                  </td>
                  <td>{row.actor_email || "system"}</td>
                  <td className="nowrap">
                    {ENTITY_LABELS[row.entity] || row.entity} · {row.action.toLowerCase()}
                  </td>
                  <td>{describeChange(row)}</td>
                </tr>
                {openId === row.id && (
                  <tr>
                    <td colSpan={4}>
                      <pre className="club-json">{JSON.stringify({ before: row.old_data, after: row.new_data }, null, 2)}</pre>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
