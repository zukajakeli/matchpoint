import React, { useEffect, useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js";
import { fetchClubAnalytics, fetchMemberDirectory, memberErrorMessage } from "../../services/supabaseData";
import { SEGMENT_LABELS, WEEKDAY_NAMES } from "../../utils/memberAnalytics";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

function Tile({ label, value, hint }) {
  return (
    <div className="club-stat">
      <div className="club-stat-value">{value ?? "—"}</div>
      <div className="club-stat-label">{label}</div>
      {hint && <div className="club-stat-hint">{hint}</div>}
    </div>
  );
}

function peak(list, key) {
  if (!list?.length) return null;
  return list.reduce((best, item) => (item.sessions > best.sessions ? item : best), list[0])?.[key];
}

const barOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
};

export default function ClubAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const [directory, setDirectory] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([fetchClubAnalytics(), fetchMemberDirectory("all")])
      .then(([a, d]) => {
        setAnalytics(a);
        setDirectory(d || []);
      })
      .catch((err) => setError(memberErrorMessage(err)));
  }, []);

  const segments = useMemo(() => {
    const counts = {};
    directory
      .filter((m) => m.status !== "cancelled")
      .forEach((m) => {
        counts[m.segment] = (counts[m.segment] || 0) + 1;
      });
    return counts;
  }, [directory]);

  if (error) return <div className="club-panel"><p className="club-error">{error}</p></div>;
  if (!analytics) return <div className="club-panel"><p className="club-empty">Crunching the numbers…</p></div>;

  const { members, frequency, activity, retention, monthly } = analytics;
  const peakHour = peak(activity.by_hour, "hour");
  const peakDay = peak(activity.by_weekday, "dow");

  return (
    <div className="club-panel">
      <h3 className="club-section-title">Members</h3>
      <div className="club-stats">
        <Tile label="Registered members" value={members.total} />
        <Tile label="New this week" value={members.new_this_week} />
        <Tile label="New this month" value={members.new_this_month} />
        <Tile label="Active (last 30 days)" value={members.active_30d} />
        <Tile label="Returning (2+ visits)" value={members.returning} />
        <Tile label="Inactive (30+ days)" value={members.inactive_30d} />
      </div>

      <h3 className="club-section-title">Segments</h3>
      <div className="club-stats">
        {Object.entries(SEGMENT_LABELS).map(([key, label]) => (
          <Tile key={key} label={label} value={segments[key] || 0} />
        ))}
      </div>

      <h3 className="club-section-title">Visit frequency</h3>
      <div className="club-stats">
        <Tile label="Registered, never played" value={frequency.never} />
        <Tile label="Visited once" value={frequency.once} />
        <Tile label="2+ visits" value={frequency.two_plus} />
        <Tile label="5+ visits" value={frequency.five_plus} />
        <Tile label="10+ visits" value={frequency.ten_plus} />
        <Tile label="Avg visits / member" value={frequency.avg_visits_per_member} />
      </div>

      <h3 className="club-section-title">Playing activity</h3>
      <div className="club-stats">
        <Tile label="Member sessions" value={activity.sessions} hint={`${activity.visits} visits`} />
        <Tile label="Member playing hours" value={activity.hours} />
        <Tile label="Average session" value={`${activity.avg_session_minutes} min`} />
        <Tile label="Peak hour" value={peakHour != null ? `${String(peakHour).padStart(2, "0")}:00` : "—"} />
        <Tile label="Peak day" value={peakDay != null ? WEEKDAY_NAMES[peakDay] : "—"} />
        <Tile label="Members using 2+ branches" value={activity.multi_branch_members} />
      </div>
      <div className="club-columns">
        <div className="club-card">
          <h4>Sessions by start hour</h4>
          <div className="club-chart small">
            <Bar
              data={{
                labels: activity.by_hour.map((h) => String(h.hour).padStart(2, "0")),
                datasets: [{ data: activity.by_hour.map((h) => h.sessions), backgroundColor: "#1c3fba" }],
              }}
              options={barOptions}
            />
          </div>
        </div>
        <div className="club-card">
          <h4>Sessions by weekday</h4>
          <div className="club-chart small">
            <Bar
              data={{
                labels: activity.by_weekday.map((d) => WEEKDAY_NAMES[d.dow].slice(0, 3)),
                datasets: [{ data: activity.by_weekday.map((d) => d.sessions), backgroundColor: "#a3c75a" }],
              }}
              options={barOptions}
            />
          </div>
        </div>
      </div>
      {activity.by_branch.length > 1 && (
        <div className="club-card">
          <h4>By branch</h4>
          <ul className="club-list">
            {activity.by_branch.map((b) => (
              <li key={b.branch}>{b.branch}: {b.sessions} sessions · {b.hours} h</li>
            ))}
          </ul>
        </div>
      )}

      <h3 className="club-section-title">Retention</h3>
      <div className="club-stats">
        <Tile label="Came back for a 2nd visit" value={retention.returned_pct != null ? `${retention.returned_pct}%` : "—"} />
        <Tile label="Avg days to 2nd visit" value={retention.avg_days_to_second_visit} />
        <Tile label="Avg days between visits" value={retention.avg_days_between_visits} />
        <Tile label="Inactive 30+ days" value={retention.inactive_30} />
        <Tile label="Inactive 60+ days" value={retention.inactive_60} />
        <Tile label="Inactive 90+ days" value={retention.inactive_90} />
      </div>

      <div className="club-card">
        <h4>Last 12 months</h4>
        <div className="club-chart">
          <Bar
            data={{
              labels: monthly.map((m) => m.month),
              datasets: [
                { label: "Visits", data: monthly.map((m) => m.visits), backgroundColor: "#1c3fba" },
                { label: "New members", data: monthly.map((m) => m.new_members), backgroundColor: "#a3c75a" },
                { label: "Hours", data: monthly.map((m) => m.hours), backgroundColor: "#14243e" },
              ],
            }}
            options={{ ...barOptions, plugins: { legend: { display: true } } }}
          />
        </div>
      </div>
    </div>
  );
}
