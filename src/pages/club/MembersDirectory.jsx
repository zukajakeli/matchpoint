import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchMemberDirectory, memberErrorMessage } from "../../services/supabaseData";
import { RegisterMemberForm } from "../../components/members/MemberPicker";
import { formatDate, formatPhone, PERIODS, SEGMENT_LABELS } from "../../utils/memberAnalytics";

const COLUMNS = [
  { key: "name", label: "Member", sort: (m) => `${m.last_name} ${m.first_name}`.toLowerCase() },
  { key: "phone", label: "Phone", sort: (m) => m.phone },
  { key: "visits_period", label: "Visits (period)", numeric: true },
  { key: "visits_month", label: "This month", numeric: true },
  { key: "visits_year", label: "This year", numeric: true },
  { key: "visits_total", label: "Total visits", numeric: true },
  { key: "hours_total", label: "Hours played", numeric: true },
  { key: "last_visit_at", label: "Last visit", sort: (m) => m.last_visit_at || "" },
  { key: "points_balance", label: "Points", numeric: true },
  { key: "segment", label: "Segment" },
];

function toCsv(rows) {
  const headers = [
    "Member ID", "First name", "Last name", "Phone", "Email", "Status", "Registered",
    "Visits (period)", "Visits this month", "Visits this year", "Total visits",
    "Hours (period)", "Hours total", "Last visit", "Points", "Lifetime points", "Segment",
  ];
  const escape = (value) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = rows.map((m) =>
    [
      m.member_code, m.first_name, m.last_name, `+${m.phone}`, m.email, m.status,
      m.registered_at?.slice(0, 10), m.visits_period, m.visits_month, m.visits_year,
      m.visits_total, m.hours_period, m.hours_total, m.last_visit_at?.slice(0, 10),
      m.points_balance, m.lifetime_points, SEGMENT_LABELS[m.segment] || m.segment,
    ].map(escape).join(",")
  );
  // BOM so Excel opens Georgian names correctly
  return "﻿" + [headers.join(","), ...lines].join("\r\n");
}

export default function MembersDirectory({ clubBase }) {
  const navigate = useNavigate();
  const [period, setPeriod] = useState("month");
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("all");
  const [status, setStatus] = useState("active");
  // Most active first by default
  const [sort, setSort] = useState({ key: "visits_period", dir: "desc" });
  const [isRegistering, setIsRegistering] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setRows((await fetchMemberDirectory(period)) || []);
    } catch (err) {
      setError(memberErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const column = COLUMNS.find((c) => c.key === sort.key);
    const valueOf = column?.sort || ((m) => m[sort.key]);
    return rows
      .filter((m) => status === "all" || m.status === status)
      .filter((m) => segment === "all" || m.segment === segment)
      .filter((m) => {
        if (!q) return true;
        return (
          `${m.first_name} ${m.last_name}`.toLowerCase().includes(q) ||
          (digits.length >= 3 && m.phone.includes(digits)) ||
          m.member_code.toLowerCase().includes(q) ||
          (m.email || "").includes(q)
        );
      })
      .sort((a, b) => {
        const av = valueOf(a);
        const bv = valueOf(b);
        const cmp = column?.numeric ? Number(av) - Number(bv) : String(av).localeCompare(String(bv));
        // ties: most recent visitor first
        return (sort.dir === "asc" ? cmp : -cmp) || String(b.last_visit_at || "").localeCompare(String(a.last_visit_at || ""));
      });
  }, [rows, search, segment, status, sort]);

  const segmentCounts = useMemo(() => {
    const counts = {};
    rows.forEach((m) => {
      counts[m.segment] = (counts[m.segment] || 0) + 1;
    });
    return counts;
  }, [rows]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(visible)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `matchpoint-members-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const toggleSort = (key) =>
    setSort((prev) => ({ key, dir: prev.key === key && prev.dir === "desc" ? "asc" : "desc" }));

  return (
    <div className="club-panel">
      <div className="club-toolbar">
        <input
          className="club-search"
          type="search"
          placeholder="Search name, phone, member ID or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Ranking period">
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="active">Active members</option>
          <option value="suspended">Suspended</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All statuses</option>
        </select>
        <button type="button" className="club-btn" onClick={exportCsv} disabled={visible.length === 0}>
          Export CSV
        </button>
        <button type="button" className="club-btn club-btn-primary" onClick={() => setIsRegistering(true)}>
          + Register member
        </button>
      </div>

      <div className="club-segments">
        <button
          type="button"
          className={`club-segment ${segment === "all" ? "active" : ""}`}
          onClick={() => setSegment("all")}
        >
          All <span>{rows.length}</span>
        </button>
        {Object.entries(SEGMENT_LABELS).map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={`club-segment seg-${key} ${segment === key ? "active" : ""}`}
            onClick={() => setSegment(key)}
          >
            {label} <span>{segmentCounts[key] || 0}</span>
          </button>
        ))}
      </div>

      {isRegistering && (
        <div className="club-register">
          <RegisterMemberForm
            onCancel={() => setIsRegistering(false)}
            onRegistered={(member) => {
              setIsRegistering(false);
              navigate(`${clubBase}/members/${member.id}`);
            }}
          />
        </div>
      )}

      {error && <p className="club-error">{error}</p>}

      <div className="club-table-wrap">
        <table className="club-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={`${c.numeric ? "num" : ""} ${sort.key === c.key ? "sorted" : ""}`}
                  onClick={() => toggleSort(c.key)}
                >
                  {c.key === "visits_period" ? `Visits (${PERIODS.find((p) => p.value === period)?.label})` : c.label}
                  {sort.key === c.key && (sort.dir === "desc" ? " ▾" : " ▴")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={COLUMNS.length} className="club-empty">Loading members…</td>
              </tr>
            )}
            {!isLoading && visible.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="club-empty">No members match.</td>
              </tr>
            )}
            {!isLoading &&
              visible.map((m) => (
                <tr key={m.id} onClick={() => navigate(`${clubBase}/members/${m.id}`)} className="club-row">
                  <td>
                    <div className="club-member-name">{m.first_name} {m.last_name}</div>
                    <div className="club-member-code">{m.member_code}</div>
                  </td>
                  <td className="nowrap">{formatPhone(m.phone)}</td>
                  <td className="num strong">{m.visits_period}</td>
                  <td className="num">{m.visits_month}</td>
                  <td className="num">{m.visits_year}</td>
                  <td className="num">{m.visits_total}</td>
                  <td className="num">{Number(m.hours_total).toFixed(1)}</td>
                  <td className="nowrap">{formatDate(m.last_visit_at)}</td>
                  <td className="num strong">{m.points_balance}</td>
                  <td>
                    <span className={`club-seg-badge seg-${m.segment}`}>{SEGMENT_LABELS[m.segment] || m.segment}</span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
